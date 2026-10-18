-- Additive compatibility: retain the deployed campus/voyage CHECK and old image bindings.
ALTER TABLE courses ADD COLUMN public_theme TEXT CHECK(public_theme IS NULL OR public_theme IN('campus','sky','forest','beach'));
CREATE TABLE course_module_options (
 course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
 settings_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_by INTEGER REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE development_qualifications (
 mentor_id INTEGER NOT NULL REFERENCES users(id),course_id INTEGER NOT NULL REFERENCES courses(id),
 purpose TEXT NOT NULL,review_note TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),
 granted_by INTEGER NOT NULL REFERENCES users(id),granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,
 revoked_by INTEGER REFERENCES users(id),revoked_at TEXT,revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(mentor_id,course_id)
);
CREATE TABLE development_qualification_events (
 id INTEGER PRIMARY KEY,mentor_id INTEGER NOT NULL REFERENCES users(id),course_id INTEGER NOT NULL REFERENCES courses(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE course_package_uploads (
 id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),digest TEXT NOT NULL,package_id TEXT NOT NULL,
 package_version TEXT NOT NULL,manifest_json TEXT NOT NULL,staging_dir TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,UNIQUE(actor_id,request_key)
);
CREATE TABLE course_package_imports (
 id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),package_id TEXT NOT NULL,package_version TEXT NOT NULL,
 digest TEXT NOT NULL,target_key TEXT NOT NULL,course_id INTEGER NOT NULL REFERENCES courses(id),result_json TEXT NOT NULL,
 request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(package_id,package_version,target_key),UNIQUE(actor_id,request_key)
);
CREATE TABLE course_package_pending_media (
 id INTEGER PRIMARY KEY,import_id TEXT NOT NULL REFERENCES course_package_imports(id),course_id INTEGER NOT NULL REFERENCES courses(id),
 lesson_id INTEGER NOT NULL REFERENCES lessons(id),local_ref TEXT NOT NULL,title TEXT NOT NULL,note TEXT
);
