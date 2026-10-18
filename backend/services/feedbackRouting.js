const db=require('../config/database'),{fail,active}=require('./courseManagers'),requests=require('../helpers/requestResults');
function mentors(feedback){
 if(!feedback.course_id||!db.prepare("SELECT 1 FROM courses c JOIN enrollments e ON e.course_id=c.id JOIN users u ON u.id=e.student_id WHERE c.id=? AND c.status='published' AND e.student_id=? AND e.status='active' AND u.is_active=1 AND u.archived_at IS NULL").get(feedback.course_id,feedback.user_id))return[];
 return db.prepare("SELECT u.id,u.real_name FROM course_managers m JOIN users u ON u.id=m.mentor_id WHERE m.course_id=? AND m.active=1 AND u.role='academic_mentor' AND u.is_active=1 AND u.archived_at IS NULL AND u.force_reset_password=0").all(feedback.course_id);
}
function refresh(feedback){
 if(!feedback.course_id)return feedback;
 return db.transaction(()=>{
  const current=db.prepare('SELECT * FROM feedbacks WHERE id=?').get(feedback.id);if(!current)return feedback;
  const pool=mentors(current);
  if(current.reception_level==='mentor'&&(!pool.length||current.assignee_id&&!pool.some(m=>m.id===current.assignee_id))){
   const level=pool.length?'mentor':'admin';
   const changed=db.prepare('UPDATE feedbacks SET reception_level=?,assignee_id=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').run(level,current.id,current.revision);
   if(changed.changes){
    db.prepare("INSERT INTO feedback_reception_events(feedback_id,action,from_level,to_level,reason) VALUES(?,'permission_fallback',?,?,?)").run(current.id,current.reception_level,level,'当前负责关系变化，重新核验受理范围');
    const latest={...current,reception_level:level,assignee_id:null,revision:current.revision+1};
    notify(latest,{eventKey:'feedback.reception',dedupeKey:'feedback.fallback:'+current.id+':'+latest.revision,title:'反馈受理范围已更新',content:'原受理关系变化，请按当前权限继续处理。'},'staff');
   }
  }
  return{...feedback,...db.prepare('SELECT * FROM feedbacks WHERE id=?').get(feedback.id)};
 }).immediate();
}
function canRead(user,feedback){return!!user&&(user.role==='admin'||feedback.user_id===user.id||user.role==='academic_mentor'&&mentors(feedback).some(m=>m.id===user.id));}
function isStaff(user,feedback){return user.role==='admin'||user.role==='academic_mentor'&&feedback.user_id!==user.id&&mentors(feedback).some(m=>m.id===user.id);}
function assertHandler(user,feedback,note=false){
 if(!isStaff(user,feedback))fail('无权处理该反馈',403);
 if(user.role!=='admin'&&!note&&(feedback.reception_level!=='mentor'||feedback.assignee_id!==user.id))fail('请先领取本课反馈；转交管理员后仅可补充内部说明',409);
}
function readSql(user,alias='f'){
 const id=Number(user.id);if(!Number.isSafeInteger(id))return '0=1';if(user.role==='admin')return '1=1';
 return `(${alias}.user_id=${id} OR ${user.role==='academic_mentor'?`EXISTS(SELECT 1 FROM course_managers cm JOIN users mu ON mu.id=cm.mentor_id JOIN courses cc ON cc.id=cm.course_id JOIN enrollments ee ON ee.course_id=cc.id JOIN users owner ON owner.id=ee.student_id WHERE cm.course_id=${alias}.course_id AND cm.mentor_id=${id} AND cm.active=1 AND mu.is_active=1 AND mu.archived_at IS NULL AND mu.force_reset_password=0 AND cc.status='published' AND ee.student_id=${alias}.user_id AND ee.status='active' AND owner.is_active=1 AND owner.archived_at IS NULL)`:'0=1'})`;
}
function context(user,data){
 if(data.reception&& !['platform','course'].includes(data.reception))fail('请选择课程反馈或平台问题');
 if(data.reception!=='course')return{course_id:null,school_id:null,reception_level:'admin'};
 if(user.role!=='student')fail('只有学生可提交课程学习反馈；工作人员平台问题交管理员',403);
 const courseId=Number(data.course_id);if(!Number.isSafeInteger(courseId)||courseId<1)fail('请选择真实课程');
 if(!require('../helpers/studentCourseAccess').activeCourse(user.id,courseId))fail('课程不可访问；可选择直接向平台反馈，不能借反馈恢复课程权限',403);
 const row={course_id:courseId,user_id:user.id};return{course_id:courseId,school_id:db.prepare('SELECT school_id FROM users WHERE id=?').get(user.id).school_id,reception_level:mentors(row).length?'mentor':'admin'};
}
function recipients(feedback,mode='staff'){
 if(mode==='owner')return[feedback.user_id];const pool=mentors(feedback);
 if(mode==='mentors')return pool.length?pool.map(m=>m.id):require('./notificationService').userIdsByRoles(['admin']);
 if(feedback.reception_level==='mentor'&&pool.length)return feedback.assignee_id&&pool.some(m=>m.id===feedback.assignee_id)?[feedback.assignee_id]:pool.map(m=>m.id);
 return require('./notificationService').userIdsByRoles(['admin']);
}
function notify(feedback,payload,mode='staff'){
 return require('./notificationService').safeCreateForUsers({...payload,category:'feedback',businessType:'feedback',businessId:feedback.id,actionUrl:'/feedback/'+feedback.id,feedbackContext:{id:feedback.id,mode}},recipients(feedback,mode));
}
function refreshPending(){for(const f of db.prepare("SELECT * FROM feedbacks WHERE reception_level='mentor'").all())refresh(f);}
function guarded(operation,action){return(user,id,value,options={})=>db.transaction(()=>{
 const f=refresh(db.prepare('SELECT * FROM feedbacks WHERE id=?').get(id)||{});if(!f.id)fail('反馈不存在',404);if(!canRead(user,f))throw Object.assign(new Error('反馈不可访问'),{status:403,code:'FEEDBACK_FORBIDDEN'});
 const files=options.files||[],identity=requests.identity(user,'feedback-action:'+id+':'+action,{value,expectedRevision:options.expectedRevision,request_key:options.request_key},files);
 const old=requests.existing(db,identity);if(old){require('../middleware/feedbackUpload').removeFiles(files);return old;}
 if((options.expectedRevision!==undefined||f.course_id&&isStaff(user,f))&&options.expectedRevision!==f.revision)fail('反馈已更新，请重新核对，输入保留',409);
 const result=operation(user,id,value);if(action==='note'&&user.role==='academic_mentor')db.prepare('UPDATE feedbacks SET mentor_followup_pending=0 WHERE id=?').run(id);
 const changed=db.prepare('UPDATE feedbacks SET revision=revision+1 WHERE id=? AND revision=?').run(id,f.revision);if(!changed.changes)fail('反馈已并发更新，请重新核对',409);
 if(files.length){if(!['reply','note'].includes(action))fail('当前动作不接受附件');for(const file of files)db.prepare('INSERT INTO feedback_attachments(feedback_id,message_id,original_name,stored_name,file_path,mime_type,file_size) VALUES(?,?,?,?,?,?,?)').run(id,result.id,require('../helpers/fileName').decodeOriginalName(file.originalname),file.filename,file.path,file.mimetype,file.size);}
 if(action==='note'&&user.role==='academic_mentor'&&f.reception_level==='admin')notify({...f,revision:f.revision+1},{eventKey:'feedback.internal_followup',dedupeKey:'feedback.internal:'+result.id,title:'课程导师已补充内部说明',content:'请进入原反馈查看工作人员补充，学生不可见内部备注。',createdBy:user.id},'staff');
 if(result&&typeof result==='object')result.revision=f.revision+1;requests.save(db,identity,result);return result;
 }).immediate();}
