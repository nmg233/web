-- 016 已由主线课堂纪要迁移使用；账号闭环独立使用 017。
ALTER TABLE schools ADD COLUMN account_code TEXT;
CREATE UNIQUE INDEX idx_school_account_code ON schools(account_code) WHERE account_code IS NOT NULL;
-- 缩写永久保留，即使学校删除，新学校也不会复用旧用户名命名空间。
CREATE TABLE account_school_codes (school_id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
CREATE TABLE account_sequences (
  scope TEXT NOT NULL, role TEXT NOT NULL, last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope, role)
);
CREATE TABLE account_import_batches (
  id TEXT PRIMARY KEY, actor_id INTEGER NOT NULL, actor_auth_version INTEGER NOT NULL DEFAULT 0, fingerprint TEXT NOT NULL,
  request_key TEXT NOT NULL, input_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', progress INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{"accounts":[],"errors":[],"row_results":[]}',
  error_message TEXT, delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, request_key)
);
CREATE INDEX idx_account_batch_owner ON account_import_batches(actor_id, created_at);
CREATE INDEX idx_account_batch_fingerprint ON account_import_batches(actor_id, fingerprint);
CREATE TABLE account_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
  actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
