-- 004：作品根记录唯一（同一学生+任务仅允许一个根作品）
-- 部署前必须执行审计 SQL（见 04 计划 3.2 第 3 条）：存在重复根记录时本迁移会失败。
CREATE UNIQUE INDEX IF NOT EXISTS idx_works_root ON works(student_id, task_id) WHERE parent_work_id IS NULL;
