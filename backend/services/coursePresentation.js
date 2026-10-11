const db = require('../config/database');
function courseDisplay(courseId, student = false) {
  const chapters=db.prepare('SELECT id,course_id,title,sort_order FROM course_chapters WHERE course_id=? ORDER BY sort_order,id').all(courseId);
  const experiments=db.prepare(`SELECT e.* FROM course_experiments e
    LEFT JOIN lessons l ON l.id=e.lesson_id LEFT JOIN knowledge_cards k ON k.id=e.card_id
    WHERE e.course_id=? ${student?"AND e.enabled=1 AND (e.lesson_id IS NULL OR (l.course_id=e.course_id AND l.status!='cancelled')) AND (e.card_id IS NULL OR (k.lesson_id=e.lesson_id AND k.status='published'))":''}
    ORDER BY e.id`).all(courseId).map(e=>({id:e.id,courseId:e.course_id,experiment:e.experiment_id,lessonId:e.lesson_id,stage:e.stage,cardId:e.card_id,label:e.label,enabled:Boolean(e.enabled)}));
  const planNodes=db.prepare(`SELECT n.id,n.position,n.lesson_id,n.state FROM course_plan_nodes n LEFT JOIN lessons l ON l.id=n.lesson_id WHERE n.course_id=? AND (n.lesson_id IS NULL OR l.course_id=n.course_id) ORDER BY n.position,n.id`).all(courseId);
  return {chapters,experiments,planNodes};
}
module.exports={courseDisplay};
