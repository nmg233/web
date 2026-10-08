// 批次E：滑翔机课程授权与提交校验回归测试
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(os.tmpdir(), `pbl-glider-${process.pid}-${Date.now()}.db`);
const bootstrapDb = new Database(testDbPath);
bootstrapDb.close();

process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-glider-files-'));
process.env.UPLOAD_PATH = uploads;

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

  // 为记录 1 插入一条最小向量轨迹（ftrc 格式：20B 头 + float32 矩阵，zlib 压缩）
  const count = 3;
  const ftrc = Buffer.alloc(20 + count * 11 * 4);
  ftrc.write('FTRC', 0, 'latin1');
  ftrc.writeUInt32LE(1, 4);
  ftrc.writeUInt32LE(count, 8);
  ftrc.writeUInt32LE(11, 12);
  ftrc.writeUInt32LE(0, 16);
  let off = 20;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 11; c++) { ftrc.writeFloatLE(i + c * 0.5, off); off += 4; }
  }
  db.prepare(
    'INSERT INTO glider_trajectories (simulation_id, format, frame_count, state_dim, frames) VALUES (1, ?, ?, ?, ?)'
  ).run('ftrc-f32/1', count, 11, zlib.deflateSync(ftrc));

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  db.close();
  fs.rmSync(uploads, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

async function login(realName) {
  const username = { 管理员: 'admin', 甲老师: 'teacher_a', 学生A: 'student_a', 学生B: 'student_b', 导师A: 'mentor_a', 导师B: 'mentor_b' }[realName];
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'user123' }),
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

test('轨迹数据接口：读库返回最小向量（JSON / 二进制）', async () => {
  const tokenA = await tokenFor('学生A');
  const res = await authed(tokenA, 'GET', '/api/glider/simulations/1/trace', null);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 3);
  assert.equal(body.dim, 11);
  assert.equal(body.extra_dim, 0);
  assert.equal(body.frames.length, 3);
  assert.equal(body.frames[0].length, 11);
  assert.equal(body.frames[0][0], 0, '首帧时间 0');
  assert.equal(body.frames[2][0], 2, '第三帧时间 2');

  const binRes = await authed(tokenA, 'GET', '/api/glider/simulations/1/trace?format=bin', null);
  assert.equal(binRes.status, 200);
  const bin = Buffer.from(await binRes.arrayBuffer());
  assert.equal(bin.subarray(0, 4).toString('latin1'), 'FTRC');
  assert.equal(bin.readUInt32LE(8), 3);

  assert.equal((await authed(tokenA, 'GET', '/api/glider/simulations/3/trace', null)).status, 404, '他人记录不可见');
  assert.equal((await authed(tokenA, 'GET', '/api/glider/simulations/2/trace', null)).status, 404, '无轨迹数据返回 404');
});

test('轨迹数据接口：扩展列（CL/CD）随 JSON 与二进制一起返回', async () => {
  // 为记录 3（学生B）插入一条带 CL/CD 扩展列的轨迹（extra_dim=2）
  const count = 2;
  const ftrc = Buffer.alloc(20 + count * 13 * 4);
  ftrc.write('FTRC', 0, 'latin1');
  ftrc.writeUInt32LE(1, 4);
  ftrc.writeUInt32LE(count, 8);
  ftrc.writeUInt32LE(11, 12);
  ftrc.writeUInt32LE(2, 16);
  let off = 20;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 13; c++) { ftrc.writeFloatLE(i + c * 0.5, off); off += 4; }
  }
  db.prepare(
    'INSERT INTO glider_trajectories (simulation_id, format, frame_count, state_dim, frames) VALUES (3, ?, ?, ?, ?)'
  ).run('ftrc-f32/1', count, 11, zlib.deflateSync(ftrc));

  const tokenB = await tokenFor('学生B');
  const res = await authed(tokenB, 'GET', '/api/glider/simulations/3/trace', null);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.extra_dim, 2);
  assert.deepEqual(body.columns.slice(11), ['CL', 'CD'], 'columns 含扩展列');
  assert.equal(body.frames[0].length, 13, '每帧 13 列（11 状态 + CL/CD）');
  assert.equal(body.frames[0][11], 5.5, 'CL 列值随帧返回');
  assert.equal(body.frames[0][12], 6, 'CD 列值随帧返回');

  const binRes = await authed(tokenB, 'GET', '/api/glider/simulations/3/trace?format=bin', null);
  assert.equal(binRes.status, 200);
  const bin = Buffer.from(await binRes.arrayBuffer());
  assert.equal(bin.length, 20 + count * 13 * 4, 'ftrc 二进制长度为头 + 帧×列×4');
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

test('滑翔机签名受账号版本、强制改密、停用和归档约束，Bearer 不能绕过', async () => {
  const directory = path.join(uploads, 'glider/1');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'flight_replay.mp4'), '0000ftypisom0000');
  const token = await tokenFor('学生A');
  const result = await (await authed(token, 'GET', '/api/glider/simulations/1/stream-url', null)).json();
  const signed = `${baseUrl}${result.url}`;
  assert.equal((await fetch(signed)).status, 200);
  for (const change of ["auth_version = auth_version + 1", 'force_reset_password = 1', 'is_active = 0', 'archived_at = CURRENT_TIMESTAMP']) {
    const original = db.prepare('SELECT auth_version, force_reset_password, is_active, archived_at FROM users WHERE id=4').get();
    db.prepare(`UPDATE users SET ${change} WHERE id=4`).run();
    try {
      assert.equal((await fetch(signed)).status, 401);
      assert.ok([401,403].includes((await authed(token, 'GET', result.url, null)).status));
    } finally {
      db.prepare('UPDATE users SET auth_version=?,force_reset_password=?,is_active=?,archived_at=? WHERE id=4')
        .run(original.auth_version,original.force_reset_password,original.is_active,original.archived_at);
    }
  }
});
