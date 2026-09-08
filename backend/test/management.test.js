// 批次B一致性接口测试：分配一致性、布尔解析、课程删除守卫、纯文字任务待办、反思角色、删除预检、下一节课时间
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-management-${process.pid}-${Date.now()}.db`);
const bootstrapDb = new Database(testDbPath);
bootstrapDb.close();

process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const app = require('../app');
const db = require('../config/database');

let server;
let baseUrl;

before(async () => {
  const pwd = bcrypt.hashSync('user123', 10);
  db.prepare("INSERT INTO schools (id, name) VALUES (1, '学校A')").run();
  db.prepare("INSERT INTO schools (id, name) VALUES (2, '学校B')").run();
  db.prepare("INSERT INTO classes (id, name, school_id) VALUES (1, '一班', 1)").run();
  db.prepare("INSERT INTO classes (id, name, school_id) VALUES (2, '二班', 2)").run();

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role, school_id, class_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(1, 'admin', pwd, '管理员', 'admin', null, null);
  insertUser.run(2, 'teacher_a', pwd, '甲老师', 'teacher', 1, 1);
  insertUser.run(3, 'student_a', pwd, '学生A', 'student', 1, 1);
  insertUser.run(4, 'mentor', pwd, '执行导师', 'academic_mentor', null, null);
  insertUser.run(5, 'student_b', pwd, '学生B', 'student', 1, 1);

  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (?, ?, 'primary', 'basic', ?, ?)
  `);
  insertCourse.run(1, '公开课程', 'published', 4);
  insertCourse.run(2, '带报名的草稿', 'draft', 4);
  insertCourse.run(3, '干净草稿', 'draft', 4);
  insertCourse.run(4, '归档课程', 'archived', 4);

  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (1, 1, '第一讲', 1, 2)").run();
  db.prepare("INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload) VALUES (1, 1, '附件任务', 1, 1)").run();
  db.prepare("INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload) VALUES (2, 1, '文字任务', 2, 0)").run();

  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (1, 3, 1, 4)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (2, 3, 2, 4)").run();

  // 排课：过去2小时（不应显示）+ 未来1小时（应显示），datetime-local 的 T 分隔格式
  const past = db.prepare("SELECT replace(datetime('now','localtime','-2 hours'),' ','T') t").get().t;
  const future = db.prepare("SELECT replace(datetime('now','localtime','+1 hour'),' ','T') t").get().t;
  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id, start_at) VALUES (3, 1, '过去的课', 2, 2, ?)").run(past);
  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id, start_at) VALUES (4, 1, '未来的课', 3, 2, ?)").run(future);

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

async function login(realName) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ real_name: realName, password: 'user123' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, realName);
  return body.token;
}

// 登录接口有 IP 级限流（10 次/分钟）：同一用户只登录一次并复用 token
const tokenCache = new Map();
async function tokenFor(realName) {
  if (!tokenCache.has(realName)) tokenCache.set(realName, await login(realName));
  return tokenCache.get(realName);
}

function authed(token, method, url, body) {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('分配学生只传班级时保留原学校，跨校班级被拒绝', async () => {
  const token = await tokenFor('管理员');
  // 只传 class_id：学校保持不变，班级更新
  let res = await authed(token, 'PUT', '/api/students/3/assign', { class_id: 1 });
  assert.equal(res.status, 200);
  let row = db.prepare('SELECT school_id, class_id FROM users WHERE id = 3').get();
  assert.equal(row.school_id, 1, '学校不应被清空');
  assert.equal(row.class_id, 1);

  // 学校2 + 学校1的班级 → 400
  res = await authed(token, 'PUT', '/api/students/3/assign', { school_id: 2, class_id: 1 });
  assert.equal(res.status, 400);
  row = db.prepare('SELECT school_id, class_id FROM users WHERE id = 3').get();
  assert.equal(row.school_id, 1, '失败后不应改变学校');
});

test('updateUser 布尔 is_active 正确解析', async () => {
  const token = await tokenFor('管理员');
  const res = await authed(token, 'PUT', '/api/students/users/3', {
    real_name: '学生A', role: 'student', school_id: 1, class_id: 1, is_active: true,
  });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT is_active FROM users WHERE id = 3').get();
  assert.equal(row.is_active, 1);
});

test('已发布与归档课程禁止删除', async () => {
  const token = await tokenFor('管理员');
  let res = await authed(token, 'DELETE', '/api/courses/1', null);
  assert.equal(res.status, 403);
  res = await authed(token, 'DELETE', '/api/courses/4', null);
  assert.equal(res.status, 403);
});

test('有报名记录的草稿不可删除，干净草稿可删除', async () => {
  const token = await tokenFor('管理员');
  let res = await authed(token, 'DELETE', '/api/courses/2', null);
  assert.equal(res.status, 400);
  res = await authed(token, 'DELETE', '/api/courses/3', null);
  assert.equal(res.status, 200);
});

test('纯文字任务进入学生待办', async () => {
  const token = await tokenFor('学生A');
  const dash = await (await authed(token, 'GET', '/api/dashboard', null)).json();
  const ids = dash.pendingTasks.map((t) => t.id);
  assert.ok(ids.includes(1), '附件任务应在待办');
  assert.ok(ids.includes(2), '纯文字任务应在待办');

  const pending = await (await authed(token, 'GET', '/api/works/pending-tasks', null)).json();
  const pendingIds = pending.tasks.map((t) => t.id);
  assert.ok(pendingIds.includes(2), '作品待办也应包含纯文字任务');
});

test('反思日志仅限学生本人', async () => {
  for (const name of ['甲老师', '执行导师', '管理员']) {
    const token = await tokenFor(name);
    const res = await authed(token, 'GET', '/api/archives/reflection', null);
    assert.equal(res.status, 403, name);
  }
  const token = await tokenFor('学生A');
  const page = await authed(token, 'GET', '/api/archives/reflection', null);
  assert.equal(page.status, 200);
  const first = await authed(token, 'POST', '/api/archives/reflection', { enrollment_id: 1, difficulty: '有点难' });
  assert.equal(first.status, 200);
  const second = await authed(token, 'POST', '/api/archives/reflection', { enrollment_id: 1, difficulty: '再写一篇' });
  assert.equal(second.status, 400, '每日限一篇');
});

test('删除教师被授课课时阻塞并给出明细', async () => {
  const token = await tokenFor('管理员');
  const res = await authed(token, 'DELETE', '/api/students/users/2', null);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /授课课时/);
});

test('下一节课过滤两小时前已开始的场次', async () => {
  const token = await tokenFor('学生A');
  const dash = await (await authed(token, 'GET', '/api/dashboard', null)).json();
  assert.ok(dash.nextLesson, '应有下一节课');
  assert.equal(dash.nextLesson.lesson_title, '未来的课');
});
