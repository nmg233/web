// 选课闭环接口测试：导入权限/范围、不可退课、管理员异常修正、教师任务范围、迁移标记
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-enrollment-${process.pid}-${Date.now()}.db`);
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

  db.prepare("INSERT INTO schools (id, name, region) VALUES (1, '学校A', '北京')").run();
  db.prepare("INSERT INTO schools (id, name, region) VALUES (2, '学校B', '上海')").run();
  db.prepare("INSERT INTO classes (id, name, school_id, grade) VALUES (1, '一班', 1, '四年级')").run();
  db.prepare("INSERT INTO classes (id, name, school_id, grade) VALUES (2, '二班', 2, '五年级')").run();

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role, school_id, class_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(1, 'admin', pwd, '管理员', 'admin', null, null);
  insertUser.run(2, 'teacher_a', pwd, '甲老师', 'teacher', 1, 1);
  insertUser.run(3, 'teacher_b', pwd, '乙老师', 'teacher', 2, 2);
  insertUser.run(4, 'student_a', pwd, '学生A', 'student', 1, 1);
  insertUser.run(5, 'student_b', pwd, '学生B', 'student', 2, 2);
  insertUser.run(6, 'mentor', pwd, '执行导师', 'academic_mentor', null, null);
  insertUser.run(7, 'student_c', pwd, '学生C', 'student', 1, 1);

  db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (1, '公开课程', 'primary', 'basic', 'published', 6)
  `).run();
  db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (2, '草稿课程', 'primary', 'basic', 'draft', 6)
  `).run();
  db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (3, '归档课程', 'primary', 'basic', 'archived', 6)
  `).run();

  // 课时：公开课程由甲老师授课
  db.prepare(`
    INSERT INTO lessons (id, course_id, title, sort_order, instructor_id)
    VALUES (1, 1, '第一讲', 1, 2)
  `).run();
  db.prepare(`
    INSERT INTO tasks (id, lesson_id, title, sort_order, require_upload)
    VALUES (1, 1, '课程任务', 1, 1)
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

async function login(realName) {
  const username = { 管理员: "admin", 甲老师: "teacher_a", 乙老师: "teacher_b", 学生A: "student_a", 学生B: "student_b", 学生C: "student_c", 执行导师: "mentor" }[realName];
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'user123' }),
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

function enrollmentRows() {
  return db.prepare('SELECT * FROM enrollments ORDER BY id').all();
}

test('新库迁移标记到最新版本', () => {
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
  assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8]);
  const cols = db.prepare('PRAGMA table_info(enrollments)').all().map((c) => c.name);
  for (const col of ['status', 'enrolled_by', 'removed_at', 'removed_by', 'remove_reason']) {
    assert.ok(cols.includes(col), `缺少列 ${col}`);
  }
});

test('教师不可导入选课', async () => {
  const token = await tokenFor('甲老师');
  const res = await authed(token, 'POST', '/api/courses/1/enroll', { student_ids: [4] });
  assert.equal(res.status, 403);
});

test('教师不能查询导入候选学生', async () => {
  const token = await tokenFor('甲老师');
  const res = await authed(token, 'GET', '/api/courses/1/enroll/candidates', null);
  assert.equal(res.status, 403);
});

test('教师不能导入外校学生', async () => {
  const token = await tokenFor('甲老师');
  const before = enrollmentRows().length;
  const res = await authed(token, 'POST', '/api/courses/1/enroll', { student_ids: [5] });
  assert.equal(res.status, 403);
  assert.equal(enrollmentRows().length, before);
});

test('执行导师可导入任意学校学生', async () => {
  const token = await tokenFor('执行导师');
  const res = await authed(token, 'POST', '/api/courses/1/enroll', { student_ids: [5] });
  assert.equal(res.status, 200);
  const row = db.prepare("SELECT * FROM enrollments WHERE student_id = 5 AND course_id = 1").get();
  assert.equal(row.enrolled_by, 6);
});

test('归档课程不能导入学生', async () => {
  const token = await tokenFor('管理员');
  const res = await authed(token, 'POST', '/api/courses/3/enroll', { student_ids: [4] });
  assert.equal(res.status, 400);
});

test('重复导入幂等且不产生重复行', async () => {
  const token = await tokenFor('执行导师');
  const res = await authed(token, 'POST', '/api/courses/1/enroll', { student_ids: [4] });
  assert.equal(res.status, 200);
  const count = db.prepare('SELECT COUNT(*) c FROM enrollments WHERE student_id = 4 AND course_id = 1').get().c;
  assert.equal(count, 1);
});

test('日常不可退课：学生/教师/导师调用移除均被拒绝', async () => {
  for (const name of ['学生A', '甲老师', '执行导师']) {
    const token = await tokenFor(name);
    const enrollment = db.prepare('SELECT id FROM enrollments WHERE student_id = 4 AND course_id = 1').get();
    const res = await authed(token, 'DELETE', `/api/courses/1/enrollments/${enrollment.id}`, { reason: '测试' });
    assert.equal(res.status, 403, name);
  }
});

test('管理员可移除无业务数据的报名（软删除+审计+通知）', async () => {
  const token = await tokenFor('管理员');
  const enrollment = db.prepare('SELECT id FROM enrollments WHERE student_id = 5 AND course_id = 1').get();
  const res = await authed(token, 'DELETE', `/api/courses/1/enrollments/${enrollment.id}`, { reason: '导入错误' });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollment.id);
  assert.equal(row.status, 'removed');
  assert.equal(row.removed_by, 1);
  assert.equal(row.remove_reason, '导入错误');
  const audit = db.prepare("SELECT COUNT(*) c FROM growth_records WHERE student_id = 5 AND description LIKE '%移除课程%'").get().c;
  assert.ok(audit >= 1, '应生成审计记录');
  const notice = db.prepare("SELECT COUNT(*) c FROM notifications WHERE event_key = 'course.enrollment_removed'").get().c;
  assert.ok(notice >= 1, '应生成站内通知');
});

test('已产生作品的报名不可移除', async () => {
  const token = await tokenFor('管理员');
  const enrollment = db.prepare('SELECT id FROM enrollments WHERE student_id = 4 AND course_id = 1').get();
  db.prepare("INSERT INTO works (student_id, enrollment_id, task_id, title) VALUES (4, ?, 1, '测试作品')").run(enrollment.id);
  const res = await authed(token, 'DELETE', `/api/courses/1/enrollments/${enrollment.id}`, { reason: '想删' });
  assert.equal(res.status, 400);
});

test('移除后学生不可见该课程，再次导入可复活', async () => {
  const studentToken = await tokenFor('学生B');
  let res = await authed(studentToken, 'GET', '/api/courses', null);
  let body = await res.json();
  assert.ok(!body.courses.some((c) => c.id === 1), '移除后课程列表不应包含该课程');

  const adminToken = await tokenFor('管理员');
  res = await authed(adminToken, 'POST', '/api/courses/1/enroll', { student_ids: [5] });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT * FROM enrollments WHERE student_id = 5 AND course_id = 1').get();
  assert.equal(row.status, 'active');
  assert.equal(row.removed_at, null);

  res = await authed(studentToken, 'GET', '/api/courses', null);
  body = await res.json();
  assert.ok(body.courses.some((c) => c.id === 1), '复活后课程列表应包含该课程');
});

test('课时授课人必须是启用的教师或执行导师', async () => {
  const token = await tokenFor('管理员');
  const res = await authed(token, 'POST', '/api/courses/1/lessons', { title: '第二讲', instructor_id: 4 });
  assert.equal(res.status, 400);
  const okRes = await authed(token, 'POST', '/api/courses/1/lessons', { title: '第三讲', instructor_id: 6 });
  assert.equal(okRes.status, 200);
});

test('教师任务列表包含本校学生参与课程的任务', async () => {
  const tokenA = await tokenFor('甲老师');
  const resA = await authed(tokenA, 'GET', '/api/tasks', null);
  const bodyA = await resA.json();
  assert.ok(bodyA.tasks.some((t) => t.id === 1), '授课教师应看到任务');

  const tokenB = await tokenFor('乙老师');
  const resB = await authed(tokenB, 'GET', '/api/tasks', null);
  const bodyB = await resB.json();
  assert.ok(bodyB.tasks.some((t) => t.id === 1), '本校学生参与的课程任务应可见');
});

test('教师 Dashboard 展示授课课程，学生列表仅含已报名课程', async () => {
  const tokenA = await tokenFor('甲老师');
  const dashA = await (await authed(tokenA, 'GET', '/api/dashboard', null)).json();
  assert.ok(dashA.myCourses.some((c) => c.id === 1), '授课教师首页应包含课程');

  const tokenS = await tokenFor('学生C');
  const list = await (await authed(tokenS, 'GET', '/api/courses', null)).json();
  assert.ok(!list.courses.some((c) => c.id === 1), '未报名学生不应看到课程');
});
