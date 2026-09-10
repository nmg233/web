ALTER TABLE users ADD COLUMN archived_at DATETIME;
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE student_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('disable','archive','restore')),
  reason TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
