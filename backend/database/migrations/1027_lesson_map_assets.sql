CREATE TABLE lesson_map_images (
 id TEXT PRIMARY KEY,
 course_id INTEGER NOT NULL REFERENCES courses(id),
 lesson_id INTEGER REFERENCES lessons(id),
 uploaded_by INTEGER NOT NULL REFERENCES users(id),
 upload_key TEXT NOT NULL,
 digest TEXT NOT NULL,
 file_path TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(uploaded_by,course_id,upload_key)
);
ALTER TABLE lessons ADD COLUMN map_image_id TEXT REFERENCES lesson_map_images(id);
ALTER TABLE lessons ADD COLUMN map_art_preset TEXT NOT NULL DEFAULT 'rock';
ALTER TABLE lessons ADD COLUMN landing_x REAL NOT NULL DEFAULT 0.5;
ALTER TABLE lessons ADD COLUMN landing_y REAL NOT NULL DEFAULT 0.7;
-- Freeze the previous renderer's art selection for existing lessons only.
-- Newly created lessons use rock, independent of teaching type or route number.
UPDATE lessons SET map_art_preset=CASE presentation_type
 WHEN 'visit' THEN 'vr' WHEN 'theory' THEN 'theory' WHEN 'experiment' THEN 'experiment'
 ELSE CASE (COALESCE((SELECT position FROM course_plan_nodes n WHERE n.course_id=lessons.course_id AND n.lesson_id=lessons.id ORDER BY position LIMIT 1),(SELECT COUNT(*) FROM lessons old WHERE old.course_id=lessons.course_id AND (old.sort_order<lessons.sort_order OR (old.sort_order=lessons.sort_order AND old.id<=lessons.id))))-1)%3
  WHEN 0 THEN 'moon-base' WHEN 1 THEN 'orbital-berth' ELSE 'asteroid-outpost' END END,
 landing_x=CASE WHEN presentation_type NOT IN ('visit','theory','experiment') AND (COALESCE((SELECT position FROM course_plan_nodes n WHERE n.course_id=lessons.course_id AND n.lesson_id=lessons.id ORDER BY position LIMIT 1),(SELECT COUNT(*) FROM lessons old WHERE old.course_id=lessons.course_id AND (old.sort_order<lessons.sort_order OR (old.sort_order=lessons.sort_order AND old.id<=lessons.id))))-1)%3=2 THEN 0.53 ELSE 0.5 END,
 landing_y=CASE presentation_type WHEN 'visit' THEN 0.7 WHEN 'theory' THEN 0.7 WHEN 'experiment' THEN 0.65
 ELSE CASE (COALESCE((SELECT position FROM course_plan_nodes n WHERE n.course_id=lessons.course_id AND n.lesson_id=lessons.id ORDER BY position LIMIT 1),(SELECT COUNT(*) FROM lessons old WHERE old.course_id=lessons.course_id AND (old.sort_order<lessons.sort_order OR (old.sort_order=lessons.sort_order AND old.id<=lessons.id))))-1)%3 WHEN 0 THEN 0.65 WHEN 1 THEN 0.68 ELSE 0.66 END END;
