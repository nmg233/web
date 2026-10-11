-- Keep the plan slot when its real lesson is removed. The paired CHECK in 018
-- requires both values to change before the FK's ON DELETE SET NULL executes.
CREATE TRIGGER course_plan_detach_lesson BEFORE DELETE ON lessons
BEGIN
 UPDATE course_plan_nodes SET lesson_id=NULL,state='preparing' WHERE lesson_id=OLD.id;
END;
