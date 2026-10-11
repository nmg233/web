CREATE TABLE IF NOT EXISTS lesson_content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  fingerprint TEXT NOT NULL,
  content_json TEXT NOT NULL,
  legacy_compat INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS student_lesson_versions (
  student_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  content_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS retired_exercises (
  exercise_id INTEGER PRIMARY KEY REFERENCES card_exercises(id),
  retired_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exercise_feedback (
  student_id INTEGER NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL REFERENCES card_exercises(id),
  mentor_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, exercise_id)
);
CREATE TABLE IF NOT EXISTS report_content_versions (
  report_id INTEGER PRIMARY KEY REFERENCES lesson_learning_reports(id),
  content_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id)
);
CREATE TABLE IF NOT EXISTS lesson_version_repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  old_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
  new_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enrollment_completions (
  enrollment_id INTEGER PRIMARY KEY REFERENCES enrollments(id),
  lesson_manifest_json TEXT NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
