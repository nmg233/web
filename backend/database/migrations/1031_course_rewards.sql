-- Add scope without guessing any legacy gift's course or rewriting debits.
ALTER TABLE reward_gifts ADD COLUMN course_id INTEGER REFERENCES courses(id);
ALTER TABLE reward_images ADD COLUMN course_id INTEGER REFERENCES courses(id);
ALTER TABLE reward_orders ADD COLUMN course_id INTEGER REFERENCES courses(id);
ALTER TABLE reward_orders ADD COLUMN course_title TEXT;
ALTER TABLE reward_badge_grants ADD COLUMN course_id INTEGER REFERENCES courses(id);
ALTER TABLE reward_badge_grants ADD COLUMN course_title TEXT;
ALTER TABLE notification_outbox ADD COLUMN reward_course_id INTEGER REFERENCES courses(id);
ALTER TABLE courses ADD COLUMN lesson_badges_enabled INTEGER NOT NULL DEFAULT 0 CHECK(lesson_badges_enabled IN (0,1));
ALTER TABLE courses ADD COLUMN badge_revision INTEGER NOT NULL DEFAULT 1;
-- Existing lesson definitions are reliable evidence of the former enabled state.
UPDATE courses SET lesson_badges_enabled=1 WHERE EXISTS(SELECT 1 FROM lessons l JOIN lesson_badge_definitions b ON b.lesson_id=l.id WHERE l.course_id=courses.id);
ALTER TABLE lesson_badge_definitions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));
ALTER TABLE lesson_badge_definitions ADD COLUMN image_id TEXT REFERENCES reward_images(id);
ALTER TABLE lesson_badge_definitions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE student_badge_grants ADD COLUMN image_id TEXT REFERENCES reward_images(id);
CREATE INDEX reward_gift_course ON reward_gifts(course_id,published,id);
CREATE INDEX reward_order_course ON reward_orders(course_id,created_at,id);
