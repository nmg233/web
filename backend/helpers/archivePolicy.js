// 档案权限策略（决策 D-1/D-2）。
const { canViewStudent } = require('../policies/studentPolicy');

// 学生是否在导师课程中有报名记录（含历史已移除报名，03 文档 #18：当前或历史上参加过）
function studentInMentorCourses(mentorId, studentId) {
  if (!mentorId || !studentId) return false;
  return canViewStudent({ id: mentorId, role: 'academic_mentor' }, { id: studentId });
}

// 查看档案：admin 全部；学生本人；教师明确分配学生；导师=历史上参加过其负责课程的学生
function canViewArchive(user, student) {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return student.id === user.id;
  if (user.role === 'teacher') return require('../services/teacherObservations').can(user,student.id);
  if (user.role === 'academic_mentor') return studentInMentorCourses(user.id, student.id);
  return false;
}

// 成长记录只有管理员和执行导师可写；教师始终只读。
function canAddObservation(user, student) {
  if (['admin', 'academic_mentor'].includes(user.role)) return true;
  return false;
}

// 课程评价：admin 兜底；导师（其课程关系在控制器内结合 enrollment 校验）
function canEvaluateStudent(user, student) {
  if (user.role === 'admin') return true;
  return user.role === 'academic_mentor' && student.role === 'student';
}

module.exports = { canViewArchive, canAddObservation, canEvaluateStudent, studentInMentorCourses };
