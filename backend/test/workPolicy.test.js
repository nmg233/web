// 批次C：作品权限与版本治理回归测试
// 覆盖：教师本校approved范围、导师课程归属（创建者/授课人）、评审范围、删除矩阵、
//       根唯一约束、作品计数、DTO脱敏、时间轴work_id事件、遗留NULL数据可见性
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-workpolicy-${process.pid}-${Date.now()}.db`);
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
  insertUser.run(3, 'teacher_b', pwd, '乙老师', 'teacher', 2, 2);
  insertUser.run(4, 'student_a', pwd, '学生A', 'student', 1, 1);
  insertUser.run(5, 'student_b', pwd, '学生B', 'student', 2, 2);
  insertUser.run(6, 'mentor_a', pwd, '导师A', 'academic_mentor', null, null);
  insertUser.run(7, 'mentor_b', pwd, '导师B', 'academic_mentor', null, null);

  // 课程：1/2 由导师A创建；3 由管理员创建但导师B是其课时授课人（决策 D-1 归属测试）
  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (?, ?, 'primary', 'basic', 'published', ?)
  `);
  insertCourse.run(1, '导师A课程一', 6);
  insertCourse.run(2, '导师A课程二', 6);
  insertCourse.run(3, '管理员课程', 1);

  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (1, 1, '第一讲', 1, 2)").run();
  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (2, 3, '第三课讲', 1, 7)").run();
  db.prepare("INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload) VALUES (1, 1, '任务一', 1, 1)").run();
  db.prepare("INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload) VALUES (2, 1, '任务二', 2, 1)").run();
  db.prepare("INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload) VALUES (3, 1, '文字任务', 3, 0)").run();

  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (1, 4, 1, 6)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (2, 4, 2, 6)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (3, 4, 3, 1)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (4, 5, 2, 6)").run();

  const insertWork = db.prepare(`
    INSERT INTO works (id, student_id, enrollment_id, task_id, title, file_path, review_status, parent_work_id, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertWork.run(1, 4, 1, 1, '甲校已通过作品', '/tmp/pbl-w1.pdf', 'approved', null, 1);
  insertWork.run(2, 4, 1, 2, '甲校待审作品', '/tmp/pbl-w2.pdf', 'pending', null, 1);
  insertWork.run(3, 4, 1, 2, '甲校被打回版本', '/tmp/pbl-w3.pdf', 'rejected', 2, 2);
  insertWork.run(4, 5, 4, null, '乙校已通过作品', '/tmp/pbl-w4.pdf', 'approved', null, 1);
  insertWork.run(5, 4, 3, null, '管理员课程作品', '/tmp/pbl-w5.pdf', 'pending', null, 1);
  insertWork.run(6, 4, null, null, '遗留无课程作品', '/tmp/pbl-w6.pdf', 'approved', null, 1);

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

test('教师作品列表仅本校已通过作品', async () => {
  const tokenA = await tokenFor('甲老师');
  const listA = await (await authed(tokenA, 'GET', '/api/works', null)).json();
  assert.deepEqual(listA.works.map((w) => w.id), [1], '甲老师应只看到本校approved作品');

  const tokenB = await tokenFor('乙老师');
  const listB = await (await authed(tokenB, 'GET', '/api/works', null)).json();
  assert.deepEqual(listB.works.map((w) => w.id), [4], '乙老师应只看到本校approved作品');
});

test('教师详情/下载限本校已通过，历史版本仅approved', async () => {
  const token = await tokenFor('甲老师');
  assert.equal((await authed(token, 'GET', '/api/works/4', null)).status, 403, '跨校approved不可看');
  assert.equal((await authed(token, 'GET', '/api/works/2', null)).status, 403, '本校pending不可看');
  assert.equal((await authed(token, 'GET', '/api/works/4/download', null)).status, 403, '跨校不可下载');

  const detail = await (await authed(token, 'GET', '/api/works/1', null)).json();
  assert.deepEqual(detail.versions.map((v) => v.id), [1]);
});

test('教师Dashboard动态仅公开作品', async () => {
  const token = await tokenFor('甲老师');
  const dash = await (await authed(token, 'GET', '/api/dashboard', null)).json();
  assert.ok(dash.recentWorks.every((w) => w.review_status === 'approved'));
});

test('学生Dashboard作品DTO不含file_path', async () => {
  const token = await tokenFor('学生A');
  const dash = await (await authed(token, 'GET', '/api/dashboard', null)).json();
  assert.ok(dash.myCourses.every((c) => (c.recentWorks || []).every((w) => !('file_path' in w))));
});

test('导师作品列表按课程归属（创建者或授课人）', async () => {
  const tokenA = await tokenFor('导师A');
  const listA = await (await authed(tokenA, 'GET', '/api/works', null)).json();
  const idsA = listA.works.map((w) => w.id).sort((a, b) => a - b);
  assert.deepEqual(idsA, [1, 2, 3, 4], '导师A可见自己课程作品，不含管理员课程与遗留无课程作品');

  const tokenB = await tokenFor('导师B');
  const listB = await (await authed(tokenB, 'GET', '/api/works', null)).json();
  assert.deepEqual(listB.works.map((w) => w.id), [5], '导师B仅见自己授课课程作品');
});

test('遗留无课程关联作品：管理员/本人可见，导师不可见', async () => {
  assert.equal((await authed(await tokenFor('管理员'), 'GET', '/api/works/6', null)).status, 200);
  assert.equal((await authed(await tokenFor('学生A'), 'GET', '/api/works/6', null)).status, 200);
  assert.equal((await authed(await tokenFor('导师A'), 'GET', '/api/works/6', null)).status, 403);
});

test('导师仅可批改自己课程作品', async () => {
  const tokenA = await tokenFor('导师A');
  assert.equal((await authed(tokenA, 'POST', '/api/works/5/review', { status: 'rejected' })).status, 403, '非自己课程不可批改');
  const ok = await authed(tokenA, 'POST', '/api/works/2/review', { status: 'rejected' });
  assert.equal(ok.status, 200, '自己课程可批改');

  const tokenB = await tokenFor('导师B');
  assert.equal((await authed(tokenB, 'POST', '/api/works/2/review', { status: 'rejected' })).status, 403, '他人课程不可批改');
});

test('作品删除矩阵', async () => {
  const insertWork = db.prepare(`
    INSERT INTO works (id, student_id, enrollment_id, task_id, title, file_path, review_status, parent_work_id, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertWork.run(7, 4, 2, null, '待删pending', '/tmp/pbl-w7.pdf', 'pending', null, 1);
  insertWork.run(8, 4, 2, null, '待删approved', '/tmp/pbl-w8.pdf', 'approved', null, 1);
  insertWork.run(9, 4, 2, null, '被打回旧版', '/tmp/pbl-w9.pdf', 'rejected', null, 1);
  insertWork.run(10, 4, 2, null, '被打回新版', '/tmp/pbl-w10.pdf', 'pending', 9, 2);
  insertWork.run(11, 5, 4, null, '导师不可删', '/tmp/pbl-w11.pdf', 'pending', null, 1);

  const student = await tokenFor('学生A');
  assert.equal((await authed(student, 'DELETE', '/api/works/7', null)).status, 200, '学生可删pending');
  assert.equal((await authed(student, 'DELETE', '/api/works/8', null)).status, 403, 'approved不可删');
  assert.equal((await authed(student, 'DELETE', '/api/works/9', null)).status, 403, '有后续版本不可删');
  assert.equal((await authed(student, 'DELETE', '/api/works/10', null)).status, 200, '最新版本可删');

  assert.equal((await authed(await tokenFor('导师A'), 'DELETE', '/api/works/11', null)).status, 403, '导师禁止删除');

  const admin = await tokenFor('管理员');
  assert.equal((await authed(admin, 'DELETE', '/api/works/8', null)).status, 403, '管理员也不能删approved');
  assert.equal((await authed(admin, 'DELETE', '/api/works/11', null)).status, 200, '管理员异常处理可删');
});

