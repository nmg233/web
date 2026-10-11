const db = require('../config/database');
const { randomUUID } = require('node:crypto');
const gate = require('../helpers/learningGate');
const notifications = require('./notificationService');
const VERSION = 'lesson-badge-v1';
const catalog = [
 { id:'notebook', name:'探索笔记本（演示）', type:'physical' },
 { id:'model', name:'飞行模型（演示）', type:'physical' },
 { id:'sticker', name:'探索贴纸（演示）', type:'physical' },
 { id:'digital-theory', name:'探索笔记徽章（演示）', type:'badge', art:'theory' },
 { id:'digital-glider', name:'试飞纪念徽章（演示）', type:'badge', art:'glider' },
];
function invalid(message,status=400){throw Object.assign(new Error(message),{status});}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))invalid('包含无效字段');}
function eligibility(studentId,lessonId){
 const state=require('../helpers/rewardEligibility').taskEligibility(studentId,lessonId);
 const definition=db.prepare('SELECT * FROM lesson_badge_definitions WHERE lesson_id=?').get(lessonId);
 const checks=[{key:'definition',satisfied:Boolean(definition),reason:'本课时尚未配置通关徽章'},...state.checks];
 return {...state,definition,version:VERSION,eligible:checks.every(c=>c.satisfied),checks};
}
function visibleLessons(studentId){return db.prepare(`SELECT l.id FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id AND e.student_id=? AND e.status='active' JOIN lesson_badge_definitions b ON b.lesson_id=l.id WHERE c.status='published' AND l.status!='cancelled' ORDER BY c.id,l.sort_order,l.id`).all(studentId);}
function reconcile(studentId){return db.transaction(()=>{
 const created=[];for(const {id}of visibleLessons(studentId)){
  const state=eligibility(studentId,id);if(!state.eligible)continue;
  const context=db.prepare('SELECT l.title lesson_title,c.title course_title FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?').get(id);
  const grantId=randomUUID();const snapshot={version:VERSION,checks:state.checks,reportId:gate.latestReport(studentId,id)?.id,works:db.prepare('SELECT w.id,w.version,w.review_status FROM works w JOIN tasks t ON t.id=w.task_id WHERE w.student_id=? AND t.lesson_id=? AND t.status=\'active\' ORDER BY w.id').all(studentId,id)};
  const r=db.prepare('INSERT OR IGNORE INTO student_badge_grants(id,student_id,lesson_id,course_id,name,art_id,description,lesson_title,course_title,criterion_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)').run(grantId,studentId,id,state.courseId,state.definition.name,state.definition.art_id,state.definition.description,context.lesson_title,context.course_title,JSON.stringify(snapshot));
  if(r.changes)created.push(grantId);
 }return {created};
}) ();}
function profile(studentId){
 const grants=db.prepare('SELECT id,lesson_id,course_id,name,art_id,description,lesson_title,course_title,earned_at,shown_at FROM student_badge_grants WHERE student_id=? ORDER BY earned_at,id').all(studentId).map(g=>({...g,source:'lesson',accessible:Boolean(db.prepare(`SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE l.id=? AND c.status='published' AND l.status!='cancelled' AND e.student_id=? AND e.status='active'`).get(g.lesson_id,studentId))}));
 return {grants,locked:visibleLessons(studentId).map(l=>eligibility(studentId,l.id)),exchanges:exchanges(studentId)};
}
function present(studentId,body){fields(body,['grantId']);if(typeof body.grantId!=='string')invalid('缺少已读取的徽章编号');return db.transaction(()=>{
 const grant=db.prepare('SELECT id,name,art_id FROM student_badge_grants WHERE id=? AND student_id=? AND shown_at IS NULL').get(body.grantId,studentId);if(!grant)return {grant:null};
 db.prepare('UPDATE student_badge_grants SET shown_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=? AND shown_at IS NULL').run(grant.id,studentId);return {grant};
}) ();}
function exchanges(studentId){return db.prepare('SELECT id,operation_id,gift_id,gift_name,gift_type,art_id,created_at FROM demo_exchange_events WHERE student_id=? ORDER BY created_at DESC,id').all(studentId);}
function exchange(studentId,body){
 fields(body,['operationId','giftId']);if(typeof body.operationId!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(body.operationId))invalid('兑换编号无效');const gift=catalog.find(g=>g.id===body.giftId);if(!gift)invalid('演示礼品不存在');
 return db.transaction(()=>{
  const old=db.prepare('SELECT * FROM demo_exchange_events WHERE student_id=? AND operation_id=?').get(studentId,body.operationId);
  if(old){if(old.gift_id!==gift.id)invalid('同一兑换编号不能更换礼品',409);return {saved:true,event:old,demo:true};}
  const user=db.prepare('SELECT real_name,username FROM users WHERE id=?').get(studentId),id=randomUUID();
  db.prepare('INSERT INTO demo_exchange_events(id,student_id,operation_id,gift_id,gift_name,gift_type,art_id) VALUES(?,?,?,?,?,?,?)').run(id,studentId,body.operationId,gift.id,gift.name,gift.type,gift.art||null);
  const note=notifications.createForUsers({eventKey:'demo_exchange',dedupeKey:`demo-exchange:${studentId}:${body.operationId}`,title:'演示兑换记录',category:'system',content:`本地演示，不代表真实扣款或发货。学生：${user.real_name}（${user.username}，账号 ${studentId}）；礼品：${gift.name}；类型：${gift.type==='badge'?'数字徽章':'实物'}；操作编号：${body.operationId}`,createdBy:studentId},notifications.userIdsByRoles(['admin']));
  if(!note)invalid('暂无可接收通知的管理员，演示事件未保存',503);
  db.prepare('UPDATE demo_exchange_events SET notification_id=? WHERE id=?').run(note.id,id);
  return {saved:true,demo:true,event:db.prepare('SELECT * FROM demo_exchange_events WHERE id=?').get(id)};
 }) ();
}
module.exports={eligibility,reconcile,profile,present,exchanges,exchange,catalog,fields,invalid};
