const db=require('../config/database'),{active,fail}=require('./courseManagers'),requests=require('../helpers/requestResults');
const tables={school:'school_applications',course:'course_access_applications',development:'development_applications'};
function table(kind){if(!Object.hasOwn(tables,kind))fail('申请类型无效');return tables[kind];}
function actor(user){return active(user,user.role==='admin'?'admin':'academic_mentor');}
function get(user,kind,id){actor(user);const row=db.prepare('SELECT a.*,u.real_name applicant_name FROM '+table(kind)+' a JOIN users u ON u.id=a.applicant_id WHERE a.id=?').get(id);if(!row||user.role!=='admin'&&row.applicant_id!==user.id)fail('申请不存在或无权访问',404);return row;}
function recipients(kind,id,mode){const row=db.prepare('SELECT applicant_id FROM '+table(kind)+' WHERE id=?').get(id);if(!row)fail('申请不存在',404);return mode==='applicant'?[row.applicant_id]:require('./notificationService').userIdsByRoles(['admin']);}
function notify(user,kind,id,event,content,mode){return require('./notificationService').safeCreateForUsers({eventKey:'application.'+event,dedupeKey:`application:${kind}:${id}:${event}`,title:'申请有新进展',content,category:'account',businessType:'application:'+kind,businessId:id,actionUrl:`/mentor/requests?kind=${kind}&application=${id}`,createdBy:user.id,applicationContext:{kind,id,mode}},recipients(kind,id,mode));}
function detail(user,kind,id){const app=get(user,kind,id),thread=db.prepare('SELECT * FROM application_conversations WHERE kind=? AND application_id=?').get(kind,id);if(!thread)fail('申请会话不存在，请联系管理员核对迁移',409);return{application:{...app,duplicates:kind==='school'&&user.role==='admin'?require('./schoolApplications').list(user).applications.find(a=>a.id===Number(id))?.duplicates||[]:[]},thread,messages:db.prepare('SELECT m.*,u.real_name sender_name,u.role sender_role FROM application_messages m JOIN users u ON u.id=m.sender_id WHERE m.kind=? AND m.application_id=? ORDER BY m.id').all(kind,id),attachments:db.prepare(`SELECT a.id,a.message_id,a.original_name,a.file_size FROM application_attachments a JOIN application_messages m ON m.id=a.message_id WHERE m.kind=? AND m.application_id=? ORDER BY a.id`).all(kind,id)};}
function all(user){actor(user);const rows=[];for(const kind of Object.keys(tables))for(const row of db.prepare('SELECT a.id,a.applicant_id,a.status,a.created_at,a.revision,a.explanation,'+(kind==='school'?'a.name':'NULL')+' object_name,u.real_name applicant_name,t.needs_reply,t.updated_at FROM '+table(kind)+" a JOIN users u ON u.id=a.applicant_id JOIN application_conversations t ON t.kind=? AND t.application_id=a.id "+(user.role==='admin'?'':'WHERE a.applicant_id=?')+' ORDER BY a.id DESC').all(kind,...(user.role==='admin'?[]:[user.id])))rows.push({...row,kind,title:kind==='school'?row.object_name+' · '+row.applicant_name:({course:'既有课程管理申请',development:'自主开发方案申请'})[kind]+' #'+row.id,url:`/mentor/requests?kind=${kind}&application=${row.id}`});return rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id-a.id);}
function list(user,query={}){const rows=all(user).filter(r=>!query.kind||r.kind===query.kind),page=Math.max(1,parseInt(query.page,10)||1),pageSize=Math.min(100,Math.max(1,parseInt(query.pageSize,10)||20));return{items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize};}
function create(user,kind,body){actor(user);table(kind);
 if(kind==='school')return require('./schoolApplications').apply(user,body);
 return db.transaction(()=>{
 if(Object.keys(body).some(k=>!['courseId','explanation','contact','applicantId','request_key'].includes(k)))fail('申请字段无效');
 const applicantId=user.role==='admin'?Number(body.applicantId):user.id;
 if(user.role!=='admin'&&body.applicantId!==undefined)fail('不能代他人申请',403);
 const applicant=db.prepare("SELECT * FROM users WHERE id=? AND role='academic_mentor' AND is_active=1 AND archived_at IS NULL").get(applicantId);if(!applicant)fail('请选择有效导师申请对象');
 if(typeof body.explanation!=='string'||!body.explanation.trim()||body.explanation.length>5000||body.contact!==undefined&&(typeof body.contact!=='string'||body.contact.length>200))fail('请填写申请用途和背景，最多5000字；联系信息最多200字');
 const cid=body.courseId===undefined||body.courseId===''?null:Number(body.courseId);
 if(kind==='course'&&!cid)fail('请填写管理员提供的准确课程标识；此处不提供全平台课程目录');
 if(cid&&(!Number.isSafeInteger(cid)||!db.prepare('SELECT 1 FROM courses WHERE id=?').get(cid)))fail('课程标识无法核对，请联系管理员');
 if(kind==='development'&&cid&&user.role!=='admin'&&!require('../helpers/courseScope').courseBelongsToMentor(user.id,cid))fail('开发方案只能关联自己有权管理的课程',403);
 const identity=requests.identity(user,'application-create:'+kind,body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 if(kind==='course'&&db.prepare("SELECT 1 FROM course_access_applications WHERE applicant_id=? AND course_id=? AND status='pending'").get(applicantId,cid))fail('已有待审核申请，请继续原会话',409);
 const id=Number(db.prepare('INSERT INTO '+table(kind)+'(applicant_id,course_id,explanation,contact,created_by) VALUES(?,?,?,?,?)').run(applicantId,cid,body.explanation.trim(),body.contact?.trim()||null,user.id).lastInsertRowid);
 db.prepare('INSERT INTO application_conversations(kind,application_id) VALUES(?,?)').run(kind,id);
 notify(user,kind,id,'submitted','收到新的申请，请进入同一申请会话核对说明与审核。','admin');const result={id,kind};requests.save(db,identity,result);return result;
 }).immediate();}
function reply(user,kind,id,body,files=[]){return db.transaction(()=>{
 const app=get(user,kind,id),thread=detail(user,kind,id).thread;
 if(Object.keys(body).some(k=>!['content','expectedRevision','request_key'].includes(k)))fail('会话字段无效');
 if(typeof body.content!=='string'||!body.content.trim()||body.content.length>5000)fail('请输入1–5000字补充说明');
 const identity=requests.identity(user,`application-reply:${kind}:${id}`,body,files);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior){require('../middleware/feedbackUpload').removeFiles(files);return prior;}
 if(Number(body.expectedRevision)!==thread.revision)fail('申请会话已有新回复，请核对后重试，输入保留',409);
 const messageId=Number(db.prepare('INSERT INTO application_messages(kind,application_id,sender_id,content) VALUES(?,?,?,?)').run(kind,id,user.id,body.content.trim()).lastInsertRowid);
 for(const file of files)db.prepare('INSERT INTO application_attachments(message_id,original_name,file_path,mime_type,file_size) VALUES(?,?,?,?,?)').run(messageId,require('../helpers/fileName').decodeOriginalName(file.originalname),file.path,file.mimetype,file.size);
 db.prepare('UPDATE '+table(kind)+' SET revision=revision+1 WHERE id=?').run(id);
 const mode=user.role==='admin'?'applicant':'admin';db.prepare('UPDATE application_conversations SET needs_reply=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND application_id=?').run(mode,kind,id);
 notify(user,kind,id,'reply:'+messageId,user.role==='admin'?'管理员回复了申请，请查看并补充说明。':'申请人补充了说明，请查看原申请会话。',mode);
 const result={id:messageId,revision:thread.revision+1,applicationRevision:app.revision+1};requests.save(db,identity,result);return result;
 }).immediate();}
