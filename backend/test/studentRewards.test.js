const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-next-rewards-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(scratch,'test.db'),UPLOAD_PATH:path.join(scratch,'uploads'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),LOGIN_RATE_LIMIT_IP:'1000',LOGIN_RATE_LIMIT_USER:'1000'});
const app=require('../app'),db=require('../config/database');let server,url;const tokens={};
async function req(id,p,method='GET',body){const r=await fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+tokens[id],'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const eligible=async()=>{const r=await req(4,'/rewards/lessons/12');assert.equal(r.status,200);return r.data;};
const count=()=>db.prepare('SELECT count(*) n FROM student_badge_grants').get().n;
function complete(){
 db.prepare('INSERT OR IGNORE INTO lesson_review_completions(student_id,lesson_id) VALUES(4,12)').run();
 db.prepare('INSERT OR IGNORE INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,21,CURRENT_TIMESTAMP)').run();
 db.prepare("INSERT INTO card_exercise_attempts(student_id,exercise_id,answer_json,is_correct,score,attempt_no) SELECT 4,31,'\"合成\"',0,0,1 WHERE NOT EXISTS(SELECT 1 FROM card_exercise_attempts WHERE student_id=4 AND exercise_id=31)").run();
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,summary,status,version) SELECT 4,12,'合成报告','approved',1 WHERE NOT EXISTS(SELECT 1 FROM lesson_learning_reports WHERE student_id=4 AND lesson_id=12)").run();
}
before(async()=>{
 const hash=require('bcryptjs').hashSync('test123',4);for(const[id,role]of [[1,'admin'],[2,'academic_mentor'],[3,'teacher'],[4,'student'],[5,'student'],[6,'media']])db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'reward'+id,hash,'合成验收',role);
 for(const id of[1,2])db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(?,'合成教学','junior','basic','published',2)").run(id);
 db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(4,1,'active'),(5,1,'active')").run();
 db.prepare("INSERT INTO lessons(id,course_id,title,presentation_type,content_state) VALUES(11,1,'参观','visit','ready'),(12,1,'理论','theory','ready'),(13,1,'实验','experiment','preparing'),(14,2,'他课','theory','ready')").run();
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(21,12,'合成卡片','测试非正式教材','published',2)").run();
 db.prepare("INSERT INTO card_exercises(id,card_id,question_type,prompt,answer_json,is_required) VALUES(31,21,'short_answer','测试问题','\"无泄露答案\"',1)").run();
 server=app.listen(0);await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;
 for(const id of[1,2,3,4,5,6])tokens[id]=(await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'reward'+id,password:'test123'})}).then(r=>r.json())).token;
 for(const id of[11,12,13])assert.equal((await req(2,`/courses/1/maintenance/badges/${id}`,'PUT',{name:'测试徽章'+id,artId:id===11?'vr':id===12?'theory':'glider',description:'合成验收'})).status,200);
});
after(async()=>{await new Promise(r=>server.close(r));db.close();});
test('服务器北京日期只读，无客户日期、他人账号或 coin ledger',async()=>{const d=await req(4,'/rewards/day');assert.equal(d.status,200);assert.equal(d.data.date,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));assert.ok(d.data.validForMs>0&&d.data.validForMs<=86400000);assert.equal((await req(4,'/rewards/day?date=2026-01-01')).status,400);assert.equal((await req(3,'/rewards/day')).status,403);});
test('无配置、空模板、参观缺记录、他课和其他学生不能凭空获得',async()=>{assert.equal((await req(4,'/rewards/lessons/11')).data.eligible,false);assert.equal((await req(4,'/rewards/lessons/13')).data.eligible,false);assert.equal((await req(4,'/rewards/lessons/14')).status,404);assert.equal((await req(5,'/rewards/lessons/12')).data.eligible,false);assert.deepEqual((await req(4,'/rewards/badges/reconcile','POST',{})).data.created,[]);assert.equal(count(),0);assert.equal((await req(4,'/rewards/badges/reconcile','POST',{studentId:5,completed:true})).status,400);});
test('回顾、知识卡片、原必做练习和最新报告分别约束资格；不要求练习正确率',async()=>{assert.equal((await eligible()).eligible,false);complete();assert.equal((await eligible()).eligible,true);
 for(const [table,where,restore]of [['lesson_review_completions','student_id=4 AND lesson_id=12',complete],['student_card_progress','student_id=4 AND card_id=21',complete],['card_exercise_attempts','student_id=4 AND exercise_id=31',complete]]){db.prepare(`DELETE FROM ${table} WHERE ${where}`).run();assert.equal((await eligible()).eligible,false,table);restore();}
 for(const status of['draft','submitted','rejected']){db.prepare('UPDATE lesson_learning_reports SET status=? WHERE lesson_id=12').run(status);assert.equal((await eligible()).eligible,false,status);}db.prepare("UPDATE lesson_learning_reports SET status='approved' WHERE lesson_id=12").run();assert.equal((await eligible()).eligible,true);
 const dto=JSON.stringify(await eligible());for(const secret of['无泄露答案','合成报告','answer_json','summary','score'])assert.ok(!dto.includes(secret));
});
test('所有活跃文字/附件任务都检查，旧 approved 不能掩盖新 pending/rejected 版本',async()=>{
 db.prepare("INSERT INTO tasks(id,lesson_id,title,require_upload,status) VALUES(41,12,'文字',0,'active'),(42,12,'附件',1,'active'),(43,12,'已取消',1,'cancelled')").run();assert.equal((await eligible()).eligible,false);
 for(const id of[41,42])db.prepare("INSERT INTO works(id,student_id,task_id,title,description,review_status) VALUES(?,4,?,'合成作品','合成内容','approved')").run(id,id);assert.equal((await eligible()).eligible,true);
 db.prepare("INSERT INTO works(id,student_id,task_id,title,description,review_status,parent_work_id,version) VALUES(44,4,41,'合成新版','合成内容','pending',41,2)").run();assert.equal((await eligible()).eligible,false);
 db.prepare("UPDATE works SET review_status='rejected' WHERE id=44").run();assert.equal((await eligible()).eligible,false);db.prepare("UPDATE works SET review_status='approved' WHERE id=44").run();assert.equal((await eligible()).eligible,true);
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,summary,status,version) VALUES(4,12,'合成新版','submitted',2)").run();assert.equal((await eligible()).eligible,false);db.prepare("UPDATE lesson_learning_reports SET status='approved' WHERE lesson_id=12 AND version=2").run();assert.equal((await eligible()).eligible,true);
});
test('事务颁发唯一稳定记录、快照、重复/并发请求、展示去重及跨学生隔离',async()=>{
 const r=await Promise.all(Array.from({length:8},()=>req(4,'/rewards/badges/reconcile','POST',{})));assert.equal(r.flatMap(r=>r.data.created).length,1);assert.equal(count(),1);const profile=(await req(4,'/rewards/badges')).data,grant=profile.grants[0];assert.ok(grant.id);assert.equal(grant.source,'lesson');assert.equal((await req(5,'/rewards/badges')).data.grants.length,0);
 const presentations=await Promise.all([req(4,'/rewards/badges/present','POST',{grantId:grant.id}),req(4,'/rewards/badges/present','POST',{grantId:grant.id})]);assert.equal(presentations.filter(p=>p.data.grant).length,1);assert.equal((await req(5,'/rewards/badges/present','POST',{grantId:grant.id})).data.grant,null);assert.ok(JSON.parse(db.prepare('SELECT criterion_snapshot FROM student_badge_grants').get().criterion_snapshot).works.length>=3);
 await req(2,'/courses/1/maintenance/badges/12','PUT',{name:'后来改名',artId:'glider',description:'后来修改'});assert.equal((await req(4,'/rewards/badges')).data.grants[0].name,grant.name);
 db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4").run();assert.equal((await req(4,'/rewards/lessons/12')).status,404);const history=(await req(4,'/rewards/badges')).data;assert.equal(history.locked.length,0);assert.equal(history.grants[0].accessible,false);db.prepare("UPDATE enrollments SET status='active' WHERE student_id=4").run();
 db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();assert.equal((await req(4,'/rewards/badges')).data.grants[0].accessible,false);assert.equal((await req(4,'/rewards/badges/reconcile','POST',{})).data.created.length,0);db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
});
test('维护权限与受控素材，不允许老师/学生/新媒体伪造颁发或外部图像',async()=>{for(const id of[3,4,6])assert.equal((await req(id,'/courses/1/maintenance/badges/12','PUT',{name:'伪造',artId:'theory',description:''})).status,403);assert.equal((await req(2,'/courses/1/maintenance/badges/14','PUT',{name:'跨课',artId:'theory',description:''})).status,404);for(const body of[{name:'测试',artId:'https://example.com/a.png'},{name:'测试',artId:'theory',studentId:5}])assert.equal((await req(2,'/courses/1/maintenance/badges/12','PUT',body)).status,400);});
test('数字/实物演示事件与管理员通知原子幂等，同编号换商品409，不信任身份或文案',async()=>{
 for(const giftId of['notebook','digital-theory']){const operationId='op-'+giftId;const results=await Promise.all(Array.from({length:6},()=>req(4,'/rewards/exchanges','POST',{operationId,giftId})));assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.event.id)).size,1);assert.equal((await req(4,'/rewards/exchanges','POST',{operationId,giftId:'model'})).status,409);}
 assert.equal(db.prepare('SELECT count(*) n FROM demo_exchange_events').get().n,2);assert.equal(db.prepare("SELECT count(*) n FROM notifications WHERE event_key='demo_exchange'").get().n,2);
 const admin=(await req(1,'/notifications')).data;assert.ok(JSON.stringify(admin).includes('本地演示'));for(const id of[3,5,6])assert.ok(!JSON.stringify((await req(id,'/notifications')).data).includes('操作编号：op-'));
 for(const extra of[{studentId:5},{recipientIds:[5]},{content:'伪造正文'},{balance:10000},{cost:0}])assert.equal((await req(4,'/rewards/exchanges','POST',{operationId:'forged',giftId:'notebook',...extra})).status,400);
 assert.equal((await req(3,'/rewards/exchanges')).status,403);assert.equal((await req(5,'/rewards/exchanges')).data.events.length,0);
});
test('通知写入失败事务回滚无孤儿；停用/强制改密沿用原拦截',async()=>{
 db.exec("CREATE TRIGGER fail_demo_notice BEFORE INSERT ON notifications WHEN NEW.event_key='demo_exchange' BEGIN SELECT RAISE(ABORT,'synthetic fault'); END;");assert.equal((await req(4,'/rewards/exchanges','POST',{operationId:'rollback',giftId:'notebook'})).status,500);assert.equal(db.prepare("SELECT count(*) n FROM demo_exchange_events WHERE operation_id='rollback'").get().n,0);db.exec('DROP TRIGGER fail_demo_notice');assert.equal((await req(4,'/rewards/exchanges','POST',{operationId:'rollback',giftId:'notebook'})).status,200);
 db.prepare('UPDATE users SET force_reset_password=1 WHERE id=4').run();assert.equal((await req(4,'/rewards/badges')).data.code,'FORCE_RESET');db.prepare('UPDATE users SET force_reset_password=0,is_active=0 WHERE id=4').run();assert.equal((await req(4,'/rewards/badges')).status,401);assert.equal((await req(4,'/rewards/exchanges','POST',{operationId:'disabled',giftId:'model'})).status,401);db.prepare('UPDATE users SET is_active=1 WHERE id=4').run();
});
