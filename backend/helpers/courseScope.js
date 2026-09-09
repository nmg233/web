// 导师课程归属模型（决策 D-1）：课程创建者 或 该课程任一课时授课人。
// 课程移交只需调整 created_by / instructor_id 即可恢复权限。
const db = require('../config/database');

function courseBelongsToMentor(mentorId, courseId) {
  if (!mentorId || !courseId) return false;
  return !!db.prepare(`
    SELECT c.id FROM courses c
    WHERE c.id = ?
      AND (c.created_by = ? OR EXISTS (
        SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.instructor_id = ?
      ))
    LIMIT 1
  `).get(courseId, mentorId, mentorId);
}

module.exports = { courseBelongsToMentor };
