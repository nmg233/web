ALTER TABLE courses ADD COLUMN school_scope_revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE course_school_scopes (
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 school_id INTEGER NOT NULL REFERENCES schools(id),
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(course_id,school_id)
);
CREATE TABLE enrollment_access_confirmations (
 enrollment_id INTEGER PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
 school_id INTEGER REFERENCES schools(id), source TEXT NOT NULL,
 actor_id INTEGER REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Freeze individual existing enrollments, never infer an entire school's admission rights.
INSERT INTO enrollment_access_confirmations(enrollment_id,school_id,source,reason)
 SELECT e.id,u.school_id,'legacy','迁移时已存在的报名，保留原合法访问，不授予新增招生范围' FROM enrollments e JOIN users u ON u.id=e.student_id;
CREATE TABLE mentor_scope_events (
 id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), course_id INTEGER REFERENCES courses(id),
 school_id INTEGER REFERENCES schools(id), action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE teacher_observation_grants (
 teacher_id INTEGER NOT NULL REFERENCES users(id), student_id INTEGER NOT NULL REFERENCES users(id),
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, school_id INTEGER REFERENCES schools(id),
 actor_id INTEGER REFERENCES users(id), source TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(teacher_id,student_id,course_id)
);
CREATE TABLE legacy_teacher_students (
 teacher_id INTEGER NOT NULL REFERENCES users(id), student_id INTEGER NOT NULL REFERENCES users(id),
 school_id INTEGER REFERENCES schools(id), PRIMARY KEY(teacher_id,student_id)
);
INSERT INTO legacy_teacher_students(teacher_id,student_id,school_id)
 SELECT t.id,s.id,s.school_id FROM users s JOIN users t ON t.id=s.teacher_id AND t.role='teacher' WHERE s.role='student';
INSERT INTO teacher_observation_grants(teacher_id,student_id,course_id,school_id,source)
 SELECT DISTINCT t.id,s.id,e.course_id,s.school_id,'legacy_teacher_id' FROM users s
 JOIN users t ON t.id=s.teacher_id AND t.role='teacher' JOIN enrollments e ON e.student_id=s.id;
CREATE TABLE teacher_observation_events (
 id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id), student_id INTEGER NOT NULL REFERENCES users(id),
 course_id INTEGER NOT NULL REFERENCES courses(id), actor_id INTEGER NOT NULL REFERENCES users(id),
 active INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE school_created_teachers (
 teacher_id INTEGER PRIMARY KEY REFERENCES users(id), actor_id INTEGER NOT NULL REFERENCES users(id),
 school_id INTEGER NOT NULL REFERENCES schools(id), request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(actor_id,request_key)
);
CREATE TABLE organization_account_delegations (
 student_id INTEGER NOT NULL REFERENCES users(id), mentor_id INTEGER NOT NULL REFERENCES users(id),
 school_id INTEGER NOT NULL REFERENCES schools(id), active INTEGER NOT NULL DEFAULT 1,
 actor_id INTEGER NOT NULL REFERENCES users(id), reason TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(student_id,mentor_id)
);
