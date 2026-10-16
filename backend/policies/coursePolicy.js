// 管理员管理全部课程；执行导师管理自己创建或受邀授课的课程。
const { courseBelongsToMentor } = require('../helpers/courseScope');

function canManageCourse(user, course, connection) {
  return !!user && !!course && (user.role === 'admin' ||
    (user.role === 'academic_mentor' &&
      (course.created_by === user.id || courseBelongsToMentor(user.id, course.id, connection))));
}
module.exports = { canManageCourse };
