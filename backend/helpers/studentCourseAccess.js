const db = require('../config/database');
function activeCourse(studentId, courseId) {
  return !!db.prepare("SELECT e.id FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=? AND e.course_id=? AND e.status='active' AND c.status='published'").get(studentId, courseId);
}
function activeWork(user, work) {
  if (!work || work.student_id !== user.id) return false;
  if (!work.enrollment_id) return true; // 遗留无课程作品仍允许本人读取；课程空间不接受它。
  return !!db.prepare("SELECT e.id FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=? AND e.student_id=? AND e.status='active' AND c.status='published'").get(work.enrollment_id,user.id);
}
// 由 URL 的课程范围约束对象；不依赖前端隐藏菜单或可篡改的 course_id。
function matchesSpace(req, kind, id) {
  if (!req.courseSpace) return true;
  const queries = {
    lesson: 'SELECT course_id FROM lessons WHERE id=?',
    task: 'SELECT l.course_id FROM tasks t JOIN lessons l ON l.id=t.lesson_id WHERE t.id=?',
    work: 'SELECT e.course_id,w.student_id FROM works w JOIN enrollments e ON e.id=w.enrollment_id WHERE w.id=?',
    enrollment: 'SELECT course_id,student_id FROM enrollments WHERE id=?',
    simulation: 'SELECT course_id,student_id FROM glider_simulations WHERE id=?',
    card: 'SELECT l.course_id FROM knowledge_cards k JOIN lessons l ON l.id=k.lesson_id WHERE k.id=?',
    exercise: 'SELECT l.course_id FROM card_exercises x JOIN knowledge_cards k ON k.id=x.card_id JOIN lessons l ON l.id=k.lesson_id WHERE x.id=?',
    resource: 'SELECT course_id FROM resources WHERE id=?',
    replay: 'SELECT course_id FROM course_replays WHERE id=?',
  };
  const row = db.prepare(queries[kind]).get(id);
  return !!row && String(row.course_id)===String(req.courseSpace) && (row.student_id==null || row.student_id===req.user.id);
}
function bodyMatchesSpace(req) {
  if (!req.courseSpace) return true;
  if (req.body?.course_id != null && String(req.body.course_id)!==String(req.courseSpace)) return false;
  return [['lesson_id','lesson'],['task_id','task'],['enrollment_id','enrollment'],['parent_work_id','work']].every(([field,kind])=>!req.body?.[field] || matchesSpace(req,kind,req.body[field]));
}
module.exports={activeCourse,activeWork,matchesSpace,bodyMatchesSpace};
