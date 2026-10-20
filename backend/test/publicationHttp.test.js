const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-publication-http-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(dir,'isolated.db'),UPLOAD_PATH:path.join(dir,'uploads'),JWT_SECRET:'isolated-publication-http-tests'});
const app=require('../app'),db=require('../config/database');
let server,base;const tokens={};
async function api(id,url,body,method=body?'POST':'GET'){
 const r=await fetch(base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[id],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 return{status:r.status,body:await r.json()};
}
before(async()=>{
 for(const [id,role]of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'academic_mentor'],[5,'teacher']]){
  db.prepare('INSERT INTO users(id,username,real_name,password_hash,role) VALUES(?,?,?,?,?)').run(id,'publication-http-'+id,'合成账号'+id,'not-for-login',role);
  tokens[id]=jwt.sign({id,role,auth_version:0},process.env.JWT_SECRET);
 }
 db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(1,'合成课程','junior','basic','published',2)").run();
 db.prepare("INSERT INTO lessons(id,course_id,title,review_content) VALUES(1,1,'原正式课时','真实回顾')").run();
 db.prepare("INSERT INTO tasks(id,lesson_id,title,require_upload) VALUES(1,1,'独立任务',0)").run();
 db.prepare("INSERT INTO enrollments(id,student_id,course_id,status) VALUES(1,3,1,'active')").run();
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(1,1,'原卡片','原正文','published',2)").run();
 db.prepare("INSERT INTO card_exercises(card_id,question_type,prompt,answer_json,explanation) VALUES(1,'true_false','判断','true','详解')").run();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('指定课时上传在接收文件前拒绝正式课时和未授权导师，不生成孤立文件',async()=>{
 const invalid=()=>{const f=new FormData();f.append('file',new Blob(['not-video'],{type:'video/mp4'}),'test.mp4');return f;};
 assert.equal((await api(2,'/courses/1/lessons/1/replays',invalid())).status,409);
 assert.equal((await api(4,'/courses/1/lessons/1/replays',invalid())).status,403);
 const uploads=path.join(dir,'uploads','course-replays');assert.equal(fs.existsSync(uploads)?fs.readdirSync(uploads).length:0,0);
});
test('课时关闭覆盖旧学习、课域转发、任务、实验和反思提交；恢复只走管理员审批',async()=>{
 assert.equal((await api(3,'/learning/lessons/1')).status,200);
 const close=await api(2,'/courses/1/publication/lessons/1/close',{reason:'隔离改稿'});assert.equal(close.status,200);
 assert.equal((await api(3,'/course-spaces/1/learning/lessons/1/availability')).body.open,false);
 for(const url of ['/learning/lessons/1','/course-spaces/1/learning/lessons/1','/tasks/1'])assert.equal((await api(3,url)).status,409,url);
 for(const [url,body]of [
  ['/learning/lessons/1/review-complete',{}],
  ['/glider/simulate',{course_id:1,lesson_id:1}],
  ['/archives/reflection',{enrollment_id:1,lesson_id:1,reflection_version:2,entry_note:'隔离反思'}],
  ['/works',{task_id:1,enrollment_id:1,title:'隔离成果',description:'关闭期间不得新增'}]
 ])assert.equal((await api(3,url,body)).status,409,url);
 assert.equal(db.prepare('SELECT count(*) n FROM glider_simulations').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM reflections').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM works').get().n,0);
 const p=await api(2,'/courses/1/publication',{lesson_id:1,reason:'内容已核对'});assert.equal(p.status,200);
 assert.equal((await api(2,`/courses/1/publication/${p.body.id}/decision`,{decision:'approved',reason:'越权'})).status,403);
 assert.equal((await api(1,`/courses/1/publication/${p.body.id}/decision`,{decision:'approved',reason:'批准恢复'})).status,200);
 assert.equal((await api(3,'/learning/lessons/1/availability')).body.open,true);
 assert.equal((await api(3,'/learning/lessons/1')).status,200);
 assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
});

test('地图与学习页按学生已绑定的教材检查就绪，不被新版参观/准备中模板覆盖',async()=>{
 assert.equal((await api(2,'/courses/1/publication/lessons/1/close',{reason:'新版本调整为参观资料'})).status,200);
 const learning=require('../services/learningService');
 learning.updateCard({id:2,role:'academic_mentor'},1,{status:'archived'});
 db.prepare("UPDATE lessons SET presentation_type='visit',content_state='preparing' WHERE id=1").run();
 const p=await api(2,'/courses/1/publication',{lesson_id:1,reason:'参观版申请'});assert.equal(p.status,200);
 assert.equal((await api(1,`/courses/1/publication/${p.body.id}/decision`,{decision:'approved',reason:'批准参观版'})).status,200);
 const map=await api(3,'/courses/1'),lesson=map.body.lessons.find(l=>l.id===1);assert.equal(map.status,200);
 assert.equal(lesson.presentation_type,'learning');assert.equal(lesson.content_state,'ready');assert.equal(lesson.readiness.ready,true);
 const pkg=await api(3,'/learning/lessons/1');assert.equal(pkg.status,200);assert.equal(pkg.body.read_only,false);assert.equal(pkg.body.lesson.content_state,'ready');
});
