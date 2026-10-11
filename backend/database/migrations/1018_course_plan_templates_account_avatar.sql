-- Additive metadata only. No progress, enrollment or teaching seed changes.
ALTER TABLE users ADD COLUMN avatar_preset TEXT CHECK(avatar_preset IN ('pilot','glider','ginkgo','robot','telescope','rocket','book','observatory'));
ALTER TABLE courses ADD COLUMN map_mode TEXT NOT NULL DEFAULT 'chapters' CHECK(map_mode IN ('chapters','plan'));
ALTER TABLE lessons ADD COLUMN presentation_type TEXT NOT NULL DEFAULT 'learning' CHECK(presentation_type IN ('learning','visit','theory','experiment'));
ALTER TABLE lessons ADD COLUMN content_state TEXT NOT NULL DEFAULT 'ready' CHECK(content_state IN ('ready','preparing'));
ALTER TABLE lessons ADD COLUMN article_url TEXT;
ALTER TABLE lessons ADD COLUMN article_title TEXT;
ALTER TABLE lessons ADD COLUMN moments_note TEXT;
CREATE TABLE course_plan_nodes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 100),
 lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
 state TEXT NOT NULL DEFAULT 'preparing' CHECK(state IN ('linked','preparing')),
 UNIQUE(course_id,position), UNIQUE(course_id,lesson_id),
 CHECK((state='linked' AND lesson_id IS NOT NULL) OR (state='preparing' AND lesson_id IS NULL))
);
