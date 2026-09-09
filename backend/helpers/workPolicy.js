// 作品权限策略（决策 D-1/D-2/D-6）。
// work 行需携带：student_id / student_school_id / review_status / enrollment_id / course_id / has_newer_version。
const { courseBelongsToMentor } = require('./courseScope');

// 评审：admin 全部；导师仅自己课程（含授课归属）；其余角色不可
function canReviewWork(user, work) {
  if (user.role === 'admin') return true;
  if (user.role !== 'academic_mentor') return false;
  // 遗留无报名关联的作品（enrollment_id/course_id 缺失）按决策 D-2：仅管理员可见
  if (!work.enrollment_id || !work.course_id) return false;
  return courseBelongsToMentor(user.id, work.course_id);
}

// 查看：admin 全部；导师=可评审范围；学生=本人；教师=本校+已通过（无报名关联的遗留作品按 D-2 不可见）
function canViewWork(user, work) {
  if (user.role === 'admin') return true;
  if (user.role === 'academic_mentor') return canReviewWork(user, work);
  if (user.role === 'student') return work.student_id === user.id;
  return user.role === 'teacher' && !!user.school_id
    && work.student_school_id === user.school_id
    && work.review_status === 'approved'
    && !!work.enrollment_id;
}

// 删除（决策 D-6）：学生可删 pending 或被打回的最新版本；
// 导师/教师/media 禁止；admin 仅限异常处理（已通过/有后续版本同样禁止）
function canDeleteWork(user, work) {
  if (user.role === 'admin') {
    return work.review_status !== 'approved' && !work.has_newer_version;
  }
  if (user.role === 'student' && work.student_id === user.id) {
    if (work.review_status === 'approved') return false;
    if (work.has_newer_version) return false;
    return work.review_status === 'pending' || work.review_status === 'rejected';
  }
  return false;
}

module.exports = { canViewWork, canReviewWork, canDeleteWork };
