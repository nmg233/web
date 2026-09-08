-- 002：选课管理留痕（软删除 + 导入人）
-- 新库由 schema.sql 直接提供这些列（迁移器会把已发布迁移批量标记为已应用）；
-- 老库在此补齐。ALTER 在事务内执行，失败会整体回滚。
ALTER TABLE enrollments ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE enrollments ADD COLUMN enrolled_by INTEGER;
ALTER TABLE enrollments ADD COLUMN removed_at DATETIME;
ALTER TABLE enrollments ADD COLUMN removed_by INTEGER;
ALTER TABLE enrollments ADD COLUMN remove_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
