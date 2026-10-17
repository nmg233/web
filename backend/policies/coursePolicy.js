// Admin manages all courses; mentors use explicit relations, with legacy relations migrated once in 1030.
const { courseBelongsToMentor } = require('../helpers/courseScope');

function canManageCourse(user, course, connection) {
  return !!user && !!course && (user.role === 'admin' ||
    (user.role === 'academic_mentor' &&
      courseBelongsToMentor(user.id, course.id, connection)));
}
module.exports = { canManageCourse };
