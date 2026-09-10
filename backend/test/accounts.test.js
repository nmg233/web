const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-accounts-'));
process.env.DB_PATH = path.join(tempDir, 'accounts.db');
process.env.UPLOAD_PATH = path.join(tempDir, 'uploads');
process.env.FEEDBACK_UPLOAD_PATH = path.join(tempDir, 'feedback');
process.env.JWT_SECRET = 'accounts-test-secret';
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_IP = '1000';
process.env.LOGIN_RATE_LIMIT_USER = '3';
process.env.ACCOUNT_LOCK_THRESHOLD = '5';

// config/database requires an existing file; migrations build the empty test database.
fs.writeFileSync(process.env.DB_PATH, '');
const app = require('../app');
const db = require('../config/database');
let server, baseUrl, adminToken;
const password = 'UserPass!234';
const credentials = new Map();

async function request(url, { method = 'GET', body, token = adminToken } = {}) {
  const res = await fetch(`${baseUrl}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (data.username && data.temp_password) credentials.set(data.username, data.temp_password);
  for (const account of data.accounts || []) {
    if (account.temp_password) credentials.set(account.username, account.temp_password);
  }
  return { status: res.status, body: data };
}
const login = (username, pwd = credentials.get(String(username).trim()) || password) => request('/auth/login', { method: 'POST', body: { username, password: pwd }, token: null });
const create = (username, real_name = '王小明', school_id = 1) => request('/students/users', {
  method: 'POST', body: { username, real_name, school_id, class_id: school_id, role: 'student' },
});

before(async () => {
  db.prepare("INSERT INTO schools (id, name) VALUES (1, '学校A'), (2, '学校B')").run();
  db.prepare("INSERT INTO classes (id, name, school_id) VALUES (1, '一班', 1), (2, '二班', 2)").run();
  db.prepare("INSERT INTO users (username, real_name, role, password_hash) VALUES ('admin_legacy', '管理员', 'admin', ?)").run(bcrypt.hashSync(password, 4));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await login('admin_legacy');
  assert.equal(res.status, 200);
  adminToken = res.body.token;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('两个学校的同名学生可创建并使用各自账号登录；首次改密守卫保留', async () => {
  assert.equal((await create('BJFX-2026-0001')).status, 200);
  assert.equal((await create('HSXX-2026-0001', '王小明', 2)).status, 200);
  const a = await login('BJFX-2026-0001');
  const b = await login('HSXX-2026-0001');
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.body.user.id, b.body.user.id);
  assert.equal(a.body.user.school_id, 1);
  assert.equal(b.body.user.school_id, 2);
  assert.equal(a.body.forceResetPassword, true);
  assert.equal(a.body.user.password_hash, undefined);
  const blocked = await request('/courses', { token: a.body.token });
  assert.equal(blocked.body.code, 'FORCE_RESET');
  assert.equal((await request('/auth/change-password', { method: 'POST', token: a.body.token, body: { old_password: credentials.get('BJFX-2026-0001'), new_password: 'ChangedPass!234' } })).status, 200);
  assert.equal((await request('/courses', { token: a.body.token })).status, 200);
  assert.equal((await login('BJFX-2026-0001', 'ChangedPass!234')).status, 200);
});

test('登录仅接受账号，忽略首尾空格，旧账号保留且区分大小写', async () => {
  assert.equal((await login('  admin_legacy  ')).status, 200);
  assert.equal((await login('ADMIN_LEGACY')).status, 401);
  assert.equal((await login('王小明')).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', token: null, body: { real_name: '管理员', password } })).status, 400);
  assert.equal((await login({ value: 'admin_legacy' })).status, 400);
  assert.equal((await login('admin_legacy', {})).status, 400);
});

test('重复账号包括禁用账号均被拒绝；姓名可以重复，错误账号格式返回 400', async () => {
  assert.equal((await create('HSXX-2026-0001', '另一个名字')).status, 400);
  assert.equal((await create('bad account')).status, 400);
  assert.equal((await create('中文账号')).status, 400);
  assert.equal((await create('x'.repeat(65))).status, 400);
  assert.equal((await create({ account: 'test' })).status, 400);
  assert.equal((await create('disabled-user')).status, 200);
  db.prepare('UPDATE users SET is_active = 0 WHERE username = ?').run('disabled-user');
  assert.equal((await login('disabled-user')).status, 401);
  assert.equal((await create('disabled-user')).status, 400);
});

test('两个创建入口均支持自动唯一账号及同名用户，角色编号可自定义', async () => {
  const a = await create(undefined);
  const b = await create(undefined);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.body.username, b.body.username);
  assert.equal((await login(a.body.username)).status, 200);
  const legacy = await request('/students', { method: 'POST', body: { real_name: '王小明', school_id: 1, class_id: 1, username: 'Legacy_Student' } });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.username, 'Legacy_Student');
  assert.equal((await login(legacy.body.username)).status, 200);
  for (const [role, username] of [['teacher', 'T-BJFX-001'], ['academic_mentor', 'M-0001']]) {
    const res = await request('/students/users', { method: 'POST', body: { role, username, real_name: '王小明', school_id: 1, class_id: 1 } });
    assert.equal(res.status, 200);
    assert.equal((await login(username)).body.user.role, role);
  }
});

test('修改姓名为重名不会改动原账号和密码', async () => {
  await create('Rename_Student', '原名');
  const { id } = db.prepare('SELECT id FROM users WHERE username = ?').get('Rename_Student');
  const res = await request(`/students/users/${id}`, { method: 'PUT', body: { real_name: '王小明', role: 'student', school_id: 1, class_id: 1, is_active: true } });
  assert.equal(res.status, 200);
  const logged = await login('Rename_Student');
  assert.equal(logged.status, 200);
  assert.equal(logged.body.user.real_name, '王小明');
});

test('JSON 导入支持同名、逐行账号冲突检查、旧模板和账号结果返回', async () => {
  const rows = [
    { 登录账号: 'IMPORT-0001', 姓名: '王小明', 学校: '学校A', 班级: '一班' },
    { username: 'IMPORT-0002', real_name: '王小明', school_name: '学校B', class_name: '二班' },
    { 登录账号: 'IMPORT-0001', 姓名: '另一个人', 学校: '学校A', 班级: '一班' },
    { 姓名: '王小明', 学校: '学校A', 班级: '一班' },
    { 登录账号: 'bad account', 姓名: '王小明', 学校: '学校A', 班级: '一班' },
  ];
  const res = await request('/students/import', { method: 'POST', body: { data: JSON.stringify(rows) } });
  assert.equal(res.status, 200);
  assert.equal(res.body.imported, 3);
  assert.equal(res.body.failed, 2);
  assert.equal(res.body.accounts.length, 3);
  assert.match(res.body.errors[0], /登录账号已存在/);
  for (const account of res.body.accounts) {
    assert.equal((await login(account.username, account.temp_password)).status, 200);
    assert.equal(account.password_hash, undefined);
  }
});

test('CSV 和 Excel 文件导入均识别登录账号列', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 登录账号: 'XLSX-0001', 姓名: '王小明', 学校: '学校B', 班级: '二班' }]), '账号');
  const files = [
    ['accounts.csv', '\uFEFF登录账号,姓名,学校,班级\nCSV-0001,王小明,学校A,一班', 'CSV-0001'],
    ['accounts.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'XLSX-0001'],
  ];
  for (const [name, content, username] of files) {
    const form = new FormData();
    form.append('file', new Blob([content]), name);
    const res = await fetch(`${baseUrl}/api/students/import`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).accounts[0].username, username);
  }
});

test('管理员列表可按账号检索，列表和导出所需字段不含密码', async () => {
  const res = await request('/students?search=IMPORT-0002');
  assert.equal(res.status, 200);
  const users = res.body.tree.schools.flatMap((s) => s.classes.flatMap((c) => c.roles.student));
  assert.equal(users.length, 1);
  assert.equal(users[0].username, 'IMPORT-0002');
  assert.equal(users[0].password_hash, undefined);
  assert.equal(users[0].school_name, '学校B');
});

test('登录失败限流和锁定按账号隔离，同名用户不受另一账号失败影响', async (t) => {
  await create('LIMIT-A');
  await create('LIMIT-B');
  for (let i = 0; i < 3; i++) assert.equal((await login('LIMIT-A', 'wrong')).status, 401);
  assert.equal((await login(' LIMIT-A ')).status, 429);
  assert.equal((await login('LIMIT-B')).status, 200);
  // 推进限流窗口，累计到锁定阈值；无需等待一分钟。
  const later = Date.now() + 61000;
  t.mock.method(Date, 'now', () => later);
  for (let i = 0; i < 2; i++) assert.equal((await login('LIMIT-A', 'wrong')).status, 401);
  const locked = await login('LIMIT-A');
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /锁定/);
  assert.equal((await login('LIMIT-B')).status, 200);
});

test('账号 CSV 支持中文、引号和换行，并防止公式注入且不导出密码', async () => {
  const { accountsToCSV } = await import('../../frontend/src/utils/accountExport.js');
  const csv = accountsToCSV([{ real_name: '=1+1', username: 'SAFE-0001', role: 'student', school_name: '学校"A', class_name: '一\n班', password_hash: 'never-export' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"学校""A"'));
  assert.ok(csv.includes('"一\n班"'));
  assert.ok(!csv.includes('never-export'));
});

test('公开注册继续关闭', async () => {
  assert.equal((await request('/auth/register', { method: 'POST', token: null, body: { username: 'register-test' } })).status, 403);
});