function workflow(user,id,body,files=[]){return db.transaction(()=>{
 active(user,user.role==='admin'?'admin':'academic_mentor');const f=refresh(db.prepare('SELECT * FROM feedbacks WHERE id=?').get(id)||{});if(!f.id)fail('反馈不存在',404);if(!isStaff(user,f))fail('无权处理该反馈',403);
 if(Object.keys(body).some(k=>!['action','reason','mentorId','expectedRevision','request_key'].includes(k)))fail('受理动作字段无效');
 const identity=requests.identity(user,'feedback-workflow:'+id,body,files);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior){require('../middleware/feedbackUpload').removeFiles(files);return prior;}
 if(Number(body.expectedRevision)!==f.revision)fail('反馈受理状态已变化，请核对最新状态',409);
 const action=body.action,reason=typeof body.reason==='string'?body.reason.trim():'';if(action!=='claim'&&(!reason||reason.length>2000))fail('请填写处理或转交说明');
 let level=f.reception_level,assignee=f.assignee_id,publicText;
 if(action==='claim'){
  if(f.reception_level!=='mentor'||f.assignee_id&&f.assignee_id!==user.id)fail('该反馈已被其他人员领取或由管理员受理',409);level=user.role==='admin'?'admin':'mentor';assignee=user.id;publicText=user.role==='admin'?'平台管理员已领取并开始受理':'课程导师已领取并开始受理';
 }else if(action==='escalate'){assertHandler(user,f);level='admin';assignee=null;publicText='已提交平台管理员协助，课程导师仍可补充说明';
 }else if(action==='takeover'){if(user.role!=='admin')fail('仅管理员可接管',403);level='admin';assignee=user.id;publicText='平台管理员已接管处理';
 }else if(action==='return'){if(user.role!=='admin')fail('仅管理员可转回导师',403);const target=Number(body.mentorId);if(!mentors(f).some(m=>m.id===target))fail('目标导师当前无有效课程反馈权限',403);level='mentor';assignee=target;publicText='已转回课程导师继续受理';
 }else if(action==='request_mentor'){if(user.role!=='admin')fail('仅管理员可要求导师补充',403);publicText=null;
 }else fail('不支持的受理动作');
 db.prepare('UPDATE feedbacks SET reception_level=?,assignee_id=?,mentor_followup_pending=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(level,assignee,action==='request_mentor'?1:0,id);
 db.prepare('INSERT INTO feedback_reception_events(feedback_id,actor_id,action,from_level,to_level,reason) VALUES(?,?,?,?,?,?)').run(id,user.id,action,f.reception_level,level,reason||'领取');
 const message=db.prepare("INSERT INTO feedback_messages(feedback_id,sender_id,message_type,content,is_internal) VALUES(?,?,'note',?,1)").run(id,user.id,reason||'领取本课反馈');
 for(const file of files)db.prepare('INSERT INTO feedback_attachments(feedback_id,message_id,original_name,stored_name,file_path,mime_type,file_size) VALUES(?,?,?,?,?,?,?)').run(id,message.lastInsertRowid,require('../helpers/fileName').decodeOriginalName(file.originalname),file.filename,file.path,file.mimetype,file.size);
 if(publicText)db.prepare("INSERT INTO feedback_messages(feedback_id,sender_id,message_type,content,is_internal) VALUES(?,?,'system',?,0)").run(id,user.id,publicText);
 const latest={...f,reception_level:level,assignee_id:assignee,revision:f.revision+1};notify(latest,{eventKey:'feedback.reception',dedupeKey:'feedback.reception:'+id+':'+latest.revision,title:'反馈受理有更新',content:publicText||'管理员请课程导师补充说明。',createdBy:user.id},action==='request_mentor'?'mentors':'staff');
 if(publicText)notify(latest,{eventKey:'feedback.reception',dedupeKey:'feedback.owner-reception:'+id+':'+latest.revision,title:'你的反馈受理有更新',content:publicText,createdBy:user.id},'owner');
 const result={saved:true,revision:latest.revision};requests.save(db,identity,result);return result;
 }).immediate();}
module.exports={mentors,refresh,refreshPending,canRead,isStaff,assertHandler,readSql,context,recipients,notify,guarded,workflow};
