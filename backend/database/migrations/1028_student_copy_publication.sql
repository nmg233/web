CREATE TABLE student_copy_scopes (
 scope TEXT PRIMARY KEY,
 draft_json TEXT NOT NULL DEFAULT '{}',
 published_json TEXT NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 0,
 published_revision INTEGER NOT NULL DEFAULT 0,
 updated_by INTEGER REFERENCES users(id),
 published_by INTEGER REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_at TEXT
);
CREATE TABLE student_copy_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 scope TEXT NOT NULL REFERENCES student_copy_scopes(scope),
 revision INTEGER NOT NULL,
 entries_json TEXT NOT NULL,
 action TEXT NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX student_copy_history_scope ON student_copy_history(scope,id);
