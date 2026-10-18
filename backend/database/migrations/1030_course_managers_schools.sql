CREATE TABLE course_managers (
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 mentor_id INTEGER NOT NULL REFERENCES users(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 source TEXT NOT NULL, granted_by INTEGER REFERENCES users(id),
 granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_by INTEGER REFERENCES users(id), revoked_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(course_id,mentor_id)
);
CREATE TABLE course_manager_events (
 id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 mentor_id INTEGER NOT NULL REFERENCES users(id), actor_id INTEGER REFERENCES users(id),
 action TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO course_managers(course_id,mentor_id,source)
 SELECT c.id,u.id,'legacy_creator' FROM courses c JOIN users u ON u.id=c.created_by WHERE u.role='academic_mentor';
INSERT OR IGNORE INTO course_managers(course_id,mentor_id,source)
 SELECT DISTINCT l.course_id,u.id,'legacy_instructor' FROM lessons l JOIN users u ON u.id=l.instructor_id WHERE u.role='academic_mentor';
INSERT INTO course_manager_events(course_id,mentor_id,action,reason)
 SELECT course_id,mentor_id,'migrated',source FROM course_managers;
-- Creation establishes an explicit, independently revocable relation. Later instructor/creator edits never grant access.
CREATE TRIGGER initial_course_manager AFTER INSERT ON courses
 WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND role='academic_mentor')
 BEGIN
 INSERT INTO course_managers(course_id,mentor_id,source,granted_by) VALUES(NEW.id,NEW.created_by,'creator',NEW.created_by);
 INSERT INTO course_manager_events(course_id,mentor_id,actor_id,action,reason) VALUES(NEW.id,NEW.created_by,NEW.created_by,'created','自建课程初始授权');
 END;
CREATE TABLE school_applications (
 id INTEGER PRIMARY KEY, applicant_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, normalized_name TEXT NOT NULL, region TEXT NOT NULL,
 contact TEXT, contact_details TEXT, explanation TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 school_id INTEGER REFERENCES schools(id), reviewed_by INTEGER REFERENCES users(id),
 reviewed_at TEXT, reason TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_pending_school_application ON school_applications(applicant_id,normalized_name) WHERE status='pending';
CREATE TABLE school_managers (
 school_id INTEGER NOT NULL REFERENCES schools(id), mentor_id INTEGER NOT NULL REFERENCES users(id),
 application_id INTEGER NOT NULL REFERENCES school_applications(id), active INTEGER NOT NULL DEFAULT 1,
 granted_by INTEGER NOT NULL REFERENCES users(id), granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_by INTEGER REFERENCES users(id), revoked_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(school_id,mentor_id)
);
CREATE TABLE school_management_events (
 id INTEGER PRIMARY KEY, school_id INTEGER REFERENCES schools(id), actor_id INTEGER NOT NULL REFERENCES users(id),
 mentor_id INTEGER REFERENCES users(id), application_id INTEGER REFERENCES school_applications(id),
 action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE school_created_accounts (
 student_id INTEGER PRIMARY KEY REFERENCES users(id), actor_id INTEGER NOT NULL REFERENCES users(id),
 school_id INTEGER NOT NULL REFERENCES schools(id), class_id INTEGER NOT NULL REFERENCES classes(id),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(actor_id,request_key)
);
