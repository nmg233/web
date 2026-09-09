// ============================================
// 正式环境数据库初始化（provision）
// 用途：首次上线 / 需要“不重置数据”的前提下补齐表结构并创建初始管理员。
//
// 与 db:init 的区别：
//   - 不删除任何数据，也绝不写入测试种子（admin123 等一律不出现）；
//   - 幂等：重复执行不会重复建表、也不会创建重复管理员；
//   - 允许在 NODE_ENV=production 下运行（生产专用入口），但拒绝 --force。
//
// 用法（生产，systemd 的 EnvironmentFile 已注入相关变量）：
//   ADMIN_USERNAME=<管理员账号> \
//   ADMIN_PASSWORD=<至少12位强密码> \
//   ADMIN_REAL_NAME=<姓名> \
//   DB_PATH=/datadisk/pbl-platform/database/pbl_platform.db \
//   node database/provision.js
// ============================================
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

// 与 config/database.js 保持一致：DB_PATH 支持绝对路径；缺省落在 backend/database/pbl_platform.db
const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, 'pbl_platform.db');

if (process.argv.includes('--force')) {
  console.error('❌ db:provision 不支持 --force：本脚本永不删除或重置数据。需要清库请人工确认后操作。');
  process.exit(1);
}

console.log('📦 db:provision —— 正式数据库初始化（仅建表 + 初始管理员，不删除任何数据）');
console.log('   目标数据库:', dbPath);

// 1) 库文件不存在时，先执行 schema.sql 建全部主表（纯 DDL，无种子数据）
if (!fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  require('./migrate').runMigrations(db);
  db.close();
  console.log('✅ 主表结构已创建（schema.sql）');
} else {
  console.log('ℹ️  数据库已存在，跳过全量建表（保留既有数据）');
}

// 2) 触发 config/database.js 的幂等兼容迁移（补齐缺失列、feedback/refresh_tokens 等新表与索引）
require('../config/database');
console.log('✅ 兼容迁移已执行（幂等）');

// 3) 创建初始管理员（仅当同名账号不存在；创建后强制首次登录改密）
const username = (process.env.ADMIN_USERNAME || '').trim();
const password = process.env.ADMIN_PASSWORD || '';
const realName = (process.env.ADMIN_REAL_NAME || '').trim() || '系统管理员';
if (!username || password.length < 12) {
  console.error('❌ 必须提供 ADMIN_USERNAME 以及长度至少 12 位的 ADMIN_PASSWORD 环境变量。');
  console.error('   示例：ADMIN_USERNAME=admin ADMIN_PASSWORD=<强密码> npm run db:provision');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (exists) {
  console.error(`⚠️  用户名 ${username} 已存在，未重复创建。如需重置密码，请使用管理员重置密码流程。`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, real_name, role, force_reset_password) VALUES (?, ?, ?, 'admin', 1)"
  ).run(username, hash, realName);
  console.log(`✅ 初始管理员已创建: ${username}（${realName}，首次登录将被要求修改密码）`);
}
db.close();

console.log('\n🎉 db:provision 完成。请通过正常启动流程验证 /api/health。');
