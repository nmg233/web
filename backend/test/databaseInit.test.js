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

test('db:init 后可重复启动并使用 README 账号和密码登录', async (t) => {
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
        for (const [username, password] of [
          ['adminpbl', 'admin123'], ['mentor_zhang', 'mentor123'],
          ['teacher_li', 'teacher123'], ['student_wang', 'student123']]) {
          const res = await fetch(base + '/api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
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

test('旧版 003 学生状态迁移记录升级后不重复添加列并保留账号', (t) => {
  const dbPath = fixture(t);
  succeeds(run(dbPath, ['database/init.js']));
  const db = new Database(dbPath);
  db.exec(`
    DROP INDEX idx_growth_records_work;
    ALTER TABLE growth_records DROP COLUMN work_id;
    DELETE FROM schema_migrations WHERE version = 8;
    UPDATE schema_migrations SET name = '003_student_lifecycle.sql' WHERE version = 3;
  `);
  const before = db.prepare('SELECT id, username, password_hash FROM users ORDER BY id').all();
  db.close();

  succeeds(run(dbPath, ['-e', "require('./config/database').close()"]));
  const upgraded = new Database(dbPath, { readonly: true });
  assert.deepEqual(upgraded.prepare('SELECT id, username, password_hash FROM users ORDER BY id').all(), before);
  assert.deepEqual(upgraded.prepare('SELECT version, name FROM schema_migrations WHERE version IN (3, 8) ORDER BY version').all(), [
    { version: 3, name: '003_archive_timeline.sql' },
    { version: 8, name: '008_student_lifecycle.sql' },
  ]);
  assert.ok(upgraded.prepare('PRAGMA table_info(growth_records)').all().some((column) => column.name === 'work_id'));
  upgraded.close();
});

test('主线 016 旧库升级账号 017，保留密码和课堂纪要且重复启动幂等', (t) => {
  const dbPath = fixture(t);
  succeeds(run(dbPath, ['database/init.js']));
  const old = new Database(dbPath);
  old.exec(`
    DROP TABLE account_status_events;
    DROP TABLE account_import_batches;
    DROP TABLE account_sequences;
    DROP TABLE account_school_codes;
    DROP INDEX idx_school_account_code;
    ALTER TABLE schools DROP COLUMN account_code;
    DELETE FROM schema_migrations WHERE version = 17;
  `);
  const accounts = old.prepare('SELECT id, username, password_hash FROM users ORDER BY id').all();
  const course = old.prepare('SELECT id, created_by FROM courses LIMIT 1').get();
  old.prepare('INSERT INTO course_replays (course_id,title,video_path,summary,created_by) VALUES (?,?,?,?,?)')
    .run(course.id, '旧回放', 'preserved.mp4', '保留课堂纪要', course.created_by);
  old.close();
  for (let i = 0; i < 2; i++) succeeds(run(dbPath, ['-e', "require('./config/database').close()"]));
  const upgraded = new Database(dbPath, { readonly: true });
  try {
    assert.deepEqual(upgraded.prepare('SELECT id, username, password_hash FROM users ORDER BY id').all(), accounts);
    assert.equal(upgraded.prepare("SELECT summary FROM course_replays WHERE title='旧回放'").get().summary, '保留课堂纪要');
    assert.equal(upgraded.prepare('SELECT name FROM schema_migrations WHERE version=16').get().name, '016_replay_summary.sql');
    assert.equal(upgraded.prepare('SELECT name FROM schema_migrations WHERE version=17').get().name, '017_account_batches.sql');
    assert.ok(upgraded.prepare('PRAGMA table_info(schools)').all().some(column => column.name === 'account_code'));
    assert.equal(upgraded.pragma('integrity_check', { simple: true }), 'ok');
  } finally { upgraded.close(); }
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

test('正式管理员自动规则、初始改密及旧账号不覆盖', (t) => {
  const dbPath=fixture(t);
  const env={NODE_ENV:'production',ADMIN_USERNAME:'',ADMIN_REAL_NAME:'张三',ADMIN_PASSWORD:'ignored-password'};
  succeeds(run(dbPath,['database/provision.js'],env));
  const db=new Database(dbPath);
  const account=db.prepare('SELECT * FROM users').get();
  assert.equal(account.username,'BUAA_admin_zhangsan_1');assert.equal(account.force_reset_password,1);
  assert.equal(require('bcryptjs').compareSync('zhangsan@123',account.password_hash),true);
  assert.equal(require('bcryptjs').compareSync('ignored-password',account.password_hash),false);
  db.close();
  succeeds(run(dbPath,['database/provision.js'],{...env,ADMIN_REAL_NAME:'改名不覆盖'}));
  const check=new Database(dbPath);assert.equal(check.prepare('SELECT password_hash FROM users').get().password_hash,account.password_hash);
  check.prepare("INSERT INTO users(username,real_name,role,password_hash) VALUES('occupied-name','学生','student','unused')").run();check.close();
  assert.equal(run(dbPath,['database/provision.js'],{...env,ADMIN_USERNAME:'occupied-name'}).status,1);
});
