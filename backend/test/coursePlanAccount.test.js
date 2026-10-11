const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-plan-account-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(scratch,'test.db'),UPLOAD_PATH:path.join(scratch,'uploads'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),LOGIN_RATE_LIMIT_IP:'500',LOGIN_RATE_LIMIT_USER:'500'});
const app=require('../app'),db=require('../config/database');let server,url;const tokens={};
async function req(id,p,method='GET',body){const r=await fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+tokens[id],'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
before(async()=>{
 const hash=require('bcryptjs').hashSync('test123',4);
 for(const[id,role]of [[1,'academic_mentor'],[2,'student'],[3,'teacher'],[4,'admin'],[5,'student']])db.prepare('INSERT INTO users(id,username,password_hash,real_name,role,avatar_url) VALUES(?,?,?,?,?,?)').run(id,'plan'+id,hash,'合成验收',role,id===2?'/old-account.png':null);
 for(const[id,status]of [[1,'published'],[2,'draft']])db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(?,'合成课程','junior','basic',?,1)").run(id,status);
 db.prepare("INSERT INTO lessons(id,course_id,title,presentation_type,content_state) VALUES(1,1,'参观','visit','preparing'),(2,1,'理论','theory','preparing'),(3,2,'他课','learning','ready')").run();
 db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(2,1,'active'),(5,1,'active')").run();db.prepare("INSERT INTO course_avatar_preferences(student_id,course_id,avatar_id) VALUES(2,1,'maker')").run();
 server=app.listen(0);await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;
 for(const id of[1,2,3,4,5])tokens[id]=(await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'plan'+id,password:'test123'})}).then(r=>r.json())).token;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();});
