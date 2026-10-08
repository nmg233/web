ALTER TABLE schools ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1));
CREATE TABLE IF NOT EXISTS notification_outbox (
  event_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, recipients_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  delivered_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_results (
  actor_id INTEGER NOT NULL REFERENCES users(id), scope TEXT NOT NULL, request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL, result_json TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(actor_id, scope, request_key)
);
-- 组织标识保留为历史值，不外键级联删除；名称和原关系另存快照。
CREATE TABLE IF NOT EXISTS class_school_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL, source_school_id INTEGER NOT NULL, target_school_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, members_json TEXT NOT NULL, context_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_class_school_transfers_class ON class_school_transfers(class_id,id);
