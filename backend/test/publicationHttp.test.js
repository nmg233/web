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
 db.prepare("INSERT INTO lessons(id,course_id,title,review_content,start_at,location) VALUES(1,1,'原正式课时','真实回顾','2099-10-22T12:00','正式教室')").run();
 db.prepare("INSERT INTO tasks(id,lesson_id,title,require_upload) VALUES(1,1,'独立任务',0)").run();
 db.prepare("INSERT INTO enrollments(id,student_id,course_id,status) VALUES(1,3,1,'active')").run();
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(1,1,'原卡片','原正文','published',2)").run();
 db.prepare("INSERT INTO card_exercises(card_id,question_type,prompt,answer_json,explanation) VALUES(1,'true_false','判断','true','详解')").run();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('正式课时不再拒绝进入上传流程，伪视频与未授权导师仍拒绝且不留孤立文件',async()=>{
 const invalid=()=>{const f=new FormData();f.append('file',new Blob(['not-video'],{type:'video/mp4'}),'test.mp4');return f;};
 assert.equal((await api(2,'/courses/1/lessons/1/replays',invalid())).status,400);
 assert.equal((await api(4,'/courses/1/lessons/1/replays',invalid())).status,403);
 const uploads=path.join(dir,'uploads','course-replays');assert.equal(fs.existsSync(uploads)?fs.readdirSync(uploads).length:0,0);
});
test('旧关闭接口停用；后台改稿期间课域、学习、任务与提交继续使用原正式版',async()=>{
 assert.equal((await api(3,'/learning/lessons/1')).status,200);
 const close=await api(2,'/courses/1/publication/lessons/1/close',{reason:'旧页面操作'});assert.equal(close.status,410);
 assert.equal((await api(2,'/courses/1/maintenance/lessons/1',{review_content:'未审批回顾'},'PUT')).status,200);
 assert.equal((await api(3,'/course-spaces/1/learning/lessons/1/availability')).body.open,true);
 for(const url of ['/learning/lessons/1','/course-spaces/1/learning/lessons/1','/tasks/1'])assert.equal((await api(3,url)).status,200,url);
 assert.equal((await api(3,'/learning/lessons/1')).body.lesson.review_content,'真实回顾');
 assert.equal((await api(3,'/learning/lessons/1/review-complete',{})).status,200);
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
 assert.equal((await api(2,'/courses/1/publication/lessons/1/close',{reason:'新版本调整为参观资料'})).status,410);
 const learning=require('../services/learningService');
 learning.updateCard({id:2,role:'academic_mentor'},1,{status:'archived'});
 db.prepare("UPDATE lessons SET presentation_type='visit',content_state='preparing' WHERE id=1").run();
 const p=await api(2,'/courses/1/publication',{lesson_id:1,reason:'参观版申请'});assert.equal(p.status,200);
 assert.equal((await api(1,`/courses/1/publication/${p.body.id}/decision`,{decision:'approved',reason:'批准参观版'})).status,200);
 const map=await api(3,'/courses/1'),lesson=map.body.lessons.find(l=>l.id===1);assert.equal(map.status,200);
 assert.equal(lesson.presentation_type,'learning');assert.equal(lesson.content_state,'ready');assert.equal(lesson.readiness.ready,true);
 const pkg=await api(3,'/learning/lessons/1');assert.equal(pkg.status,200);assert.equal(pkg.body.read_only,false);assert.equal(pkg.body.lesson.content_state,'ready');
});
test('新增与修改独立成果任务不从课程详情、首页、待办、深链或作品标题泄露草稿',async()=>{
 const official=db.prepare('SELECT title FROM tasks WHERE id=1').get().title;
 assert.equal((await api(2,'/courses/1/maintenance/tasks/1',{title:'未审批任务标题'},'PUT')).status,200);
 const added=await api(2,'/courses/lessons/1/tasks',{title:'未审批新增任务',description:'草稿要求'});assert.equal(added.status,200);const taskId=added.body.id;
 assert.equal((await api(2,'/courses/1/maintenance/lessons/1',{start_at:'2000-01-01T00:00',location:'未审批地点'},'PUT')).status,200);
 assert.equal((await api(3,'/tasks/'+taskId)).status,404);
 const list=await api(3,'/tasks');assert.equal(list.status,200);assert.equal(list.body.tasks.find(t=>t.id===1).title,official);assert.equal(list.body.tasks.some(t=>t.id===taskId),false);
 const course=await api(3,'/courses/1');assert.equal(course.body.tasks.find(t=>t.id===1).title,official);assert.equal(course.body.tasks.some(t=>t.id===taskId),false);
 const pending=await api(3,'/works/pending-tasks');assert.equal(pending.status,200);assert.equal(pending.body.tasks.some(t=>t.id===taskId),false);
 const dash=await api(3,'/dashboard');assert.equal(dash.status,200);assert.equal(dash.body.pendingTasks.find(t=>t.id===1).title,official);assert.equal(dash.body.pendingTasks.some(t=>t.id===taskId),false);
 assert.equal(dash.body.nextLesson.start_at,'2099-10-22T12:00');assert.equal(dash.body.nextLesson.location,'正式教室');
 assert.equal((await api(3,'/works',{task_id:taskId,title:'不可提前提交',description:'合成正文'})).status,409);
 const submitted=await api(3,'/works',{task_id:1,title:'原任务成果',description:'合成正文'});assert.equal(submitted.status,200);
 const workId=db.prepare('SELECT id FROM works WHERE student_id=3 AND task_id=1').get().id;
 const detail=await api(3,'/works/'+workId);assert.equal(detail.status,200);assert.equal(detail.body.work.task_title,official);
 const works=await api(3,'/works');assert.equal(works.body.works.find(w=>w.id===workId).task_title,official);
});