test('本人受控头像保存、旧头像与课程偏好隔离，切账号重新读取',async()=>{
 assert.deepEqual((await req(2,'/account/avatar')).data,{presetId:null,legacyUrl:'/old-account.png'});
 for(const presetId of ['pilot','glider','ginkgo','robot','telescope','rocket','book','observatory'])assert.equal((await req(2,'/account/avatar','PUT',{presetId})).status,200);
 assert.equal((await req(2,'/auth/me')).data.user.avatar_preset,'observatory');assert.equal((await req(5,'/account/avatar')).data.presetId,null);assert.equal(db.prepare('SELECT avatar_id FROM course_avatar_preferences WHERE student_id=2').get().avatar_id,'maker');assert.equal(db.prepare('SELECT avatar_url FROM users WHERE id=2').get().avatar_url,'/old-account.png');
 for(const body of [{presetId:'url'},{presetId:'pilot',userId:5},{presetId:'pilot',avatarUrl:'/foo'},{},null,[], 'pilot'])assert.equal((await req(2,'/account/avatar','PUT',body)).status,400);
 assert.equal((await req(2,'/account/avatar?userId=5','PUT',{presetId:'pilot'})).status,400);
});
test('真实节点配置与排序，仅同课对象；空未来节点不造课时或进度',async()=>{
 const nodes=Array.from({length:10},(_,i)=>({position:i+1,lessonId:i<2?i+1:null}));assert.equal((await req(1,'/courses/1/maintenance/plan','PUT',{nodes})).status,200);
 const result=await req(2,'/courses/1');assert.equal(result.data.planNodes.length,10);assert.equal(result.data.course.map_mode,'plan');assert.equal(db.prepare('SELECT count(*) n FROM lessons').get().n,3);assert.equal(db.prepare('SELECT count(*) n FROM lesson_progress').get().n,0);
 for(const invalid of [[{position:1,lessonId:3}],[{position:1,lessonId:1},{position:2,lessonId:1}],[{position:1,lessonId:null},{position:1,lessonId:null}],[]])assert.equal((await req(1,'/courses/1/maintenance/plan','PUT',{nodes:invalid})).status,400);
 assert.equal(db.prepare('SELECT count(*) n FROM course_plan_nodes').get().n,10);
});
test('模板字段按维护范围保存、空值不补素材；HTTPS 文章无脚本注入',async()=>{
 const body={description:'真实测试文字。',moments_note:'说明',article_title:'文章',article_url:'https://example.com/source',presentation_type:'visit',content_state:'preparing'};
 assert.equal((await req(1,'/courses/1/maintenance/lessons/1','PUT',body)).status,200);const lesson=(await req(2,'/learning/lessons/1')).data.lesson;assert.equal(lesson.description,body.description);assert.equal(lesson.article_url,body.article_url);
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.equal((await req(1,'/courses/1/maintenance/lessons/1','PUT',{article_url:url})).status,400);
 assert.equal((await req(1,'/courses/1/maintenance/lessons/1','PUT',{article_url:'',article_title:'',moments_note:''})).status,200);const empty=(await req(2,'/learning/lessons/1')).data;assert.equal(empty.lesson.article_url,null);assert.equal(empty.cards.length,0);assert.equal(empty.report,null);assert.notEqual(empty.progress.progress,100);
});
test('教师学生不可维护，撤回/报名移除不返回新字段和计划，归档不可写',async()=>{
 for(const id of[2,3])for(const tail of ['/plan','/lessons/1'])assert.equal((await req(id,'/courses/1/maintenance'+tail,'PUT',tail==='/plan'?{nodes:[{position:1,lessonId:1}]}:{moments_note:'拒绝'})).status,403);
 assert.equal((await req(1,'/courses/1/maintenance/lessons/3','PUT',{description:'跨课'})).status,404);
 db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();assert.equal((await req(2,'/courses/1')).status,404);assert.equal((await req(2,'/learning/lessons/1')).status,404);assert.equal((await req(2,'/learning/lessons/1/report','POST',{})).status,404);
 db.prepare("UPDATE courses SET status='published' WHERE id=1").run();db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=2").run();assert.equal((await req(2,'/courses/1')).status,404);db.prepare("UPDATE enrollments SET status='active' WHERE student_id=2").run();db.prepare("UPDATE courses SET status='archived' WHERE id=1").run();assert.equal((await req(4,'/courses/1/maintenance/lessons/1','PUT',{description:'拒绝'})).status,409);db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
});
test('未准备模板拒绝完成和报告；停用与强制改密仍走原全局鉴权',async()=>{
 for(const endpoint of ['review-complete','report'])assert.equal((await req(2,'/learning/lessons/1/'+endpoint,'POST',{})).status,409);
 assert.equal(db.prepare('SELECT count(*) n FROM lesson_review_completions').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM lesson_learning_reports').get().n,0);
 db.prepare('UPDATE users SET force_reset_password=1 WHERE id=2').run();assert.equal((await req(2,'/account/avatar','PUT',{presetId:'pilot'})).data.code,'FORCE_RESET');db.prepare('UPDATE users SET force_reset_password=0,is_active=0 WHERE id=2').run();assert.equal((await req(2,'/account/avatar')).status,401);
});
test('课时删除后计划保留原编号并成为未知状态，课程级联删除兼容',async()=>{
 db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(4,1,'空对象')").run();assert.equal((await req(1,'/courses/1/maintenance/plan','PUT',{nodes:[{position:1,lessonId:1},{position:10,lessonId:4}]})).status,200);
 db.prepare('DELETE FROM lessons WHERE id=4').run();assert.deepEqual(db.prepare('SELECT position,lesson_id,state FROM course_plan_nodes WHERE position=10').get(),{position:10,lesson_id:null,state:'preparing'});
 db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(3,'空课程','junior','basic','draft',1)").run();db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(4,3,'空对象')").run();db.prepare("INSERT INTO course_plan_nodes(course_id,position,lesson_id,state) VALUES(3,1,4,'linked')").run();db.prepare('DELETE FROM courses WHERE id=3').run();assert.equal(db.prepare('SELECT count(*) n FROM course_plan_nodes WHERE course_id=3').get().n,0);
});
