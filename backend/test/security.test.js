const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-security-${process.pid}-${Date.now()}.db`);
const bootstrapDb = new Database(testDbPath);
bootstrapDb.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
bootstrapDb.close();

process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const app = require('../app');
const db = require('../config/database');
const { decodeOriginalName } = require('../helpers/fileName');

let server;
let baseUrl;

before(async () => {
  const adminPwd = bcrypt.hashSync('admin123', 10);
  const userPwd = bcrypt.hashSync('user123', 10);

  db.prepare("INSERT INTO schools (id, name, region) VALUES (1, '学校A', '北京')").run();
  db.prepare("INSERT INTO schools (id, name, region) VALUES (2, '学校B', '上海')").run();
  db.prepare("INSERT INTO classes (id, name, school_id, grade) VALUES (1, '一班', 1, '四年级')").run();
  db.prepare("INSERT INTO classes (id, name, school_id, grade) VALUES (2, '二班', 2, '五年级')").run();

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role, school_id, class_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(1, 'admin', adminPwd, '管理员', 'admin', null, null);
  insertUser.run(2, 'teacher_a', userPwd, '甲老师', 'teacher', 1, 1);
  insertUser.run(3, 'teacher_b', userPwd, '乙老师', 'teacher', 2, 2);
  insertUser.run(4, 'student_a', userPwd, '学生A', 'student', 1, 1);
  insertUser.run(5, 'student_b', userPwd, '学生B', 'student', 2, 2);

  db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (1, '公开课程', 'primary', 'basic', 'published', 1)
  `).run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id) VALUES (1, 4, 1)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id) VALUES (2, 5, 1)").run();
  db.prepare(`
    INSERT INTO works (id, student_id, enrollment_id, title, file_path)
    VALUES (1, 4, 1, '甲校作品', '/tmp/pbl-security-a.pdf')
  `).run();
  db.prepare(`
    INSERT INTO works (id, student_id, enrollment_id, title, file_path)
    VALUES (2, 5, 2, '乙校作品', '/tmp/pbl-security-b.pdf')
  `).run();

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

async function login(realName, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ real_name: realName, password }),
  });
  return { status: res.status, body: await res.json() };
}

async function getJson(url, token) {
  const res = await fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

test('健康检查正常', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
});

test('默认账号可以登录并拿到 token', async () => {
  for (const name of ['管理员', '甲老师', '学生A']) {
    const r = await login(name, name === '管理员' ? 'admin123' : 'user123');
    assert.equal(r.status, 200, name);
    assert.ok(r.body.token?.length > 0, name);
  }
});

test('移除公开 uploads 后未登录访问返回 404', async () => {
  const res = await fetch(`${baseUrl}/uploads/missing.txt`);
  assert.equal(res.status, 404);
});

test('作品下载接口未登录返回 401', async () => {
  const res = await fetch(`${baseUrl}/api/works/1/download`);
  assert.equal(res.status, 401);
});

test('教师只能看到本校学生作品', async () => {
  const { body: loginBody } = await login('甲老师', 'user123');
  const list = await getJson('/api/works', loginBody.token);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.works.map((w) => w.id), [1]);
});

test('教师不能查看或下载其他学校作品', async () => {
  const { body: loginBody } = await login('甲老师', 'user123');
  const detail = await getJson('/api/works/2', loginBody.token);
  assert.equal(detail.status, 400);
  const download = await fetch(`${baseUrl}/api/works/2/download`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  assert.equal(download.status, 403);
});

test('学生课程详情只返回自己的报名记录', async () => {
  const { body: loginBody } = await login('学生A', 'user123');
  const detail = await getJson('/api/courses/1', loginBody.token);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.enrollments.map((e) => e.student_id), [4]);
});

test('管理员课程详情返回全部报名记录', async () => {
  const { body: loginBody } = await login('管理员', 'admin123');
  const detail = await getJson('/api/courses/1', loginBody.token);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.enrollments.map((e) => e.student_id).sort(), [4, 5]);
});

test('档案树只包含学生', async () => {
  const { body: loginBody } = await login('甲老师', 'user123');
  const tree = await getJson('/api/archives/tree', loginBody.token);
  assert.equal(tree.status, 200);
  for (const school of tree.body.tree.schools || []) {
    for (const cls of school.classes || []) {
      assert.equal(cls.roles?.teacher?.length || 0, 0);
      assert.ok((cls.roles?.student || []).every((u) => u.role === 'student'));
    }
  }
});

test('中文文件名解码正确', () => {
  const original = '中文附件.pdf';
  const mangled = Buffer.from(original, 'utf8').toString('latin1');
  assert.equal(decodeOriginalName(mangled), original);
  assert.equal(decodeOriginalName('plain.pdf'), 'plain.pdf');
  assert.equal(decodeOriginalName(original), original);
});

test('schema.sql 与运行时结构同步', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  assert.match(schema, /teacher_id INTEGER/);
  assert.match(schema, /mentor_id INTEGER/);
  assert.match(schema, /force_reset_password INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS refresh_tokens/);
});
