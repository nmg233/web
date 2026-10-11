const db = require('../config/database');
const gate = require('./learningGate');
const invalid=(message,status)=>{throw Object.assign(new Error(message),{status});};
function taskEligibility(studentId,lessonId){
 if(!db.prepare(`SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE l.id=? AND e.student_id=? AND e.status='active' AND c.status='published' AND l.status!='cancelled'`).get(lessonId,studentId))invalid('课时不存在或尚未报名',404);
 const lesson=db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId);
 const checks=[];const add=(key,satisfied,reason)=>checks.push({key,satisfied:Boolean(satisfied),reason});
 add('content',lesson.content_state==='ready','教学内容尚未准备完成');
 if(lesson.presentation_type==='visit')add('visit_records',false,'参观尚无个人完成记录，暂不能判断通关');
 else{
  const state=gate.getLessonLearningState(studentId,lessonId);
  add('configured',state.cards_total>0,'尚未配置已发布的学习卡片，不能按空任务通关');
  add('review',state.review_completed,'请先完成课堂回顾');
  add('cards',state.cards_done,'请完成本课时已发布的知识卡片');
  // Original completion semantics: required exercises need an attempt, not a new score threshold.
  const required=db.prepare(`SELECT e.id,EXISTS(SELECT 1 FROM card_exercise_attempts a WHERE a.exercise_id=e.id AND a.student_id=?) attempted FROM card_exercises e JOIN knowledge_cards c ON c.id=e.card_id WHERE c.lesson_id=? AND c.status='published' AND e.is_required=1`).all(studentId,lessonId);
  add('exercises',required.every(e=>e.attempted),'请完成知识卡片中的必做练习');
  const report=gate.latestReport(studentId,lessonId);
  add('report',report?.status==='approved',report?.status==='rejected'?'最新报告需要修改':report?.status==='submitted'?'最新报告仍待评审':'请提交学习报告并等待通过');
  const tasks=db.prepare("SELECT id,title,require_upload FROM tasks WHERE lesson_id=? AND status='active' ORDER BY sort_order,id").all(lessonId);
  for(const task of tasks){
   const works=db.prepare('SELECT id,parent_work_id,version,review_status FROM works WHERE task_id=? AND student_id=? ORDER BY version DESC,created_at DESC,id DESC').all(task.id,studentId);
   const latest=new Map();for(const work of works){const root=work.parent_work_id||work.id;if(!latest.has(root))latest.set(root,work);}
   add('task:'+task.id,latest.size>0&&[...latest.values()].every(w=>w.review_status==='approved'),`作品任务《${task.title}》${[...latest.values()].some(w=>w.review_status==='rejected')?'需要修改':works.length?'最新版本仍待评审':'尚未完成'}`);
  }
 }
 return {lessonId:Number(lessonId),courseId:lesson.course_id,eligible:checks.every(c=>c.satisfied),checks};
}
module.exports={taskEligibility};
