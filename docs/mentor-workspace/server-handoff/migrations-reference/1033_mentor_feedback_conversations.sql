ALTER TABLE feedbacks ADD COLUMN course_id INTEGER REFERENCES courses(id);
ALTER TABLE feedbacks ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE feedbacks ADD COLUMN reception_level TEXT NOT NULL DEFAULT 'admin' CHECK(reception_level IN('admin','mentor'));
ALTER TABLE feedbacks ADD COLUMN assignee_id INTEGER REFERENCES users(id);
ALTER TABLE feedbacks ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE feedbacks ADD COLUMN mentor_followup_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE school_applications ADD COLUMN created_by INTEGER REFERENCES users(id);
UPDATE school_applications SET created_by=applicant_id;
CREATE TABLE feedback_reception_events (
 id INTEGER PRIMARY KEY, feedback_id INTEGER NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
 actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, from_level TEXT NOT NULL, to_level TEXT NOT NULL,
 reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE course_access_applications (
 id INTEGER PRIMARY KEY, applicant_id INTEGER NOT NULL REFERENCES users(id), course_id INTEGER NOT NULL REFERENCES courses(id),
 explanation TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, reason TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX pending_course_access ON course_access_applications(applicant_id,course_id) WHERE status='pending';
CREATE TABLE development_applications (
 id INTEGER PRIMARY KEY, applicant_id INTEGER NOT NULL REFERENCES users(id), course_id INTEGER REFERENCES courses(id),
 explanation TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, reason TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER REFERENCES users(id)
);
CREATE TABLE application_conversations (
 kind TEXT NOT NULL CHECK(kind IN('school','course','development')), application_id INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, needs_reply TEXT NOT NULL DEFAULT 'admin' CHECK(needs_reply IN('admin','applicant','none')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(kind,application_id)
);
INSERT INTO application_conversations(kind,application_id,needs_reply)
 SELECT 'school',id,CASE WHEN status='pending' THEN 'admin' ELSE 'none' END FROM school_applications;
CREATE TRIGGER school_application_thread AFTER INSERT ON school_applications BEGIN
 INSERT INTO application_conversations(kind,application_id,needs_reply) VALUES('school',NEW.id,CASE WHEN NEW.status='pending' THEN 'admin' ELSE 'none' END);
END;
CREATE TABLE application_messages (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL, application_id INTEGER NOT NULL,
 sender_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(kind,application_id) REFERENCES application_conversations(kind,application_id)
);
CREATE TABLE application_attachments (
 id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES application_messages(id),
 original_name TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL
);
CREATE INDEX feedback_course_reception ON feedbacks(course_id,reception_level,status,assignee_id);
