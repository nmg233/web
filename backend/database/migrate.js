// 轻量数据库迁移器：
// - 新建库：执行 schema.sql 后记录基线版本 001；
// - 既有库：检测 users 表已存在则直接记录基线，不再重复建表；
// - 增量：按序执行 migrations/ 下 NNN_*.sql（版本 > 已应用版本），
//   每个迁移在事务内执行并写入 schema_migrations。
const fs = require('fs');
const path = require('path');

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!hasUsers) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
  }

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  if (!applied.has(1)) {
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)').run('baseline_schema');
    applied.add(1);
  }

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (!Number.isInteger(version) || version <= 1 || applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    })();
    console.log(`✅ 数据库迁移 ${file} 已应用`);
  }
}

module.exports = { runMigrations };
