const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, '..', 'database', 'pbl_platform.db');
const db = new Database(dbPath);

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 版本化迁移：新建库执行 schema.sql 基线，既有库仅记录基线并应用增量迁移
require('../database/migrate').runMigrations(db);

function getTableSql(tableName) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return row ? row.sql : '';
}

// 说明：早期曾在此用「重命名重建」迁移 courses 表默认状态（draft→published）。
// 该迁移已废止：新建库 schema.sql 默认即为 draft，且课程创建/种子均显式写入
// status，不再依赖表级默认值；重命名重建还会改写子表外键引用（legacy_alter_table
// 在事务内被 SQLite 忽略），存在破坏外键的风险，故整体移除。

function migrateLegacyMentorRole() {
  const sql = getTableSql('users');
  if (!sql) return;
  db.prepare("UPDATE users SET role = 'academic_mentor' WHERE role = 'executive_mentor'").run();
}
migrateLegacyMentorRole();

const workColumns = db.prepare('PRAGMA table_info(works)').all().map((c) => c.name);
if (!workColumns.includes('review_status')) {
  db.exec("ALTER TABLE works ADD COLUMN review_status TEXT DEFAULT 'pending'");
}
if (!workColumns.includes('reject_reason')) {
  db.exec('ALTER TABLE works ADD COLUMN reject_reason TEXT');
}
if (!workColumns.includes('parent_work_id')) db.exec('ALTER TABLE works ADD COLUMN parent_work_id INTEGER');
if (!workColumns.includes('version')) db.exec('ALTER TABLE works ADD COLUMN version INTEGER DEFAULT 1');
if (!workColumns.includes('file_name')) db.exec('ALTER TABLE works ADD COLUMN file_name TEXT');

// 课时线下场次字段（轻量迁移：老库补齐列）
const lessonColumns = db.prepare('PRAGMA table_info(lessons)').all().map((c) => c.name);
if (!lessonColumns.includes('start_at')) db.exec('ALTER TABLE lessons ADD COLUMN start_at TEXT');
if (!lessonColumns.includes('end_at')) db.exec('ALTER TABLE lessons ADD COLUMN end_at TEXT');
if (!lessonColumns.includes('location')) db.exec('ALTER TABLE lessons ADD COLUMN location TEXT');
if (!lessonColumns.includes('instructor_id')) db.exec('ALTER TABLE lessons ADD COLUMN instructor_id INTEGER');
db.exec(`CREATE TABLE IF NOT EXISTS work_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, work_id INTEGER NOT NULL UNIQUE, reviewer_id INTEGER NOT NULL, comment TEXT, suggestion TEXT, problem_discovery INTEGER, solution_design INTEGER, hands_on INTEGER, data_analysis INTEGER, presentation INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE, FOREIGN KEY(reviewer_id) REFERENCES users(id)); CREATE TABLE IF NOT EXISTS growth_records (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, event_type TEXT NOT NULL DEFAULT 'teacher', description TEXT NOT NULL, recorded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(recorded_by) REFERENCES users(id));`);

const reviewColumns = db.prepare('PRAGMA table_info(work_reviews)').all();
if (reviewColumns.some((c) => ['problem_discovery', 'solution_design', 'hands_on', 'data_analysis', 'presentation'].includes(c.name) && c.notnull)) {
  db.exec(`
    ALTER TABLE work_reviews RENAME TO work_reviews_required_scores;
    CREATE TABLE work_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, work_id INTEGER NOT NULL UNIQUE, reviewer_id INTEGER NOT NULL, comment TEXT, suggestion TEXT, problem_discovery INTEGER, solution_design INTEGER, hands_on INTEGER, data_analysis INTEGER, presentation INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE, FOREIGN KEY(reviewer_id) REFERENCES users(id));
    INSERT INTO work_reviews SELECT * FROM work_reviews_required_scores;
    DROP TABLE work_reviews_required_scores;
  `);
}

