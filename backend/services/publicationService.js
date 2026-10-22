const db=require('../config/database');
const {active,fail}=require('./courseManagers');
const {canManageCourse}=require('../policies/coursePolicy');
const versions=require('../helpers/lessonVersions');
const publication=require('../helpers/lessonPublication');
const {contentRevision:hash}=require('../helpers/contentRevision');
function course(user,id){active(user,user.role==='admin'?'admin':'academic_mentor');const c=db.prepare('SELECT * FROM courses WHERE id=?').get(id);if(!canManageCourse(user,c))fail('课程不存在或管理授权已失效',404);return c;}
function reason(value){if(typeof value!=='string'||!value.trim()||value.length>1000)fail('请填写1–1000字操作说明');return value.trim();}
function fields(body,allowed){if(!body||typeof body!=='object'||Object.keys(body).some(key=>!allowed.includes(key)))fail('发布操作字段无效');}
function notify(id,status,actor){
 const p=db.prepare('SELECT * FROM publication_requests WHERE id=?').get(id);
 const recipients=status==='pending'?db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1 AND archived_at IS NULL").all().map(u=>u.id):[p.applicant_id];
 require('./notificationService').safeCreateForUsers({eventKey:'course.publication',dedupeKey:'publication:'+id+':'+status,title:status==='pending'?'收到发布审批申请':status==='approved'?'发布申请已批准':'发布申请已驳回',content:status==='approved'?'提交版本已正式发布；原有学生学习版本和作答保留。':'请在对应总课题中查看提交内容及审批意见。',category:'course',actionUrl:'/courses/'+p.course_id,createdBy:actor.id},recipients);
}
function snapshot(courseId,lessonId){
 if(!lessonId)return db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
 const content=versions.currentContent(db,lessonId);
 for(const key of ['publication_state','published_version_id','closure_reason'])delete content.lesson[key];
 return content;
}
function read(user,id){course(user,id);return {events:db.prepare('SELECT e.*,u.real_name actor_name,l.title lesson_title FROM lesson_publication_events e JOIN users u ON u.id=e.actor_id JOIN lessons l ON l.id=e.lesson_id WHERE e.course_id=? ORDER BY e.id DESC LIMIT 100').all(id),introHistory:db.prepare('SELECT a.*,u.real_name actor_name FROM course_content_audit a JOIN users u ON u.id=a.actor_id WHERE a.course_id=? ORDER BY a.id DESC LIMIT 100').all(id),requests:db.prepare(`SELECT p.*,u.real_name applicant_name,a.real_name approver_name,l.title lesson_title FROM publication_requests p JOIN users u ON u.id=p.applicant_id LEFT JOIN users a ON a.id=p.decided_by LEFT JOIN lessons l ON l.id=p.lesson_id WHERE p.course_id=? ORDER BY p.id DESC`).all(id).map(({snapshot_json,...r})=>({...r,snapshot:JSON.parse(snapshot_json)}))};}
function submit(user,courseId,body){return db.transaction(()=>{
 fields(body,['lesson_id','reason']);
 const c=course(user,courseId);if(c.status==='archived')fail('已归档课程不能申请发布',409);
 const lessonId=body.lesson_id==null?null:Number(body.lesson_id);
 if(lessonId!==null&&(!Number.isSafeInteger(lessonId)||lessonId<1))fail('课时编号无效');
 if(lessonId){const l=db.prepare('SELECT * FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId);if(!l)fail('课时不属于当前总课题',404);publication.assertEditable(db,lessonId);
 {const r=versions.readiness(db,lessonId);if(!r.ready)fail('教学内容不完整：'+r.issues.join('；'),409);}}
 else if(c.status!=='draft')fail('总课题已正式发布，介绍修改直接保存，无需重复申请',409);
 if(!lessonId&&!String(c.description||'').trim())fail('发布前请填写真实课程简介；故事可写在简介中',409);
 const why=reason(body.reason),content=snapshot(courseId,lessonId),fingerprint=hash(content);
 const pending=db.prepare("SELECT * FROM publication_requests WHERE course_id=? AND lesson_id IS ? AND status='pending'").get(courseId,lessonId);
 if(pending){if(pending.fingerprint===fingerprint)return {id:pending.id,status:'pending',replayed:true};fail('已有待审批申请；请先由管理员处理后重新提交',409);}
 const version=lessonId?versions.saveVersion(db,lessonId):null;
 const r=db.prepare('INSERT INTO publication_requests(course_id,lesson_id,applicant_id,content_version_id,snapshot_json,fingerprint,reason) VALUES(?,?,?,?,?,?,?)').run(courseId,lessonId,user.id,version?.id||null,JSON.stringify(content),fingerprint,why);
 notify(Number(r.lastInsertRowid),'pending',user);
 return {id:Number(r.lastInsertRowid),status:'pending'};
}).immediate();}
function decide(user,courseId,requestId,body){return db.transaction(()=>{
 fields(body,['decision','reason']);
 active(user,'admin');const c=course(user,courseId),p=db.prepare('SELECT * FROM publication_requests WHERE id=? AND course_id=?').get(requestId,courseId);if(!p)fail('发布申请不存在',404);
 if(!['approved','rejected'].includes(body.decision))fail('审批结果无效');
 const why=reason(body.reason);
 if(p.status!=='pending'){if(p.status===body.decision)return {id:p.id,status:p.status,replayed:true};fail('申请已处理，请读取最新状态',409);}
 if(c.status==='archived')fail('课程已归档',409);
 if(body.decision==='approved'){
 const applicant=db.prepare('SELECT * FROM users WHERE id=?').get(p.applicant_id);
 if(!applicant?.is_active||applicant.archived_at||applicant.force_reset_password||!canManageCourse(applicant,c))fail('申请人已失去管理权限，请驳回并由当前管理者重新申请',409);
 if(hash(snapshot(courseId,p.lesson_id))!==p.fingerprint)fail('提交后内容已变化，请驳回旧申请并重新提交，不能批准未审内容',409);
 if(p.lesson_id){const l=publication.assertEditable(db,p.lesson_id);{const r=versions.readiness(db,l.id);if(!r.ready)fail('教材不完整：'+r.issues.join('；'),409);}
 db.prepare("UPDATE lessons SET publication_state='published',published_version_id=?,closure_reason=NULL WHERE id=?").run(p.content_version_id,p.lesson_id);
 db.prepare("INSERT INTO lesson_publication_events(course_id,lesson_id,actor_id,action,content_version_id,reason) VALUES(?,?,?,'publish',?,?)").run(courseId,p.lesson_id,user.id,p.content_version_id,why);
 }else{if(c.status!=='draft')fail('课程状态已变化',409);require('./mentorSchoolScope').assertPublish(user,courseId);db.prepare("UPDATE courses SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(courseId);}
 }
 db.prepare('UPDATE publication_requests SET status=?,decision_reason=?,decided_by=?,decided_at=CURRENT_TIMESTAMP WHERE id=?').run(body.decision,why,user.id,p.id);
 notify(p.id,body.decision,user);
 return {id:p.id,status:body.decision};
}).immediate();}
function close(user,courseId,lessonId,body){return db.transaction(()=>{
 fields(body,['reason']);
 const c=course(user,courseId);if(c.status==='archived')fail('课程已归档',409);
 const l=db.prepare('SELECT * FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId);if(!l)fail('课时不属于当前总课题',404);
 if(l.status==='cancelled'||l.publication_state==='draft')fail('该课时不是可关闭的正式课时',409);
 const why=reason(body.reason);if(l.publication_state==='closed')return {closed:true};
 const version=l.published_version_id||versions.saveVersion(db,l.id,true).id;
 db.prepare("UPDATE lessons SET publication_state='closed',published_version_id=?,closure_reason=? WHERE id=?").run(version,why,l.id);
 db.prepare("INSERT INTO lesson_publication_events(course_id,lesson_id,actor_id,action,content_version_id,reason) VALUES(?,?,?,'close',?,?)").run(courseId,l.id,user.id,version,why);
 return {closed:true,published_version_id:version};
}).immediate();}
module.exports={read,submit,decide,close,snapshot};
