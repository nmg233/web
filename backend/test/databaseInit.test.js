const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const Database = require('better-sqlite3');

const backend = path.resolve(__dirname, '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-init-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'test.db');
}
function run(dbPath, args, extra = {}) {
  return spawnSync(process.execPath, args, {
    cwd: backend, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test',
      DB_FORCE_INIT: '0', JWT_SECRET: 'database-init-test-secret', ...extra },
  });
}
function succeeds(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test('db:init 后可重复启动并使用 README 姓名和密码登录', async (t) => {
  const dbPath = fixture(t);
  const result = run(dbPath, ['database/init.js']);
  succeeds(result);
  assert.match(result.stdout, /管理员: 管理员 \/ admin123/);
  for (let i = 0; i < 2; i++) {
    succeeds(run(dbPath, ['-e', "require('./config/database').close()"]));
  }
  succeeds(run(dbPath, ['-e', `
    const assert = require('node:assert/strict');
    const app = require('./app');
    const db = require('./config/database');
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        for (const [real_name, password] of [
          ['管理员', 'admin123'], ['张导师', 'mentor123'],
          ['李老师', 'teacher123'], ['王小明', 'student123']]) {
          const res = await fetch(base + '/api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({real_name, password})
          });
          assert.equal(res.status, 200);
          assert.ok((await res.json()).token);
        }
      } catch (err) { console.error(err); process.exitCode = 1; }
      finally { server.close(() => db.close()); }
    });
  `]));
});

test('已有库拒绝初始化，显式重置后仍可启动', (t) => {
  const dbPath = fixture(t);
  succeeds(run(dbPath, ['database/init.js']));
  const db = new Database(dbPath);
  db.prepare("UPDATE users SET real_name = '保留姓名' WHERE id = 1").run();
  db.close();
  assert.equal(run(dbPath, ['database/init.js']).status, 1);
  const check = new Database(dbPath, { readonly: true });
  assert.equal(check.prepare('SELECT real_name FROM users WHERE id = 1').get().real_name, '保留姓名');
  check.close();
  succeeds(run(dbPath, ['database/init.js', '--force']));
  succeeds(run(dbPath, ['-e', "require('./config/database').close()"]));
});

test('生产环境禁止测试初始化，包括强制重置', (t) => {
  const dbPath = fixture(t);
  assert.equal(run(dbPath, ['database/init.js', '--force'], { NODE_ENV: 'production' }).status, 1);
  assert.equal(fs.existsSync(dbPath), false);
});

test('正式初始化新库并重复运行，保留单一管理员且不写入测试账号', (t) => {
  const dbPath = fixture(t);
  const env = { NODE_ENV: 'production', ADMIN_USERNAME: 'production-admin',
    ADMIN_REAL_NAME: '正式管理员', ADMIN_PASSWORD: 'Test-Production-123!' };
  for (let i = 0; i < 2; i++) succeeds(run(dbPath, ['database/provision.js'], env));
  succeeds(run(dbPath, ['-e', "require('./config/database').close()"]));
  const db = new Database(dbPath, { readonly: true });
  assert.deepEqual(db.prepare('SELECT username, force_reset_password FROM users').all(),
    [{ username: 'production-admin', force_reset_password: 1 }]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM schools').get().n, 0);
  db.close();
});
