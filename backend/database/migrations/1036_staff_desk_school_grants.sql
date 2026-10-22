-- Additive only: historical approved school applications remain authoritative.
CREATE TABLE school_direct_grants (
 school_id INTEGER NOT NULL REFERENCES schools(id),
 mentor_id INTEGER NOT NULL REFERENCES users(id),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 actor_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(school_id,mentor_id)
);
CREATE INDEX school_direct_grants_mentor ON school_direct_grants(mentor_id,active,school_id);
CREATE INDEX staff_reports_queue ON lesson_learning_reports(status,student_id,lesson_id,version,id);
CREATE INDEX staff_works_queue ON works(review_status,enrollment_id,id);
CREATE INDEX staff_app_threads_queue ON application_conversations(needs_reply,updated_at,kind,application_id);
CREATE INDEX staff_feedback_queue ON feedbacks(reception_level,status,updated_at,id);
