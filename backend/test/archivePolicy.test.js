// 批次D：档案权限与评价收敛回归测试
// 覆盖：导师学生列表/档案树/详情三入口一致、导师档案课程过滤、遗留NULL数据可见性、
//       教师档案公开作品、成长观察范围、评价权限与课程绑定
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-archivepolicy-${process.pid}-${Date.now()}.db`);
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

  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, grade_level, difficulty, status, created_by)
    VALUES (?, ?, 'primary', 'basic', 'published', ?)
  `);
  insertCourse.run(1, '导师A课程一', 6);
  insertCourse.run(2, '导师A课程二', 6);
  insertCourse.run(3, '导师B授课课程', 1);

  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (1, 1, '第一讲', 1, 2)").run();
  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (2, 3, '第三课讲', 1, 7)").run();

  // 报名：学生A→课程1(active)、课程3(active)、课程2(removed 历史)；学生B→课程2(active)
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by, status) VALUES (1, 4, 1, 6, 'active')").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by, status) VALUES (3, 4, 3, 1, 'active')").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by, status) VALUES (4, 4, 2, 6, 'removed')").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by, status) VALUES (2, 5, 2, 6, 'active')").run();

  const insertWork = db.prepare(`
    INSERT INTO works (id, student_id, enrollment_id, task_id, title, file_path, review_status, parent_work_id, version)
    VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 1)
  `);
  insertWork.run(1, 4, 1, '学生A公开作品', '/tmp/pbl-aw1.pdf', 'approved');
  insertWork.run(2, 4, 1, '学生A待审作品', '/tmp/pbl-aw2.pdf', 'pending');
  insertWork.run(3, 4, null, '遗留无课程作品', '/tmp/pbl-aw3.pdf', 'approved');
  insertWork.run(4, 5, 2, '学生B公开作品', '/tmp/pbl-aw4.pdf', 'approved');

  db.prepare("INSERT INTO evaluations (id, evaluator_id, student_id, enrollment_id, eval_type, score) VALUES (1, 6, 4, 1, 'process', 80)").run();
  db.prepare("INSERT INTO evaluations (id, evaluator_id, student_id, enrollment_id, eval_type, score) VALUES (2, 6, 4, NULL, 'process', 70)").run();
  db.prepare("INSERT INTO reflections (id, student_id, enrollment_id, difficulty) VALUES (1, 4, 1, '有点难')").run();
  db.prepare("INSERT INTO reflections (id, student_id, enrollment_id, difficulty) VALUES (2, 4, NULL, '无课程反思')").run();

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

test('导师学生列表与档案树、详情三入口一致', async () => {
  const tokenA = await tokenFor('导师A');
  const listA = await (await authed(tokenA, 'GET', '/api/students', null)).json();
  const idsA = listA.students.map((s) => s.id).sort((a, b) => a - b);
  assert.deepEqual(idsA, [4, 5], '导师A可见自己课程的学生（含历史报名）');

  const treeA = await (await authed(tokenA, 'GET', '/api/archives/tree', null)).json();
  const treeIds = [];
  for (const school of treeA.tree.schools || []) {
    for (const cls of school.classes || []) {
      for (const s of cls.roles?.student || []) treeIds.push(s.id);
    }
  }
  assert.deepEqual(treeIds.sort((a, b) => a - b), [4, 5], '档案树与列表一致');

  const tokenB = await tokenFor('导师B');
  const listB = await (await authed(tokenB, 'GET', '/api/students', null)).json();
  assert.deepEqual(listB.students.map((s) => s.id), [4], '导师B仅见授课课程的学生');

  assert.equal((await authed(tokenB, 'GET', '/api/students/4', null)).status, 200, '导师B可打开授课课程学生详情');
  assert.equal((await authed(tokenB, 'GET', '/api/students/5', null)).status, 403, '非自己课程学生详情应403');
});

test('导师档案仅含自己课程的作品/评价/反思，遗留NULL数据不可见', async () => {
  const token = await tokenFor('导师A');
  const archive = await (await authed(token, 'GET', '/api/archives/generate?student_id=4', null)).json();
  assert.deepEqual(archive.works.map((w) => w.id), [1, 2], '仅课程1的作品，不含遗留NULL作品');
  assert.deepEqual(archive.evaluations.map((e) => e.id), [1], '遗留NULL评价不可见');
  assert.deepEqual(archive.reflections.map((r) => r.id), [1], '遗留NULL反思不可见');
  assert.ok(archive.courses.every((c) => c.enrollment_id), '课程列表应携带enrollment_id');

  const admin = await tokenFor('管理员');
  const adminArchive = await (await authed(admin, 'GET', '/api/archives/generate?student_id=4', null)).json();
  assert.deepEqual(adminArchive.works.map((w) => w.id).sort((a, b) => a - b), [1, 2, 3], '管理员可见全部作品');
});

test('教师档案仅含本校公开作品，跨校学生403', async () => {
  const tokenA = await tokenFor('甲老师');
  const archive = await (await authed(tokenA, 'GET', '/api/archives/generate?student_id=4', null)).json();
  assert.deepEqual(archive.works.map((w) => w.id), [1], '仅approved作品');

  const tokenB = await tokenFor('乙老师');
  const archiveB = await (await authed(tokenB, 'GET', '/api/archives/generate?student_id=5', null)).json();
  assert.deepEqual(archiveB.works.map((w) => w.id), [4]);
  assert.equal((await authed(tokenB, 'GET', '/api/archives/generate?student_id=4', null)).status, 403, '跨校学生403');
});

test('成长观察：教师限本校，导师/管理员全量', async () => {
  assert.equal((await authed(await tokenFor('甲老师'), 'POST', '/api/archives/growth-records', { student_id: 5, description: '外校记录' })).status, 403);
  assert.equal((await authed(await tokenFor('甲老师'), 'POST', '/api/archives/growth-records', { student_id: 4, description: '本校观察' })).status, 200);
  assert.equal((await authed(await tokenFor('导师B'), 'POST', '/api/archives/growth-records', { student_id: 5, description: '导师观察' })).status, 200);
});

test('课程评价：教师403、必须课程、导师限自己课程、类型收敛', async () => {
  assert.equal((await authed(await tokenFor('甲老师'), 'POST', '/api/archives/evaluation', { student_id: 4, enrollment_id: 1, eval_type: 'process', score: 80 })).status, 403, '教师不可提交评价');

  const tokenA = await tokenFor('导师A');
  assert.equal((await authed(tokenA, 'POST', '/api/archives/evaluation', { student_id: 4, eval_type: 'process', score: 80 })).status, 400, '缺课程400');
  assert.equal((await authed(tokenA, 'POST', '/api/archives/evaluation', { student_id: 4, enrollment_id: 3, eval_type: 'process', score: 80 })).status, 403, '非自己课程403');
  assert.equal((await authed(tokenA, 'POST', '/api/archives/evaluation', { student_id: 4, enrollment_id: 1, eval_type: 'self', score: 80 })).status, 400, 'self类型400');
  const ok = await authed(tokenA, 'POST', '/api/archives/evaluation', { student_id: 4, enrollment_id: 1, eval_type: 'outcome', score: 90 });
  assert.equal(ok.status, 200, '自己课程有效报名可提交');
});
