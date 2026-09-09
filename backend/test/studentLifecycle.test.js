const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, before, after } = require('node:test');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-lifecycle-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'lifecycle-tests';
process.env.LOGIN_RATE_LIMIT_IP = '1000';
const app = require('../app');
const db = require('../config/database');
let server, base;
const tokens = {};
async function api(url, body, token = tokens.admin, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + '/api' + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}
const login = username => api('/auth/login', { username, password: 'Student!1234' }, null);
const change = (action, token = tokens.admin, id = 4, reason = '生命周期回归测试') => api(`/students/${id}/status`, { action, reason }, token);
before(async () => {
  db.prepare("INSERT INTO schools (id,name) VALUES (1,'测试学校')").run();
  db.prepare("INSERT INTO classes (id,name,school_id) VALUES (1,'测试班级',1)").run();
  for (const [i, role] of ['admin', 'teacher', 'academic_mentor', 'student', 'media'].entries()) {
    db.prepare('INSERT INTO users (id,username,real_name,role,password_hash,school_id,class_id) VALUES (?,?,?,?,?,1,1)')
      .run(i + 1, role, role, role, bcrypt.hashSync('Student!1234', 4));
  }
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (1,'历史课程','primary','basic','published',1)").run();
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (2,'新课程','primary','basic','published',1)").run();
  db.prepare('INSERT INTO enrollments (id,student_id,course_id) VALUES (1,4,1)').run();
  db.prepare("INSERT INTO works (student_id,title,file_path) VALUES (4,'历史作品','preserved.txt')").run();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin', 'teacher', 'academic_mentor', 'student', 'media']) tokens[role] = (await login(role)).body.token;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('所有状态操作仅管理员可执行，校验目标、操作及原因', async () => {
  for (const action of ['disable', 'archive', 'restore']) {
    for (const role of ['teacher', 'academic_mentor', 'student', 'media']) assert.equal((await change(action, tokens[role])).status, 403);
    assert.equal((await change(action, null)).status, 401);
  }
  assert.equal((await change('disable', tokens.admin, 1)).status, 404);
  assert.equal((await change('disable', tokens.admin, 999)).status, 404);
  for (const reason of ['', ' ', 'x'.repeat(501), {}]) assert.equal((await change('disable', tokens.admin, 4, reason)).status, 400);
  assert.equal((await change('constructor')).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_status_events').get().c, 0);
});

test('停用立即阻止登录及旧会话；恢复保留密码但不复活旧凭证', async () => {
  const old = (await login('student')).body;
  const hash = db.prepare('SELECT password_hash FROM users WHERE id=4').get().password_hash;
  assert.equal((await change('disable')).status, 200);
  assert.equal((await change('disable')).status, 400);
  assert.equal((await login('student')).status, 401);
  assert.equal((await api('/auth/me', undefined, old.token)).status, 401);
  assert.equal((await api('/auth/refresh', { refresh_token: old.refresh_token }, null)).status, 401);
  assert.equal((await change('restore')).status, 200);
  assert.equal((await api('/auth/me', undefined, old.token)).status, 401);
  assert.equal((await api('/auth/refresh', { refresh_token: old.refresh_token }, null)).status, 401);
  assert.equal((await login('student')).status, 200);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=4').get().password_hash, hash);
});

test('归档保留学习记录和授权查阅，不能选入新课、编辑启用或删除', async () => {
  const records = db.prepare('SELECT * FROM works').all();
  const enrollment = db.prepare('SELECT * FROM enrollments').all();
  assert.equal((await change('archive')).status, 200);
  assert.equal((await change('archive')).status, 400);
  assert.equal((await login('student')).status, 401);
  for (const token of [tokens.admin, tokens.teacher]) {
    const detail = await api('/students/4', undefined, token);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.student.archived_at);
    assert.equal(detail.body.works.length, 1);
    if (token === tokens.teacher) assert.equal(detail.body.statusEvents, undefined);
  }
  const details = await api('/students/4');
  assert.equal(details.body.statusEvents[0].action, 'archive');
  assert.equal(details.body.statusEvents[0].actor_username, 'admin');
  assert.equal((await api('/students/users/4', { real_name: 'student', role: 'student', school_id: 1, class_id: 1, is_active: true }, tokens.admin, 'PUT')).status, 400);
  assert.equal((await api('/students/users/4', { real_name: 'student', role: 'teacher', school_id: 1, class_id: 1 }, tokens.admin, 'PUT')).status, 400);
  for (const url of ['/students/4', '/students/users/4']) assert.equal((await api(url, undefined, tokens.admin, 'DELETE')).status, 400);
  const batch = await api('/students/users/batch-delete', { ids: [4] });
  assert.equal(batch.body.deleted.length, 0);
  assert.equal((await api('/courses/2/enroll', { student_ids: [4] })).status, 200);
  assert.deepEqual(db.prepare('SELECT * FROM works').all(), records);
  assert.deepEqual(db.prepare('SELECT * FROM enrollments').all(), enrollment);
  assert.equal((await change('restore')).status, 200);
  assert.equal(db.prepare('SELECT archived_at FROM users WHERE id=4').get().archived_at, null);
});

test('状态及会话撤销、操作记录在同一事务，记录失败则全部回滚', async () => {
  const old = (await login('student')).body;
  const before = db.prepare('SELECT * FROM users WHERE id=4').get();
  db.exec("CREATE TRIGGER fail_status BEFORE INSERT ON student_status_events BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
  try {
    assert.equal((await change('disable')).status, 500);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=4').get(), before);
    assert.equal((await api('/auth/me', undefined, old.token)).status, 200);
    assert.equal((await api('/auth/refresh', { refresh_token: old.refresh_token }, null)).status, 200);
  } finally { db.exec('DROP TRIGGER fail_status'); }
});

test('旧库增量迁移幂等且保留账号与密码，新库结构一致', () => {
  const old = new Database(':memory:');
  try {
    old.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, is_active INTEGER); INSERT INTO users VALUES (1,'old','unchanged',1); CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,name TEXT,applied_at TEXT); INSERT INTO schema_migrations VALUES(1,'baseline',''),(2,'enrollments','');");
    const { runMigrations } = require('../database/migrate');
    runMigrations(old); runMigrations(old);
    assert.deepEqual(old.prepare('SELECT * FROM users').get(), { id: 1, username: 'old', password_hash: 'unchanged', is_active: 1, archived_at: null, auth_version: 0 });
    assert.equal(old.prepare('SELECT COUNT(*) c FROM schema_migrations WHERE version=3').get().c, 1);
    assert.ok(db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'archived_at'));
  } finally { old.close(); }
});

test('恢复不绕过首次改密要求，会话版本不作为用户资料返回', async () => {
  db.prepare('UPDATE users SET force_reset_password=1 WHERE id=4').run();
  try {
    assert.equal((await change('disable')).status, 200);
    assert.equal((await change('archive')).status, 200);
    assert.equal((await change('restore')).status, 200);
    const logged = await login('student');
    assert.equal(logged.status, 200);
    assert.equal(logged.body.forceResetPassword, true);
    assert.equal((await api('/courses', undefined, logged.body.token)).status, 403);
    const detail = await api('/students/4');
    assert.equal(detail.body.student.auth_version, undefined);
  } finally { db.prepare('UPDATE users SET force_reset_password=0 WHERE id=4').run(); }
});
