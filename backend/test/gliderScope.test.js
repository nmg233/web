// 批次E：滑翔机课程授权与提交校验回归测试
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-glider-${process.pid}-${Date.now()}.db`);
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
  db.prepare("INSERT INTO classes (id, name, school_id) VALUES (1, '一班', 1)").run();

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role, school_id, class_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(1, 'admin', pwd, '管理员', 'admin', null, null);
  insertUser.run(2, 'teacher_a', pwd, '甲老师', 'teacher', 1, 1);
  insertUser.run(4, 'student_a', pwd, '学生A', 'student', 1, 1);
  insertUser.run(5, 'student_b', pwd, '学生B', 'student', 1, 1);
  insertUser.run(6, 'mentor_a', pwd, '导师A', 'academic_mentor', null, null);
  insertUser.run(7, 'mentor_b', pwd, '导师B', 'academic_mentor', null, null);

  db.prepare("INSERT INTO courses (id, title, grade_level, difficulty, status, created_by) VALUES (1, '导师A课程', 'primary', 'basic', 'published', 6)").run();
  db.prepare("INSERT INTO courses (id, title, grade_level, difficulty, status, created_by) VALUES (2, '导师A课程二', 'primary', 'basic', 'published', 6)").run();
  db.prepare("INSERT INTO lessons (id, course_id, title, sort_order, instructor_id) VALUES (1, 1, '第一讲', 1, 2)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (1, 4, 1, 6)").run();
  db.prepare("INSERT INTO enrollments (id, student_id, course_id, enrolled_by) VALUES (2, 5, 2, 6)").run();

  const insertSim = db.prepare(`
    INSERT INTO glider_simulations (id, student_id, status, state, course_id, lesson_id)
    VALUES (?, ?, 'success', 'landed', ?, ?)
  `);
  insertSim.run(1, 4, 1, 1);      // 学生A，课程1
  insertSim.run(2, 4, null, null); // 学生A，遗留无课程记录
  insertSim.run(3, 5, 2, null);   // 学生B，课程2
  db.prepare("INSERT INTO glider_simulations (id, student_id, status, course_id) VALUES (4, 4, 'running', 1)").run();

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

test('试飞记录列表按角色授权', async () => {
  const studentA = await (await authed(await tokenFor('学生A'), 'GET', '/api/glider/simulations', null)).json();
  assert.deepEqual(studentA.items.map((i) => i.id).sort((a, b) => a - b), [1, 2, 4], '学生本人全部记录');

  const mentorA = await (await authed(await tokenFor('导师A'), 'GET', '/api/glider/simulations', null)).json();
  assert.deepEqual(mentorA.items.map((i) => i.id).sort((a, b) => a - b), [1, 3, 4], '导师仅自己课程记录（课程1/2），不含遗留NULL');

  const mentorB = await (await authed(await tokenFor('导师B'), 'GET', '/api/glider/simulations', null)).json();
  assert.deepEqual(mentorB.items, [], '非课程导师无记录');

  const teacher = await (await authed(await tokenFor('甲老师'), 'GET', '/api/glider/simulations', null)).json();
  assert.deepEqual(teacher.items, [], '教师无记录');

  const admin = await (await authed(await tokenFor('管理员'), 'GET', '/api/glider/simulations', null)).json();
  assert.deepEqual(admin.items.map((i) => i.id).sort((a, b) => a - b), [1, 2, 3, 4], '管理员全部');
});

test('试飞记录详情按课程授权', async () => {
  assert.equal((await authed(await tokenFor('导师B'), 'GET', '/api/glider/simulations/2', null)).status, 404, '遗留NULL对非本人导师不可见');
  assert.equal((await authed(await tokenFor('管理员'), 'GET', '/api/glider/simulations/2', null)).status, 200);
  assert.equal((await authed(await tokenFor('学生A'), 'GET', '/api/glider/simulations/3', null)).status, 404, '他人记录不可见');
});

test('模拟提交校验：角色、课程报名与课时归属', async () => {
  assert.equal((await authed(await tokenFor('甲老师'), 'POST', '/api/glider/simulate', { dihedral_deg: 5, cg_x: 0, speed: 36, course_id: 1 })).status, 403, '教师不可提交');

  const token = await tokenFor('学生A');
  const notEnrolled = await authed(token, 'POST', '/api/glider/simulate', { dihedral_deg: 5, cg_x: 0, speed: 36, course_id: 2 });
  assert.equal(notEnrolled.status, 400, '未报名课程400');
  const badLesson = await authed(token, 'POST', '/api/glider/simulate', { dihedral_deg: 5, cg_x: 0, speed: 36, course_id: 1, lesson_id: 999 });
  assert.equal(badLesson.status, 400, '课时不属于课程400');
});

test('引擎能力探测返回结构化结果', async () => {
  const res = await authed(await tokenFor('管理员'), 'GET', '/api/glider/capabilities', null);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.ready, 'boolean');
  assert.equal(typeof body.python, 'string');
  assert.equal(typeof body.maxActive, 'number');
  assert.equal(typeof body.retentionDays, 'number');
  assert.ok(body.probe === null || typeof body.probe === 'object', 'probe 应为对象或 null');
});
