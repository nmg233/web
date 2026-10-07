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
//   初始密码统一为姓名拼音@123，ADMIN_PASSWORD 不再覆盖该规则。
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

// 3) 初始管理员与普通账号使用同一姓名拼音规则；不覆盖已有账号。
const { resolveUsername } = require('../helpers/username');
const { generateTemporaryPassword } = require('../services/tempPasswordService');
const suppliedUsername = (process.env.ADMIN_USERNAME || '').trim();
const realName = (process.env.ADMIN_REAL_NAME || '').trim() || '系统管理员';
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
try {
  const exists = suppliedUsername
    ? db.prepare('SELECT id,role FROM users WHERE username=?').get(suppliedUsername)
    : db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (exists) {
    if (suppliedUsername && exists.role !== 'admin') throw Object.assign(new Error('ADMIN_USERNAME 已被非管理员账号占用，请选择其他账号'), { status: 400 });
    console.log('已有账号，未修改用户名、密码或会话；需要重置时请使用授权流程。');
  } else {
    const password = generateTemporaryPassword(realName);
    db.transaction(() => {
      const username = resolveUsername(db, suppliedUsername, 'admin', realName, null);
      db.prepare("INSERT INTO users(username,password_hash,real_name,role,force_reset_password) VALUES(?,?,?,'admin',1)")
        .run(username,bcrypt.hashSync(password,10),realName);
      console.log('初始管理员已创建: ' + username + '（首次登录必须改密；初始密码规则见 README）');
    })();
  }
} catch (err) {
  console.error(err.status ? err.message : '管理员初始化失败，请检查配置'); process.exitCode=1;
} finally { db.close(); }
