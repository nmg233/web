const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { isDeepStrictEqual } = require('node:util');
const { resolveDbPath, run } = require('../../content/aviation-intro/admin-import.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aviation-import-'));
const filename = path.join(dir, 'test.db');
process.env.DB_PATH = filename;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'aviation-import-test';
const app = require('../app');
const db = require('../config/database');
const adminId = Number(db.prepare("INSERT INTO users (username,password_hash,real_name,role,is_active,force_reset_password) VALUES ('aviation-admin',?,'管理员','admin',1,0)").run(bcrypt.hashSync('Admin!123456', 4)).lastInsertRowid);
const env = { DB_PATH: filename, PBL_IMPORT_ADMIN_ID: String(adminId) };
let server;
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function snapshot() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}
test('路径解析：进程 > 服务器配置 > 本地配置 > 默认，与 cwd 无关', () => {
  const root = path.join(dir, 'root'); fs.mkdirSync(root);
  const config = path.join(dir, 'backend.env');
  const missing = path.join(dir, 'missing.env');
  assert.equal(resolveDbPath({ ENV_FILE: missing }, root), path.join(root, 'database/pbl_platform.db'));
  fs.writeFileSync(path.join(root, '.env'), 'DB_PATH=local.db\n');
  assert.equal(resolveDbPath({ ENV_FILE: missing }, root), path.join(root, 'local.db'));
  fs.writeFileSync(config, '# comment\r\nDB_PATH="server/data.db"\r\n');
  assert.equal(resolveDbPath({ ENV_FILE: config }, root), path.join(root, 'server/data.db'));
  assert.equal(resolveDbPath({ ENV_FILE: config, DB_PATH: 'override.db' }, root), path.join(root, 'override.db'));
  assert.equal(resolveDbPath({ ENV_FILE: config, DB_PATH: filename }, root), filename);
  assert.throws(() => resolveDbPath({ ENV_FILE: dir }, root));
});
test('数据库：首次导入、备份、重复运行、补齐、冲突和回滚', async () => {
  const before = snapshot();
  const first = await run(env);
  assert.deepEqual(first.totals, { cards: { added: 6, skipped: 0 }, questions: { added: 15, skipped: 0 } });
  const backup = new Database(first.backup, { readonly: true });
  assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(backup.prepare('SELECT count(*) AS n FROM knowledge_cards').get().n, 0);
  backup.close();
  const afterImport = snapshot();
  for (const [table, rows] of Object.entries(before)) for (const row of rows) {
    assert.ok(afterImport[table].some(saved => isDeepStrictEqual(saved, row)), `原有 ${table} 数据不变`);
  }
  const imported = snapshot();
  const second = await run(env);
  assert.deepEqual(second.totals, { cards: { added: 0, skipped: 6 }, questions: { added: 0, skipped: 15 } });
  assert.deepEqual(second.cards, first.cards);
  assert.deepEqual(snapshot(), imported);
  // 已发布的卡片应保留发布状态。
  db.prepare("UPDATE knowledge_cards SET status='published' WHERE id=?").run(first.cards[0].id);
  const questionId = first.cards[0].exercises[0].id;
  db.prepare('DELETE FROM card_exercises WHERE id=?').run(questionId);
  const resumed = await run(env);
  assert.deepEqual(resumed.totals.questions, { added: 1, skipped: 14 });
  assert.equal(db.prepare('SELECT status FROM knowledge_cards WHERE id=?').get(first.cards[0].id).status, 'published');
  db.prepare("UPDATE card_exercises SET explanation='人工修改' WHERE id=?").run(first.cards[5].exercises[0].id);
  const conflict = snapshot();
  await assert.rejects(run(env), /题目冲突/);
  assert.deepEqual(snapshot(), conflict);
  // 在第二张卡片写入时失败，之前的课程、课时、卡片也必须回滚。
  db.exec("CREATE TRIGGER reject_aviation BEFORE INSERT ON knowledge_cards WHEN NEW.title LIKE '%02%' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  const course = db.prepare("INSERT INTO courses (title,grade_level,difficulty,created_by) VALUES ('回滚目标','junior','basic',?)").run(adminId);
  const rollback = snapshot();
  await assert.rejects(run({ ...env, PBL_IMPORT_COURSE_ID: String(course.lastInsertRowid) }), /injected failure/);
  assert.deepEqual(snapshot(), rollback);
  db.exec('DROP TRIGGER reject_aviation');
  await assert.rejects(run({ ...env, DB_PATH: path.join(dir, 'nonexistent.db') }));
  assert.equal(fs.existsSync(path.join(dir, 'nonexistent.db')), false);
  await assert.rejects(run({ ...env, PBL_IMPORT_COURSE_ID: '99999' }), /指定课程不存在/);
});
test('API：真实管理接口、重复导入、部分失败重试、管理员鉴权', async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'aviation-admin', password: 'Admin!123456' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const course = db.prepare("INSERT INTO courses (title,grade_level,difficulty,created_by) VALUES ('API目标','junior','basic',?)").run(adminId);
  const lesson = db.prepare("INSERT INTO lessons (course_id,title) VALUES (?,'API课时')").run(course.lastInsertRowid);
  const apiEnv = { PBL_IMPORT_MODE: 'api', PBL_IMPORT_API_URL: base, PBL_IMPORT_ADMIN_TOKEN: token, PBL_IMPORT_COURSE_ID: String(course.lastInsertRowid), PBL_IMPORT_LESSON_ID: String(lesson.lastInsertRowid) };
  db.exec("CREATE TRIGGER reject_api BEFORE INSERT ON knowledge_cards WHEN NEW.title LIKE '%02%' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  await assert.rejects(run(apiEnv), /500/);
  db.exec('DROP TRIGGER reject_api');
  const resumed = await run(apiEnv);
  assert.deepEqual(resumed.totals, { cards: { added: 5, skipped: 1 }, questions: { added: 12, skipped: 3 } });
  const before = snapshot();
  const repeated = await run(apiEnv);
  assert.deepEqual(repeated.totals, { cards: { added: 0, skipped: 6 }, questions: { added: 0, skipped: 15 } });
  assert.deepEqual(snapshot(), before);
  await assert.rejects(run({ ...apiEnv, PBL_IMPORT_ADMIN_TOKEN: 'invalid' }), /401/);
  db.prepare("UPDATE card_exercises SET answer_json='\"changed\"' WHERE id=?").run(resumed.cards[5].exercises[0].id);
  const changed = snapshot();
  await assert.rejects(run(apiEnv), /答案冲突/);
  assert.deepEqual(snapshot(), changed);
  await assert.rejects(run({ ...apiEnv, PBL_IMPORT_COURSE_ID: '1' }), /不属于/);
});
