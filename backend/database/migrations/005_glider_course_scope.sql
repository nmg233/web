-- 005：滑翔机试飞记录关联课程/课时（遗留记录为 NULL，按 D-2 同类策略仅管理员/本人可见）
ALTER TABLE glider_simulations ADD COLUMN course_id INTEGER;
ALTER TABLE glider_simulations ADD COLUMN lesson_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_glider_sims_course ON glider_simulations(course_id);
