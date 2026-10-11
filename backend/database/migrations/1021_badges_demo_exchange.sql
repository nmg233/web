-- Additive, local teaching environment. No teaching completion or coin ledger seed.
CREATE TABLE lesson_badge_definitions (
 lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
 name TEXT NOT NULL, art_id TEXT NOT NULL CHECK(art_id IN ('vr','theory','glider')),
 description TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO lesson_badge_definitions(lesson_id,name,art_id,description)
 SELECT l.id, CASE l.presentation_type WHEN 'visit' THEN 'VR参观' WHEN 'theory' THEN '理论探索' ELSE '滑翔机实践' END,
 CASE l.presentation_type WHEN 'visit' THEN 'vr' WHEN 'theory' THEN 'theory' ELSE 'glider' END, '完成本课时的真实学习要求后获得'
 FROM lessons l JOIN course_plan_nodes p ON p.lesson_id=l.id
 WHERE p.position BETWEEN 1 AND 3 AND l.presentation_type IN ('visit','theory','experiment');
CREATE TABLE student_badge_grants (
 id TEXT PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
 name TEXT NOT NULL, art_id TEXT NOT NULL, description TEXT NOT NULL,
 lesson_title TEXT NOT NULL, course_title TEXT NOT NULL, criterion_snapshot TEXT NOT NULL,
 earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, shown_at TEXT,
 UNIQUE(student_id,lesson_id)
);
CREATE TABLE demo_exchange_events (
 id TEXT PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL, gift_id TEXT NOT NULL, gift_name TEXT NOT NULL,
 gift_type TEXT NOT NULL CHECK(gift_type IN ('physical','badge')), art_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, notification_id INTEGER REFERENCES notifications(id),
 UNIQUE(student_id,operation_id)
);
CREATE INDEX badge_grant_owner ON student_badge_grants(student_id,earned_at);
CREATE INDEX demo_exchange_owner ON demo_exchange_events(student_id,created_at);
