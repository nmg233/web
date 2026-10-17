const db = require('../config/database');

// column 仅由后端固定 SQL 调用点提供，不接受客户端输入。
// 保留历史报名关系（含 removed），便于导师追踪已结课、停用或归档学生。
function mentorStudentScope(column = 'u.id') {
  return `EXISTS (SELECT 1 FROM enrollments scope_e
    JOIN courses scope_c ON scope_c.id = scope_e.course_id
    WHERE scope_e.student_id = ${column}
      AND ${require('../helpers/courseScope').mentorCourseScope('scope_c.id')})`;
}

function mentorStudentParams(mentorId) {
  return [mentorId, mentorId];
}

function canViewStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'student') return user.id === student.id;
  if (user.role === 'teacher') return student.teacher_id === user.id;
  if (user.role === 'academic_mentor') {
    return !!db.prepare(`SELECT 1 FROM users u WHERE u.id = ? AND ${mentorStudentScope()}`)
      .get(student.id, ...mentorStudentParams(user.id));
  }
  return false;
}

module.exports = { mentorStudentScope, mentorStudentParams, canViewStudent };
