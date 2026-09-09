// 档案权限策略（决策 D-1/D-2）。
const db = require('../config/database');
const { courseBelongsToMentor } = require('./courseScope');

// 学生是否在导师课程中有报名记录（含历史已移除报名，03 文档 #18：当前或历史上参加过）
function studentInMentorCourses(mentorId, studentId) {
  if (!mentorId || !studentId) return false;
  return !!db.prepare(`
    SELECT e.id FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ?
      AND (c.created_by = ? OR EXISTS (
        SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.instructor_id = ?
      ))
    LIMIT 1
  `).get(studentId, mentorId, mentorId);
}

// 查看档案：admin 全部；学生本人；教师本校；导师=历史上参加过其课程的学生
function canViewArchive(user, student) {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return student.id === user.id;
  if (user.role === 'teacher') return !!user.school_id && student.school_id === user.school_id;
  if (user.role === 'academic_mentor') return studentInMentorCourses(user.id, student.id);
  return false;
}

// 成长观察：admin/导师全量；教师限本校
function canAddObservation(user, student) {
  if (['admin', 'academic_mentor'].includes(user.role)) return true;
  return user.role === 'teacher' && !!user.school_id && student.school_id === user.school_id;
}

// 课程评价：admin 兜底；导师（其课程关系在控制器内结合 enrollment 校验）
function canEvaluateStudent(user, student) {
  if (user.role === 'admin') return true;
  return user.role === 'academic_mentor' && student.role === 'student';
}

module.exports = { canViewArchive, canAddObservation, canEvaluateStudent, studentInMentorCourses };
