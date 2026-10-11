-- Additive only: no teaching content, test IDs, progress or enrollment changes.
ALTER TABLE courses ADD COLUMN presentation_theme TEXT NOT NULL DEFAULT 'campus' CHECK(presentation_theme IN ('campus','voyage'));
CREATE TABLE course_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE lessons ADD COLUMN chapter_id INTEGER REFERENCES course_chapters(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN teaching_tip TEXT;
ALTER TABLE resources ADD COLUMN file_name TEXT;
ALTER TABLE resources ADD COLUMN file_type TEXT;
ALTER TABLE resources ADD COLUMN upload_token TEXT;
ALTER TABLE resources ADD COLUMN upload_digest TEXT;
CREATE UNIQUE INDEX resources_upload_token ON resources(course_id,upload_by,upload_token) WHERE upload_token IS NOT NULL;
CREATE TABLE course_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL CHECK(experiment_id='glider'),
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  stage INTEGER CHECK(stage BETWEEN 0 AND 3),
  card_id INTEGER REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE UNIQUE INDEX course_experiments_source ON course_experiments(course_id,experiment_id,COALESCE(lesson_id,0),COALESCE(stage,-1),COALESCE(card_id,0));
CREATE TABLE course_covers (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