function review(user,kind,id,body){return db.transaction(()=>{
 active(user,'admin');const app=get(user,kind,id);
 if(kind==='school')return require('./schoolApplications').review(user,id,body);
 if(Object.keys(body).some(k=>!['decision','reason','expectedRevision','request_key'].includes(k)))fail('审核字段无效');
 const identity=requests.identity(user,`application-review:${kind}:${id}`,body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 if(app.revision!==body.expectedRevision||app.status!=='pending')fail('申请已处理或修订变化，请重新核对',409);
 if(!['approved','rejected'].includes(body.decision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)fail('请选择决定并填写审核说明');
 if(body.decision==='approved'&&kind==='course'){
  const existing=db.prepare('SELECT revision FROM course_managers WHERE course_id=? AND mentor_id=?').get(app.course_id,app.applicant_id);
  require('./courseManagers').write(user,app.course_id,{mentorId:app.applicant_id,active:true,expectedRevision:existing?.revision||0,reason:body.reason,request_key:'application-course-'+id+'-'+app.revision});
 }
 db.prepare('UPDATE '+table(kind)+' SET status=?,reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=?').run(body.decision,body.reason.trim(),user.id,id);
 db.prepare("UPDATE application_conversations SET needs_reply='none',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND application_id=?").run(kind,id);
 notify(user,kind,id,'review:'+app.revision,kind==='development'?'开发方案审核已更新；不表示已开放交互代码运行，请查看准确资格限制。':'申请审核已更新，请进入原申请查看结果。','applicant');
 const result={saved:true,status:body.decision};requests.save(db,identity,result);return result;
 }).immediate();}
function attachment(user,id){const row=db.prepare('SELECT a.*,m.kind,m.application_id FROM application_attachments a JOIN application_messages m ON m.id=a.message_id WHERE a.id=?').get(id);if(!row)fail('申请附件不存在',404);get(user,row.kind,row.application_id);return row;}
module.exports={table,get,detail,all,list,create,reply,review,attachment,recipients,notify};
