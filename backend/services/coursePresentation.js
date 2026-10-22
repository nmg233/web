const db = require('../config/database');
function courseDisplay(courseId, student = false, studentId = null) {
  const chapters=db.prepare('SELECT id,course_id,title,sort_order FROM course_chapters WHERE course_id=? ORDER BY sort_order,id').all(courseId);
  let experiments=db.prepare(`SELECT e.* FROM course_experiments e
    LEFT JOIN lessons l ON l.id=e.lesson_id LEFT JOIN knowledge_cards k ON k.id=e.card_id
    WHERE e.course_id=? ${student?"AND e.enabled=1 AND (e.lesson_id IS NULL OR (l.course_id=e.course_id AND l.status!='cancelled' AND l.publication_state IN ('legacy','published'))) AND (e.card_id IS NULL OR (k.lesson_id=e.lesson_id AND k.status='published'))":''}
    ORDER BY e.id`).all(courseId).map(e=>({id:e.id,courseId:e.course_id,experiment:e.experiment_id,lessonId:e.lesson_id,stage:e.stage,cardId:e.card_id,label:e.label,enabled:Boolean(e.enabled)}));
  if(student&&studentId){
    const publication=require('../helpers/lessonPublication');
    const frozen=[];
    for(const lesson of db.prepare("SELECT id FROM lessons WHERE course_id=? AND status!='cancelled' AND publication_state IN ('legacy','published')").all(courseId)){
      const content=publication.studentContent(db,studentId,lesson.id);
      // Older compatibility versions predate experiment snapshots; preserve their existing links.
      const links=content.experiments??db.prepare('SELECT * FROM course_experiments WHERE lesson_id=?').all(lesson.id);
      for(const e of links.filter(e=>e.enabled&&(!e.card_id||content.cards.some(k=>k.id===e.card_id))))frozen.push({id:e.id,courseId:e.course_id,experiment:e.experiment_id,lessonId:e.lesson_id,stage:e.stage,cardId:e.card_id,label:e.label,enabled:true});
    }
    experiments=[...experiments.filter(e=>!e.lessonId),...frozen].sort((a,b)=>a.id-b.id);
  }
  const planNodes=db.prepare(`SELECT n.id,n.position,n.lesson_id,n.state FROM course_plan_nodes n LEFT JOIN lessons l ON l.id=n.lesson_id WHERE n.course_id=? AND (n.lesson_id IS NULL OR l.course_id=n.course_id) ${student?"AND (l.id IS NULL OR l.publication_state!='draft')":''} ORDER BY n.position,n.id`).all(courseId);
  return {labSettings:(!student||experiments.length)?require('./courseLabSettings').read(courseId):null,presentationOptions:require('./courseCustomization').config(courseId),chapters,experiments,planNodes,themeImages:require('./courseThemeImages').selected(db,courseId)};
}
module.exports={courseDisplay};
