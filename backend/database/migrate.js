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

  // 旧版将学生状态迁移记为 003；合并后的 003 改为档案时间轴，
  // 原学生状态 SQL 移到 008。先核实旧结构，再只调整版本记录，
  // 让新的 003 正常补 work_id，避免重复添加 archived_at。
  const legacy = db.prepare('SELECT name FROM schema_migrations WHERE version = 3').get();
  if (legacy?.name === '003_student_lifecycle.sql') {
    const users = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
    const events = new Set(db.prepare('PRAGMA table_info(student_status_events)').all().map((column) => column.name));
    const hasVersion8 = db.prepare('SELECT 1 FROM schema_migrations WHERE version = 8').get();
    if (hasVersion8 || !['archived_at', 'auth_version'].every((column) => users.has(column)) ||
        !['student_id', 'actor_id', 'action', 'reason'].every((column) => events.has(column))) {
      throw new Error('旧版学生状态迁移记录与实际结构不一致，请先核对数据库备份和 schema_migrations');
    }
    db.prepare("UPDATE schema_migrations SET version = 8, name = '008_student_lifecycle.sql' WHERE version = 3").run();
  }

  // 摘要在合并前曾使用 014；main 的 014/015 属于滑翔机。
  // 已应用旧摘要迁移的库只调整记录到 016，让滑翔机迁移继续执行，保留摘要原文。
  const legacyReplay = db.prepare('SELECT name FROM schema_migrations WHERE version = 14').get();
  if (legacyReplay?.name === '014_replay_summary.sql') {
    const hasSummary = db.prepare('PRAGMA table_info(course_replays)').all().some((column) => column.name === 'summary');
    const hasVersion16 = db.prepare('SELECT 1 FROM schema_migrations WHERE version = 16').get();
    if (!hasSummary || hasVersion16) {
      throw new Error('旧版摘要迁移记录与实际结构不一致，请先核对数据库备份和 schema_migrations');
    }
    db.prepare("UPDATE schema_migrations SET version = 16, name = '016_replay_summary.sql' WHERE version = 14").run();
  }

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));

  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!hasUsers) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    // 新库：schema.sql 已包含全部已发布迁移的结构变更，批量标记为已应用，避免重复执行 ALTER
    const mark = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
    if (!applied.has(1)) {
      mark.run(1, 'baseline_schema');
      applied.add(1);
    }
    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10);
      if (version > 1 && !applied.has(version)) {
        mark.run(version, file);
        applied.add(version);
      }
    }
  } else if (!applied.has(1)) {
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)').run('baseline_schema');
    applied.add(1);
  }
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (!Number.isInteger(version) || version <= 1 || applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      if (version === 18) require('../helpers/lessonVersions').migrateLegacy(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    })();
    console.log(`✅ 数据库迁移 ${file} 已应用`);
  }
}

module.exports = { runMigrations };
