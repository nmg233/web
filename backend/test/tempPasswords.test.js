const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { generateTemporaryPassword } = require('../services/tempPasswordService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-temp-passwords-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.UPLOAD_PATH = path.join(dir, 'uploads');
process.env.FEEDBACK_UPLOAD_PATH = path.join(dir, 'feedback');
process.env.JWT_SECRET = 'temp-password-test-only';
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_IP = '1000';
const app = require('../app');
const db = require('../config/database');
let server, base, adminToken;
const legacyPassword = 'LegacyPass!234';

async function api(url, body, token = adminToken, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + '/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
}
const login = (username, password) => api('/auth/login', { username, password }, null);
const create = (username, role = 'student', endpoint = '/students/users') => api(endpoint, {
  username, real_name: '王小明', role, school_id: 1, class_id: 1,
});
const idFor = (username) => db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
function checkPassword(password) {
  assert.equal(password.length, 12);
  assert.match(password, /^[A-Za-z0-9]/);
  for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%&*?]/]) assert.match(password, pattern);
}

before(async () => {
  db.prepare("INSERT INTO schools (id, name) VALUES (1, '学校A')").run();
  db.prepare("INSERT INTO classes (id, name, school_id) VALUES (1, '一班', 1)").run();
  db.prepare("INSERT INTO users (username, real_name, role, password_hash) VALUES ('admin', '管理员', 'admin', ?)").run(bcrypt.hashSync(legacyPassword, 4));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await login('admin', legacyPassword)).body.token;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('随机服务生成的密码均为 12 位四类字符，无样本重复', () => {
  const samples = Array.from({ length: 1000 }, generateTemporaryPassword);
  samples.forEach(checkPassword);
  assert.equal(new Set(samples).size, samples.length);
});

test('学生创建与管理员创建各角色统一随机密码，仅当次响应返回且仅 hash 入库', async () => {
  const seen = new Set();
  for (const [username, role, endpoint] of [
    ['student-direct', 'student', '/students'], ['student-admin', 'student', '/students/users'],
    ['teacher-admin', 'teacher', '/students/users'], ['mentor-admin', 'academic_mentor', '/students/users'],
  ]) {
    const res = await create(username, role, endpoint);
    assert.equal(res.status, 200);
    assert.equal(res.cache, 'no-store');
    const temp = res.body.temp_password;
    checkPassword(temp);
    assert.ok(!seen.has(temp));
    seen.add(temp);
    assert.ok(!res.body.message.includes(temp));
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    assert.ok(bcrypt.compareSync(temp, user.password_hash));
    assert.equal(user.force_reset_password, 1);
    assert.ok(!JSON.stringify(user).includes(temp));
    const logged = await login(username, temp);
    assert.equal(logged.status, 200);
    assert.equal(logged.body.forceResetPassword, true);
    const detail = await api(`/students/${user.id}`);
    const me = await api('/auth/me', undefined, logged.body.token);
    const list = await api('/students');
    for (const body of [detail.body, me.body, list.body, logged.body]) {
      assert.ok(!JSON.stringify(body).includes(temp));
      assert.ok(!JSON.stringify(body).includes(user.password_hash));
    }
    assert.equal((await login(username, 'wangxiaoming@123')).status, 401);
    assert.equal((await login(username, 'pbl123456')).status, 401);
  }
});

test('手填初始密码和编辑资料改密被明确拒绝，现有密码不受影响', async () => {
  for (const endpoint of ['/students', '/students/users']) {
    const res = await api(endpoint, { username: 'blocked-custom', real_name: '测试', role: 'student', school_id: 1, class_id: 1, password: legacyPassword });
    assert.equal(res.status, 400);
    assert.equal(db.prepare('SELECT id FROM users WHERE username = ?').get('blocked-custom'), undefined);
  }
  const original = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('student-admin').password_hash;
  const res = await api(`/students/users/${idFor('student-admin')}`, { real_name: '王小明', role: 'student', school_id: 1, class_id: 1, is_active: true, password: legacyPassword }, adminToken, 'PUT');
  assert.equal(res.status, 400);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE username = ?').get('student-admin').password_hash, original);
});

test('导入随机密码只对应成功行，普通账号 CSV 无密码，临时 CSV 可原样登录', async () => {
  const res = await api('/students/import', { data: JSON.stringify([
    { username: 'import-first', real_name: '王小明', school_name: '学校A', class_name: '一班' },
    { username: 'import-second', real_name: '王小明', school_name: '学校A', class_name: '一班' },
    { username: 'import-first', real_name: '重复', school_name: '学校A', class_name: '一班' },
  ]) });
  assert.equal(res.status, 200);
  assert.equal(res.cache, 'no-store');
  assert.equal(res.body.imported, 2);
  assert.equal(res.body.failed, 1);
  const { accountsToCSV, temporaryAccountsToCSV } = await import('../../frontend/src/utils/accountExport.js');
  const ordinary = accountsToCSV(res.body.accounts);
  const credentials = temporaryAccountsToCSV(res.body.accounts);
  assert.ok(credentials.includes('"姓名","登录账号","临时密码"'));
  const XLSX = require('xlsx');
  const book = XLSX.read(credentials, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  for (const account of res.body.accounts) {
    checkPassword(account.temp_password);
    assert.ok(!ordinary.includes(account.temp_password));
    assert.ok(!JSON.stringify(res.body.errors).includes(account.temp_password));
    const row = rows.find(r => r['登录账号'] === account.username);
    assert.equal(row['临时密码'], account.temp_password);
    assert.equal((await login(account.username, row['临时密码'])).status, 200);
  }
  assert.notEqual(res.body.accounts[0].temp_password, res.body.accounts[1].temp_password);
});

test('重置撤销旧 refresh token、阻止旧业务会话；临时密码改密后失效', async () => {
  const created = await create('reset-flow');
  const old = await login('reset-flow', created.body.temp_password);
  const reset = await api('/auth/admin/reset-password', { user_id: idFor('reset-flow') });
  assert.equal(reset.status, 200);
  assert.equal(reset.cache, 'no-store');
  assert.equal(reset.body.username, 'reset-flow');
  checkPassword(reset.body.temp_password);
  assert.notEqual(reset.body.temp_password, created.body.temp_password);
  assert.equal((await login('reset-flow', created.body.temp_password)).status, 401);
  assert.equal((await api('/auth/refresh', { refresh_token: old.body.refresh_token }, null)).status, 401);
  assert.equal((await api('/courses', undefined, old.body.token)).body.code, 'FORCE_RESET');
  const temporary = await login('reset-flow', reset.body.temp_password);
  const changed = await api('/auth/change-password', { old_password: reset.body.temp_password, new_password: legacyPassword }, temporary.body.token);
  assert.equal(changed.status, 200);
  assert.equal((await login('reset-flow', reset.body.temp_password)).status, 401);
  const logged = await login('reset-flow', legacyPassword);
  assert.equal(logged.status, 200);
  assert.equal(logged.body.forceResetPassword, false);
  assert.equal((await api('/courses', undefined, logged.body.token)).status, 200);
  assert.equal((await api('/auth/refresh', { refresh_token: temporary.body.refresh_token }, null)).status, 401);
});

test('重置密码仅管理员可操作，教师导师均可作为重置目标', async () => {
  for (const username of ['teacher-admin', 'mentor-admin']) {
    const reset = await api('/auth/admin/reset-password', { user_id: idFor(username) });
    assert.equal(reset.status, 200);
    checkPassword(reset.body.temp_password);
    const logged = await login(username, reset.body.temp_password);
    assert.equal((await api('/auth/admin/reset-password', { user_id: idFor('student-admin') }, logged.body.token)).status, 403);
  }
  assert.equal((await api('/auth/admin/reset-password', { user_id: idFor('admin') })).status, 400);
});

test('撤销 refresh token 失败时重置事务回滚', async () => {
  const created = await create('rollback-flow');
  const logged = await login('rollback-flow', created.body.temp_password);
  const id = idFor('rollback-flow');
  const original = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash;
  db.exec(`CREATE TEMP TRIGGER fail_password_reset BEFORE DELETE ON refresh_tokens WHEN OLD.user_id = ${id} BEGIN SELECT RAISE(ABORT, 'test revocation failure'); END`);
  try {
    assert.equal((await api('/auth/admin/reset-password', { user_id: id })).status, 500);
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash, original);
  } finally { db.exec('DROP TRIGGER fail_password_reset'); }
  assert.equal((await api('/auth/refresh', { refresh_token: logged.body.refresh_token }, null)).status, 200);
});

test('创建和重置不会将临时密码写入服务器日志', async (t) => {
  const logs = [];
  for (const method of ['log', 'warn', 'error', 'info']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  const created = await create('no-log-secret');
  const reset = await api('/auth/admin/reset-password', { user_id: idFor('no-log-secret') });
  assert.equal(created.status, 200);
  assert.equal(reset.status, 200);
  for (const secret of [created.body.temp_password, reset.body.temp_password]) assert.ok(!logs.join('\n').includes(secret));
});
