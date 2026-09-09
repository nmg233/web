// 滑翔机试飞权限策略（决策 D-7）。
const { courseBelongsToMentor } = require('./courseScope');

function canSubmitSimulation(user) {
  return user.role === 'student';
}

// row 需携带 student_id 与 course_id。
// admin=全部；student=本人；mentor=自己课程（创建或授课）；teacher/media=无；
// 遗留无课程关联记录（course_id 为 NULL）按 D-2 仅管理员/本人可见。
function canViewSimulation(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return row.student_id === user.id;
  if (user.role === 'academic_mentor') {
    return !!row.course_id && courseBelongsToMentor(user.id, row.course_id);
  }
  return false;
}

module.exports = { canSubmitSimulation, canViewSimulation };
