const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'course-rewards-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(scratch,'test.db'),UPLOAD_PATH:path.join(scratch,'uploads'),JWT_SECRET:crypto.randomBytes(32).toString('hex')});
const app=require('../app'),db=require('../config/database'),shop=require('../services/rewardRedemptions'),rewards=require('../services/studentRewards');
let server,url;const tokens={};const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKgAAAABJRU5ErkJggg==','base64');
async function req(actor,p,method='GET',body){const r=await fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+tokens[actor],'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function image(actor,courseId){const f=new FormData();f.append('image',new Blob([png],{type:'image/png'}),'pixel.png');f.append('requestKey',crypto.randomUUID());if(courseId)f.append('courseId',courseId);return reqFile(actor,f);}
async function reqFile(actor,f){const r=await fetch(url+'/api/reward-shop/management/images',{method:'POST',headers:{Authorization:'Bearer '+tokens[actor]},body:f});return {status:r.status,data:await r.json()};}
const gift=(actor,courseId,img,extra={})=>req(actor,'/reward-shop/management/gifts','POST',{name:'隔离课程礼品',description:'不是正式礼品',type:'physical',imageId:img,price:1,stock:10,perStudentLimit:null,published:true,courseId,requestKey:crypto.randomUUID(),...extra});
const redeem=(student,g,key=crypto.randomUUID())=>req(student,'/reward-shop/orders','POST',{giftId:g.id,expectedPrice:g.price,requestKey:key});
let a,b,ga,gb,first;
before(async()=>{for(const [id,role]of [[1,'admin'],[2,'academic_mentor'],[3,'academic_mentor'],[4,'student'],[5,'student'],[6,'teacher']]){db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'course_reward_'+id,'not-login','隔离用户'+id,role);tokens[id]=require('jsonwebtoken').sign({id,role},process.env.JWT_SECRET);}
 db.exec("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(1,'隔离课程甲','junior','basic','published',2),(2,'隔离课程乙','junior','basic','published',3); INSERT INTO enrollments(student_id,course_id,status) VALUES(4,1,'active'),(5,2,'active'); INSERT INTO lessons(id,course_id,title,content_state,presentation_type,review_content) VALUES(12,1,'隔离理论','ready','theory','隔离回顾'); INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(21,12,'隔离卡','隔离正文','published',2);");
 db.exec("INSERT INTO card_exercises(id,card_id,question_type,prompt,answer_json,explanation,is_required) VALUES(31,21,'short_answer','隔离习题','\"隔离答案\"','隔离说明',0)");
 server=app.listen(0);await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;
 a=(await image(2,1)).data.id;b=(await image(3,2)).data.id;assert.ok(a&&b);
 for(const id of [4,5])for(let day=1;day<=3;day++)require('../services/studentCoins').createCoinService(()=>new Date(`2031-01-0${day}T00:00:00Z`)).checkin(id);
});
after(async()=>{await new Promise(r=>server.close(r));db.close();});
test('两个课程管理员与显式导师同权，学生礼品/图片范围隔离且不能注入归属',async()=>{
 ga=(await gift(2,1,a)).data;gb=(await gift(3,2,b)).data;assert.ok(ga.id&&gb.id);assert.equal(ga.course_id,1);
 assert.deepEqual((await req(4,'/reward-shop/gifts')).data.gifts.map(g=>g.id),[ga.id]);assert.deepEqual((await req(5,'/reward-shop/gifts')).data.gifts.map(g=>g.id),[gb.id]);
 for(const [id,p]of [[2,'/reward-shop/management/gifts?courseId=2'],[3,'/reward-shop/management/gifts?courseId=1'],[4,'/reward-shop/gifts?courseId=2']])assert.equal((await req(id,p)).status,404);
 assert.equal((await req(2,'/reward-shop/management/gifts')).status,403);assert.equal((await image(6,1)).status,403);assert.equal((await gift(2,2,a)).status,404);assert.equal((await gift(2,1,b)).status,404);
 const read=async(id,im)=>(await fetch(url+'/api/reward-shop/images/'+im,{headers:{Authorization:'Bearer '+tokens[id]}})).status;
 assert.equal(await read(4,a),200);assert.equal(await read(5,a),404);assert.equal(await read(2,b),404);assert.equal((await redeem(4,gb)).status,404);assert.equal(shop.balance(4),18);
});
test('新建请求丢响应重试不重复礼品；统一余额真实扣款，通知当前课程管理者',async()=>{
 const key=crypto.randomUUID(),extra={requestKey:key};const x=await gift(2,1,a,extra),y=await gift(2,1,a,extra);assert.equal(x.data.id,y.data.id);
 first=(await redeem(4,ga)).data;assert.equal(first.created,true);assert.equal(first.order.course_id,1);assert.equal(shop.balance(4),17);
 const note=db.prepare("SELECT id FROM notifications WHERE dedupe_key=?").get('real-reward:order:'+first.order.id);assert.deepEqual(db.prepare('SELECT user_id FROM user_notifications WHERE notification_id=? ORDER BY user_id').all(note.id).map(r=>r.user_id),[1,2]);
 assert.equal((await req(3,'/reward-shop/management/orders/'+first.order.id)).status,404);
 assert.equal((await req(2,'/reward-shop/management/orders/'+first.order.id+'?courseId=2')).status,404);
});
test('撤回课程/失效报名阻断新兑换但本人历史与图片保留，导师仍能履约且重复只记一次',async()=>{
 db.exec("UPDATE courses SET status='draft' WHERE id=1");assert.equal((await req(4,'/reward-shop/gifts')).data.gifts.length,0);assert.equal((await redeem(4,ga)).status,404);assert.equal((await redeem(4,ga,first.order.request_key)).data.created,false);
 const history=(await req(4,'/reward-shop/orders')).data;assert.equal(history.items[0].course_title,'隔离课程甲');assert.equal((await fetch(url+'/api/reward-shop/images/'+a,{headers:{Authorization:'Bearer '+tokens[4]}})).status,200);
 const ns=require('../services/notificationService'),original=ns.createForUsers;ns.createForUsers=()=>{throw Error('isolated outage');};try{assert.equal((await req(2,'/reward-shop/management/orders/'+first.order.id+'/fulfill','POST',{})).status,200);}finally{ns.createForUsers=original;}
 assert.equal(shop.notificationState(2,1).pending,1);assert.equal((await req(3,'/reward-shop/management/notifications/retry','POST',{courseId:1})).status,404);ns.retryOutbox();shop.flushNotifications(2,1);assert.equal(shop.notificationState(2,1).pending,0);
 await req(2,'/reward-shop/management/orders/'+first.order.id+'/fulfill','POST',{});assert.equal(db.prepare("SELECT COUNT(*) n FROM reward_admin_audit WHERE action='order.fulfill' AND object_id=?").get(first.order.id).n,1);
 db.exec("UPDATE courses SET status='published' WHERE id=1; UPDATE enrollments SET status='removed' WHERE student_id=4");assert.equal((await redeem(4,ga)).status,404);db.exec("UPDATE enrollments SET status='active' WHERE student_id=4");
});
test('导师撤销后旧令牌列表/图片/上传/发放拒绝，不使用创建者授课人回退',async()=>{
 db.exec('UPDATE course_managers SET active=0 WHERE mentor_id=2');for(const p of ['/reward-shop/management/gifts?courseId=1','/reward-shop/management/orders?courseId=1','/courses/1/maintenance/badges'])assert.equal((await req(2,p)).status,404);
 assert.equal((await image(2,1)).status,404);assert.equal((await req(2,'/reward-shop/management/orders/'+first.order.id+'/fulfill','POST',{})).status,404);assert.equal((await fetch(url+'/api/reward-shop/images/'+a,{headers:{Authorization:'Bearer '+tokens[2]}})).status,404);db.exec('UPDATE course_managers SET active=1 WHERE mentor_id=2');
});
test('新课程默认关；空/不完整勋章无提示无授予；完整上传图定义开启后仍须原通关条件',async()=>{
 assert.equal((await req(2,'/courses/1/maintenance/badges')).data.enabled,false);
 let r=await req(2,'/courses/1/maintenance/badges/12','PUT',{name:'草稿',description:'',artId:'theory',imageId:a,enabled:true,revision:0});assert.equal(r.data.complete,false);
 let cfg=(await req(2,'/courses/1/maintenance/badges')).data;assert.equal((await req(2,'/courses/1/maintenance/badges/settings','PUT',{enabled:true,revision:cfg.revision})).status,400);
 assert.equal((await req(2,'/courses/1/maintenance/badges/settings','PUT',{enabled:true,revision:cfg.revision,effectiveScope:'eligible-existing-and-future'})).status,200);assert.equal(rewards.profile(4).locked.length,0);assert.equal(rewards.eligibility(4,12).definition,null);
 r=await req(2,'/courses/1/maintenance/badges/12','PUT',{name:'真实定义（隔离）',description:'满足既有全部条件',artId:'theory',imageId:a,enabled:true,revision:r.data.definition.revision});assert.equal(r.data.complete,true);assert.equal(rewards.profile(4).locked.length,1);assert.equal(rewards.profile(5).locked.length,0);assert.deepEqual(rewards.reconcile(4).created,[]);
 assert.equal((await req(2,'/courses/1/maintenance/badges/12','PUT',{name:'冲突',description:'输入保留',artId:'theory',enabled:true,revision:0})).status,409);
});
test('完整条件补授幂等、上传图快照保存；关闭不删历史或影响金币，重新开启不重授/重播',async()=>{
 require('../services/learningService').lessonPackage(4,12);db.exec("INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,12); INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,21,CURRENT_TIMESTAMP); INSERT INTO lesson_learning_reports(student_id,lesson_id,summary,status,version) VALUES(4,12,'隔离报告','approved',1)");
 db.exec("INSERT INTO card_exercise_attempts(student_id,exercise_id,answer_json,is_correct,score,attempt_no) VALUES(4,31,'\"隔离作答\"',0,0,1)");
 const before=shop.balance(4);const grants=rewards.reconcile(4);assert.equal(grants.created.length,1);assert.equal(rewards.profile(4).grants[0].image_id,a);assert.equal(rewards.present(4,{grantId:grants.created[0]}).grant.course_id,1);
 let cfg=(await req(2,'/courses/1/maintenance/badges')).data;await req(2,'/courses/1/maintenance/badges/settings','PUT',{enabled:false,revision:cfg.revision});assert.equal(rewards.profile(4).locked.length,0);assert.equal(rewards.profile(4).grants.length,1);assert.deepEqual(rewards.reconcile(4).created,[]);assert.equal(shop.balance(4),before);
 cfg=(await req(2,'/courses/1/maintenance/badges')).data;await req(2,'/courses/1/maintenance/badges/settings','PUT',{enabled:true,revision:cfg.revision,effectiveScope:'eligible-existing-and-future'});assert.deepEqual(rewards.reconcile(4).created,[]);assert.equal(rewards.present(4,{grantId:grants.created[0]}).grant,null);
});
test('兑换徽章独立于通关开关，保留课程快照；撤回后未获不泄露，历史不删除',async()=>{
 const cfg=(await req(2,'/courses/1/maintenance/badges')).data;await req(2,'/courses/1/maintenance/badges/settings','PUT',{enabled:false,revision:cfg.revision});const g=(await gift(2,1,a,{type:'badge'})).data;const r=await redeem(4,g);assert.equal(r.status,200);assert.equal(shop.badges(4)[0].course_id,1);assert.equal(shop.badges(4)[0].course_title,'隔离课程甲');assert.equal((await redeem(4,g)).status,409);db.exec("UPDATE courses SET status='draft' WHERE id=1");assert.equal(rewards.profile(4).locked.length,0);assert.equal(rewards.profile(4).grants.length,2);db.exec("UPDATE courses SET status='published' WHERE id=1");
});
test('未知存量不猜课程；管理员逐项带版本绑定、旧订单不重扣、绑定后禁止转移',async()=>{
 const legacyImage=(await image(1)).data.id;const id=Number(db.prepare("INSERT INTO reward_gifts(name,type,description,image_id,price,stock,per_student_limit,published,created_by,updated_by) VALUES('旧礼品','physical','旧说明',?,1,2,1,1,1,1)").run(legacyImage).lastInsertRowid);
 assert.equal((await req(4,'/reward-shop/gifts')).data.gifts.some(g=>g.id===id),false);assert.equal((await redeem(4,{id,price:1})).status,404);assert.equal((await req(1,'/reward-shop/management/gifts')).data.gifts.length,1);
 const before=shop.balance(4),body={courseId:1,revision:1,confirmed:true,reason:'隔离核对真实维护记录'};assert.equal((await req(1,'/reward-shop/management/gifts/'+id+'/bind-course','POST',{...body,courseId:{id:1}})).status,400);assert.equal((await req(2,'/reward-shop/management/gifts/'+id+'/bind-course','POST',body)).status,403);assert.equal((await req(1,'/reward-shop/management/gifts/'+id+'/bind-course','POST',body)).status,200);assert.equal(shop.balance(4),before);assert.equal((await req(1,'/reward-shop/management/gifts/'+id+'/bind-course','POST',{...body,courseId:2})).status,409);assert.equal((await req(4,'/reward-shop/gifts')).data.gifts.some(g=>g.id===id),true);const c=(await req(1,'/courses','POST',{title:'仅奖励图片的草稿（隔离）',grade_level:'junior',difficulty:'basic'})).data.id;assert.ok(c);assert.equal((await image(1,c)).status,200);assert.equal((await req(1,'/courses/'+c,'DELETE')).status,409);assert.ok(db.prepare('SELECT 1 FROM courses WHERE id=?').get(c));assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