test('作品计数按版本根去重', async () => {
  const token = await tokenFor('学生A');
  const dash = await (await authed(token, 'GET', '/api/dashboard', null)).json();
  const course1 = dash.myCourses.find((c) => c.id === 1);
  assert.equal(course1.my_work_count, 2, 'v1+v2+v3 根数应为 2（w1、w2）');
});

test('根记录唯一约束与并发兜底', async () => {
  // w2 已是任务2的根：直接插入同键根记录应被唯一索引拒绝
  assert.throws(() => {
    db.prepare(`
      INSERT INTO works (student_id, enrollment_id, task_id, title, review_status, parent_work_id, version)
      VALUES (4, 1, 2, '重复根', 'pending', NULL, 1)
    `).run();
  }, /UNIQUE/i);
});

test('文字任务提交写入work_id成长事件并拒绝重复根', async () => {
  const token = await tokenFor('学生A');
  const first = await authed(token, 'POST', '/api/works', { task_id: 3, title: '文字任务作品', description: '内容' });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  const record = db.prepare('SELECT work_id FROM growth_records WHERE work_id = ?').get(firstBody.id);
  assert.ok(record, '提交作品的成长事件应携带 work_id');

  const second = await authed(token, 'POST', '/api/works', { task_id: 3, title: '重复提交', description: '内容' });
  assert.equal(second.status, 400, '预检应拒绝重复根提交');
});
