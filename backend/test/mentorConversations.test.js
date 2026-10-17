const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mentor-conversations-'));
Object.assign(process.env,{DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'),NODE_ENV:'test',JWT_SECRET:'isolated-conversations-secret'});
const app=require('../app'),db=require('../config/database'),service=require('../services/feedbackService'),routing=require('../services/feedbackRouting'),notifications=require('../services/notificationService');let server,base;const users={},tokens={},key=()=>crypto.randomUUID();
async function call(id,url,body,method=body?'POST':'GET'){const r=await fetch(base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[id],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const text=await r.text();return{status:r.status,data:JSON.parse(text)};}
const row=id=>db.prepare('SELECT * FROM feedbacks WHERE id=?').get(id);
const workflow=(actor,id,action,reason='内部交接说明',extra={})=>call(actor,`/feedback/${id}/workflow`,{action,reason,expectedRevision:row(id).revision,request_key:key(),...extra});
const feedback=async(extra={})=>{const r=await call(4,'/feedback',{type:'bug',module:'courses',title:'课程学习中的测试反馈',description:'这是独立隔离测试反馈，不是真实学生记录。',reception:'course',course_id:11,request_key:key(),...extra});assert.equal(r.status,201,JSON.stringify(r));return r.data.data.feedback.id;};
before(async()=>{
 for(const[id,role]of[[1,'admin'],[2,'academic_mentor'],[3,'academic_mentor'],[4,'student'],[5,'teacher'],[6,'academic_mentor'],[7,'student']]){db.prepare("INSERT INTO users(id,username,real_name,role,password_hash) VALUES(?,?,?,?, 'fixture')").run(id,'conversation_'+id,'合成会话账号'+id,role);users[id]=db.prepare('SELECT * FROM users WHERE id=?').get(id);tokens[id]=jwt.sign({id,role,auth_version:0},process.env.JWT_SECRET);}
 db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(11,'合成课程','junior','basic','published',2)").run();for(const id of[2,3])db.prepare("INSERT OR IGNORE INTO course_managers(course_id,mentor_id,granted_by,source) VALUES(11,?,1,'admin')").run(id);
 db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(4,11,'active')").run();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('显式课程路由、来源不推断；共同导师可看，教师他课他人不能看',async()=>{
 const id=await feedback();assert.equal(row(id).reception_level,'mentor');assert.equal(row(id).assignee_id,null);
 for(const actor of[1,2,3,4])assert.equal((await call(actor,'/feedback/'+id)).status,200);
 for(const actor of[5,6,7])assert.equal((await call(actor,'/feedback/'+id)).status,403);
 const platform=await feedback({reception:'platform',source_path:'/student/course/11',course_id:undefined});assert.equal(row(platform).course_id,null);assert.equal(row(platform).reception_level,'admin');assert.equal((await call(2,'/feedback/'+platform)).status,403);
 assert.equal((await call(4,'/feedback',{type:'bug',title:'不允许指定受理人',description:'不能绕过真实权限范围指定导师。',mentorId:2})).status,400);
 assert.equal((await call(5,'/feedback/manage/list')).status,403);
});
test('并发领取只有一人成功，重复请求不重复记录；回复与状态修订隔离',async()=>{
 const id=await feedback(),body={action:'claim',expectedRevision:1,request_key:key()};
 const results=await Promise.all([call(2,`/feedback/${id}/workflow`,body),call(3,`/feedback/${id}/workflow`,{...body,request_key:key()})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call(2,`/feedback/${id}/workflow`,body)).status,200);assert.equal(row(id).revision,2);
 assert.equal((await call(3,`/feedback/${id}/messages`,{content:'未领取不能回复',expectedRevision:2,request_key:key()})).status,409);
 const reply={content:'请说明发生问题的具体步骤。',expectedRevision:2,request_key:key()};assert.equal((await call(2,`/feedback/${id}/messages`,reply)).status,201);assert.equal((await call(2,`/feedback/${id}/messages`,reply)).status,201);
 assert.equal(db.prepare('SELECT count(*) n FROM feedback_messages WHERE feedback_id=? AND content=?').get(id,reply.content).n,1);
 assert.equal((await call(2,`/feedback/${id}/status`,{status:'waiting_user',expectedRevision:3,request_key:key()},'PATCH')).status,200);
 assert.equal((await call(4,`/feedback/${id}/messages`,{content:'补充复现步骤',expectedRevision:4,request_key:key()})).status,201);assert.equal(row(id).status,'processing');
});
test('转交必须原因，受理层级不等于解决；内部备注及其附件对学生隔离',async()=>{
 const id=await feedback();await workflow(2,id,'claim');assert.equal((await workflow(2,id,'escalate','')).status,400);
 const form=new FormData();for(const[k,v]of Object.entries({action:'escalate',reason:'仅工作人员可见的转交原因',expectedRevision:row(id).revision,request_key:key()}))form.set(k,String(v));form.append('attachments',new Blob(['%PDF-1.4 isolated internal attachment'],{type:'application/pdf'}),'internal.pdf');
 assert.equal((await call(2,`/feedback/${id}/workflow`,form)).status,200);assert.equal(row(id).reception_level,'admin');assert.notEqual(row(id).status,'resolved');
 const student=(await call(4,'/feedback/'+id)).data.data;assert.ok(!JSON.stringify(student).includes('仅工作人员可见'));assert.equal(student.attachments.length,0);
 const attachment=db.prepare('SELECT id FROM feedback_attachments WHERE feedback_id=?').get(id).id;assert.equal((await call(4,'/feedback/attachments/'+attachment)).status,404);
 assert.equal((await call(2,`/feedback/${id}/messages`,{content:'越过管理员回复',expectedRevision:row(id).revision,request_key:key()})).status,409);
 assert.equal((await workflow(1,id,'request_mentor')).status,200);assert.equal(row(id).mentor_followup_pending,1);
 assert.equal((await call(2,`/feedback/${id}/internal-notes`,{content:'导师补充内部分析',expectedRevision:row(id).revision,request_key:key()})).status,201);assert.equal(row(id).mentor_followup_pending,0);
 assert.equal((await workflow(1,id,'return','转回继续跟进',{mentorId:3})).status,200);assert.equal(row(id).assignee_id,3);
 assert.equal((await workflow(1,id,'takeover')).status,200);assert.equal(row(id).assignee_id,1);
});
test('导师处理结果、学生确认与重新打开保留原反馈，停用导师不能继续阅读',async()=>{
 const id=await feedback();await workflow(2,id,'claim');
 assert.equal((await call(2,`/feedback/${id}/resolve`,{resolution:'已经给出可复现的处理办法',expectedRevision:row(id).revision,request_key:key()})).status,200);
 const body={expectedRevision:row(id).revision,request_key:key()};assert.equal((await call(4,`/feedback/${id}/confirm`,body)).status,200);assert.equal((await call(4,`/feedback/${id}/confirm`,body)).status,200);assert.equal(row(id).status,'closed');
 assert.equal((await call(4,`/feedback/${id}/reopen`,{reason:'按照步骤仍能复现，请继续处理',expectedRevision:row(id).revision,request_key:key()})).status,200);assert.equal(row(id).status,'processing');
 db.prepare('UPDATE users SET is_active=0 WHERE id=2').run();assert.equal((await call(2,'/feedback/'+id)).status,401);db.prepare('UPDATE users SET is_active=1 WHERE id=2').run();
});
test('撤权、课程撤回、报名移除后即时拒绝旧导师，旧通知不可读取，学生仍保留自己反馈',async()=>{
 const id=await feedback();const note=db.prepare("SELECT n.id FROM notifications n JOIN user_notifications un ON un.notification_id=n.id WHERE n.business_type='feedback' AND n.business_id=? AND un.user_id=2").get(id);assert.ok(note);
 db.prepare('UPDATE course_managers SET active=0 WHERE course_id=11 AND mentor_id=2').run();assert.equal((await call(2,'/feedback/'+id)).status,403);assert.throws(()=>notifications.detail(users[2],note.id),e=>e.status===404);assert.ok(!notifications.listForUser(users[2],{}).items.some(n=>n.id===note.id));
 db.prepare('UPDATE course_managers SET active=1 WHERE course_id=11 AND mentor_id=2').run();db.prepare("UPDATE courses SET status='draft' WHERE id=11").run();
 assert.equal((await call(3,'/feedback/'+id)).status,403);assert.equal(row(id).reception_level,'admin');assert.equal((await call(4,'/feedback/'+id)).status,200);
 db.prepare("UPDATE courses SET status='published' WHERE id=11").run();const second=await feedback();db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4 AND course_id=11").run();assert.equal((await call(2,'/feedback/'+second)).status,403);assert.equal(row(second).reception_level,'admin');db.prepare("UPDATE enrollments SET status='active' WHERE student_id=4 AND course_id=11").run();
});
test('投递失败保留队列，补投核对当前受理人；队列落盘失败回滚业务',async()=>{
 db.exec("CREATE TRIGGER fail_notify BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'isolated delivery failure'); END;");const id=await feedback();const pending=db.prepare("SELECT * FROM notification_outbox WHERE event_key=?").get('record.submitted:'+id);assert.ok(pending&&!pending.delivered_at);
 db.prepare('UPDATE course_managers SET active=0 WHERE course_id=11 AND mentor_id IN(2,3)').run();db.exec('DROP TRIGGER fail_notify');notifications.replayOutbox(users[1],pending.event_key);
 const receipts=db.prepare('SELECT un.user_id FROM user_notifications un JOIN notifications n ON n.id=un.notification_id WHERE n.dedupe_key=?').all(pending.event_key);assert.deepEqual(receipts.map(r=>r.user_id),[1]);notifications.replayOutbox(users[1],pending.event_key);assert.equal(db.prepare('SELECT count(*) n FROM user_notifications un JOIN notifications n ON n.id=un.notification_id WHERE n.dedupe_key=?').get(pending.event_key).n,1);
 db.prepare('UPDATE course_managers SET active=1 WHERE course_id=11 AND mentor_id IN(2,3)').run();const count=db.prepare('SELECT count(*) n FROM feedbacks').get().n;db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'isolated queue failure'); END;");
 assert.throws(()=>service.create(users[4],{type:'bug',title:'通知必须一起持久保存',description:'模拟队列不能写入时，业务事务整体回滚。',request_key:key()}));assert.equal(db.prepare('SELECT count(*) n FROM feedbacks').get().n,count);db.exec('DROP TRIGGER fail_queue');
});
test('申请原文、补充回复、附件和审核分离；并发旧修订拒绝，非本人及教师禁止',async()=>{
 const body={name:'合成申请学校',region:'隔离地区',explanation:'原始申请说明不应被回复覆盖',request_key:key()};const created=await call(2,'/mentor-requests/school',body);assert.equal(created.status,200,JSON.stringify(created));const id=created.data.id;
 for(const actor of[3,5,4])assert.ok([403,404].includes((await call(actor,`/mentor-requests/school/${id}`)).status));
 const reply={content:'请补充学校联系人',expectedRevision:1,request_key:key()};assert.equal((await call(1,`/mentor-requests/school/${id}/messages`,reply)).status,200);assert.equal((await call(1,`/mentor-requests/school/${id}/messages`,reply)).status,200);
 assert.equal((await call(2,`/mentor-requests/school/${id}/messages`,{content:'旧修订补充',expectedRevision:1,request_key:key()})).status,409);
 const data=(await call(2,`/mentor-requests/school/${id}`)).data;assert.equal(data.application.status,'pending');assert.equal(data.application.explanation,body.explanation);assert.equal(data.thread.needs_reply,'applicant');assert.equal(data.messages.length,1);assert.equal(db.prepare('SELECT count(*) n FROM school_managers WHERE mentor_id=2').get().n,0);
 const form=new FormData();form.set('content','联系人补充资料');form.set('expectedRevision','2');form.set('request_key',key());form.append('attachments',new Blob(['%PDF-1.4 isolated application'],{type:'application/pdf'}),'application.pdf');assert.equal((await call(2,`/mentor-requests/school/${id}/messages`,form)).status,200);
 const file=db.prepare('SELECT id FROM application_attachments').get();assert.ok(file);assert.equal((await call(3,'/mentor-requests/attachments/'+file.id)).status,404);
 assert.equal((await call(1,`/mentor-requests/school/${id}/review`,{decision:'approved',reason:'核对后授权',expectedRevision:3,request_key:key()})).status,200);assert.equal(db.prepare('SELECT count(*) n FROM school_managers WHERE mentor_id=2').get().n,1);
});
test('既有课程申请不暴露目录；批准才授管理权，开发方案批准不运行代码；管理员真实代办',async()=>{
 const c=await call(6,'/mentor-requests/course',{courseId:11,explanation:'申请参与共管已有课程',request_key:key()});assert.equal(c.status,200,JSON.stringify(c));assert.equal(db.prepare('SELECT count(*) n FROM course_managers WHERE mentor_id=6').get().n,0);
 const review={decision:'approved',reason:'明确邀请课程共管',expectedRevision:1,request_key:key()};assert.equal((await call(1,`/mentor-requests/course/${c.data.id}/review`,review)).status,200);assert.equal((await call(1,`/mentor-requests/course/${c.data.id}/review`,review)).status,200);assert.equal(db.prepare('SELECT active FROM course_managers WHERE mentor_id=6').get().active,1);
 const dev=await call(1,'/mentor-requests/development',{applicantId:6,courseId:11,explanation:'仅准备数据与开发方案',request_key:key()});assert.equal(dev.status,200);assert.equal(db.prepare('SELECT created_by FROM development_applications WHERE id=?').get(dev.data.id).created_by,1);
 assert.equal((await call(1,`/mentor-requests/development/${dev.data.id}/review`,{decision:'approved',reason:'方案可以继续准备，尚不允许运行代码',expectedRevision:1,request_key:key()})).status,200);
 assert.equal((await call(6,'/mentor-requests')).data.items.some(i=>i.kind==='development'),true);
 const dashboard=(await call(1,'/mentor-workspace/dashboard?category=applications&pageSize=1')).data;assert.equal(dashboard.total,dashboard.counts.applications);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
});
