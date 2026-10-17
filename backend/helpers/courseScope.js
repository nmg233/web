// One explicit relationship for every entry point. Two placeholders retain existing callers' parameter shape.
function mentorCourseScope(column='c.id') {
 return `EXISTS (SELECT 1 FROM course_managers cm JOIN users manager ON manager.id=cm.mentor_id WHERE cm.course_id=${column} AND cm.mentor_id=? AND manager.id=? AND cm.active=1 AND manager.role='academic_mentor' AND manager.is_active=1 AND manager.archived_at IS NULL)`;
}
function courseBelongsToMentor(mentorId, courseId, connection) {
  if (!mentorId || !courseId) return false;
  const db = connection || require('../config/database');
  return !!db.prepare(`SELECT c.id FROM courses c WHERE c.id=? AND ${mentorCourseScope()}`).get(courseId,mentorId,mentorId);
}

function managerRecipients(db,courseId){return db.prepare(`SELECT id FROM users WHERE is_active=1 AND archived_at IS NULL AND (role='admin' OR role='academic_mentor' AND EXISTS(SELECT 1 FROM course_managers m WHERE m.course_id=? AND m.mentor_id=users.id AND m.active=1))`).all(courseId).map(r=>r.id);}
module.exports = { courseBelongsToMentor,mentorCourseScope,managerRecipients };
