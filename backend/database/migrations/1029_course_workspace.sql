-- Append only. Existing courses, map nodes, teaching content and rewards stay untouched.
ALTER TABLE courses ADD COLUMN learning_objectives TEXT;
ALTER TABLE courses ADD COLUMN automatic_map INTEGER NOT NULL DEFAULT 0 CHECK(automatic_map IN (0,1));
ALTER TABLE courses ADD COLUMN background_opacity REAL NOT NULL DEFAULT 1 CHECK(background_opacity BETWEEN 0 AND 1);
ALTER TABLE courses ADD COLUMN theme_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE course_theme_images (
 id TEXT PRIMARY KEY,
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('cover','desktop','mobile','mark')),
 uploaded_by INTEGER NOT NULL REFERENCES users(id),
 upload_key TEXT NOT NULL,
 digest TEXT NOT NULL,
 file_path TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(uploaded_by,course_id,upload_key)
);
CREATE TABLE course_theme_bindings (
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL,
 image_id TEXT NOT NULL REFERENCES course_theme_images(id),
 PRIMARY KEY(course_id,purpose)
);
