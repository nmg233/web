-- Existing lessons remain explicitly legacy-formal; API-created lessons are draft.
-- No answer, report, enrollment or student version is rewritten by this migration.
ALTER TABLE lessons ADD COLUMN publication_state TEXT NOT NULL DEFAULT 'legacy' CHECK(publication_state IN ('legacy','draft','published','closed'));
ALTER TABLE lessons ADD COLUMN published_version_id INTEGER REFERENCES lesson_content_versions(id);
ALTER TABLE lessons ADD COLUMN closure_reason TEXT;
CREATE TABLE publication_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL REFERENCES courses(id),
 lesson_id INTEGER REFERENCES lessons(id),
 applicant_id INTEGER NOT NULL REFERENCES users(id),
 content_version_id INTEGER REFERENCES lesson_content_versions(id),
 snapshot_json TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason TEXT NOT NULL,
 decision_reason TEXT,
 decided_by INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 decided_at TEXT
);
CREATE UNIQUE INDEX publication_pending_target ON publication_requests(course_id,COALESCE(lesson_id,0)) WHERE status='pending';
CREATE TABLE lesson_publication_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL REFERENCES courses(id),
 lesson_id INTEGER NOT NULL REFERENCES lessons(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('close','publish')),
 content_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE course_content_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL REFERENCES courses(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
