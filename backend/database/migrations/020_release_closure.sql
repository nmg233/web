CREATE TABLE student_school_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  source_school_id INTEGER, target_school_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
  context_json TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE report_replacements (
  report_id INTEGER PRIMARY KEY REFERENCES lesson_learning_reports(id),
  content_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
  actor_id INTEGER NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
  replacement_report_id INTEGER REFERENCES lesson_learning_reports(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE notification_outbox ADD COLUMN next_retry_at DATETIME;
ALTER TABLE notification_outbox ADD COLUMN quarantined_at DATETIME;
CREATE INDEX idx_notification_outbox_retry ON notification_outbox(delivered_at,quarantined_at,next_retry_at,created_at);
CREATE TABLE retired_exercises_next (
  exercise_id INTEGER PRIMARY KEY REFERENCES card_exercises(id) ON DELETE CASCADE,
  retired_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO retired_exercises_next SELECT * FROM retired_exercises;
DROP TABLE retired_exercises;
ALTER TABLE retired_exercises_next RENAME TO retired_exercises;
