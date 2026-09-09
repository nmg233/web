-- 003：成长时间轴事件关联作品（work_id 去重，见计划 C-8）
ALTER TABLE growth_records ADD COLUMN work_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_growth_records_work ON growth_records(work_id);