const schoolColumns = db.prepare('PRAGMA table_info(schools)').all().map((c) => c.name);
if (!schoolColumns.includes('description')) {
  db.exec('ALTER TABLE schools ADD COLUMN description TEXT');
}
if (!schoolColumns.includes('tags')) {
  db.exec('ALTER TABLE schools ADD COLUMN tags TEXT');
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('profile')) {
  db.exec('ALTER TABLE users ADD COLUMN profile TEXT');
}
// 负责教师 / 负责导师（管理员分配用）
if (!userColumns.includes('teacher_id')) {
  db.exec('ALTER TABLE users ADD COLUMN teacher_id INTEGER');
}
if (!userColumns.includes('mentor_id')) {
  db.exec('ALTER TABLE users ADD COLUMN mentor_id INTEGER');
}
// 强制修改密码标志：管理员重置密码后置 1，用户自助改密成功后置 0
if (!userColumns.includes('force_reset_password')) {
  db.exec('ALTER TABLE users ADD COLUMN force_reset_password INTEGER NOT NULL DEFAULT 0');
}

// 刷新令牌表（无感刷新 token 用）
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
if (!taskColumns.includes('deadline')) db.exec('ALTER TABLE tasks ADD COLUMN deadline DATETIME');
db.exec(`CREATE TABLE IF NOT EXISTS lesson_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  last_position INTEGER DEFAULT 0,
  completed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  UNIQUE(student_id, lesson_id)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS course_replays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_path TEXT NOT NULL,
  duration_seconds INTEGER,
  recording_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);`);

// 反馈模块兼容迁移：应用启动时为已有数据库补齐表和索引。
db.exec(`
  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_no TEXT UNIQUE,
    user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('suggestion','bug','question','content','other')),
    module TEXT CHECK(module IS NULL OR module IN ('auth','dashboard','courses','students','works','archives','assistant','other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    contact TEXT,
    allow_contact INTEGER NOT NULL DEFAULT 1 CHECK(allow_contact IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','waiting_user','resolved','closed','rejected')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
    resolution TEXT,
    source_path TEXT,
    client_info TEXT,
    satisfaction INTEGER CHECK(satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    closed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS feedback_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    sender_id INTEGER,
    message_type TEXT NOT NULL DEFAULT 'reply' CHECK(message_type IN ('reply','note','system')),
    content TEXT NOT NULL,
    is_internal INTEGER NOT NULL DEFAULT 0 CHECK(is_internal IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES feedbacks(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS feedback_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    message_id INTEGER,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES feedbacks(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES feedback_messages(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status, priority, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_messages_feedback ON feedback_messages(feedback_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_feedback_attachments_feedback ON feedback_attachments(feedback_id);
`);

// 站内通知兼容迁移。
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_key TEXT NOT NULL,
    dedupe_key TEXT UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    category TEXT NOT NULL CHECK(category IN ('feedback','course','task','work','archive','account','system','security')),
    level TEXT NOT NULL DEFAULT 'normal' CHECK(level IN ('normal','important','urgent','security')),
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','scheduled','published','withdrawn')),
    action_url TEXT,
    business_type TEXT,
    business_id INTEGER,
    target_type TEXT NOT NULL DEFAULT 'users',
    target_config TEXT,
    created_by INTEGER,
    is_forced INTEGER NOT NULL DEFAULT 0 CHECK(is_forced IN (0, 1)),
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at DATETIME,
    withdrawn_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (withdrawn_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0, 1)),
    read_at DATETIME,
    is_hidden INTEGER NOT NULL DEFAULT 0 CHECK(is_hidden IN (0, 1)),
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(notification_id, user_id),
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_key, business_type, business_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_published ON notifications(status, published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_hidden, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read, is_hidden);
`);

// 滑翔机模拟记录兼容迁移（学生提交参数 -> 后端运行 -> 落库结果）。
db.exec(`
  CREATE TABLE IF NOT EXISTS glider_simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    dihedral_deg REAL NOT NULL DEFAULT 0,
    cg_x REAL NOT NULL DEFAULT 0,
    speed REAL NOT NULL DEFAULT 36,
    alt REAL NOT NULL DEFAULT 150,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','error')),
    state TEXT,
    glide_time REAL,
    summary_json TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_glider_sims_student ON glider_simulations(student_id, id DESC);
`);

console.log('✅ SQLite 数据库连接成功:', dbPath);

module.exports = db;
