const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-course-merge-'));
Object.assign(process.env,{DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'),NODE_ENV:'test',JWT_SECRET:'course-merge-regression'});
const app=require('../app');const db=require('../config/database');const observer=require('../services/observerService');const archive=require('../controllers/archiveController');
let server,base;
before(async()=>{
 db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'admin','not-used','管理员','admin'),(2,'mentor','not-used','导师','academic_mentor'),(3,'student','not-used','学生','student'),(4,'teacher','not-used','教师','teacher')").run();
 db.prepare('UPDATE users SET teacher_id=4 WHERE id=3').run();
 db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(1,'真实课程','junior','basic','published',2),(2,'失效课程','junior','basic','draft',2),(3,'可关闭课程','junior','basic','published',2)").run();
 db.prepare("INSERT INTO enrollments(id,student_id,course_id) VALUES(1,3,1),(2,3,2),(3,3,3)").run();
 db.prepare("INSERT INTO course_chapters(id,course_id,title,sort_order) VALUES(1,1,'已录章节',1)").run();
 db.prepare("INSERT INTO lessons(id,course_id,title,chapter_id,location,duration,start_at,instructor_id) VALUES(1,1,'有安排的课时',1,'原教室',45,'2026-10-20T15:00',2),(2,2,'不可见课时',NULL,NULL,NULL,NULL,2),(3,3,'待评课时',NULL,NULL,NULL,NULL,2)").run();
 db.prepare("INSERT INTO course_plan_nodes(course_id,position,lesson_id,state) VALUES(1,1,1,'linked')").run();
 // A formally re-approved normal lesson requires complete teaching content.
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(1,1,'隔离卡片','真实教材','published',2)").run();
 db.prepare("INSERT INTO card_exercises(card_id,question_type,prompt,answer_json,explanation) VALUES(1,'true_false','判断题','true','参考详解')").run();
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,enrollment_id,summary,key_points,application,difficulties,next_plan,status,score) VALUES(3,1,1,'报告正文','关键知识','应用记录','困难记录','下一步','approved',91),(3,2,2,'无权报告',NULL,NULL,NULL,NULL,'approved',90),(3,3,3,'待评报告',NULL,NULL,NULL,NULL,'submitted',NULL)").run();
  require('./helpers/explicitScopeFixture.cjs').observers(db);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
function token(id){const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);return jwt.sign({id:u.id,role:u.role,auth_version:u.auth_version},process.env.JWT_SECRET);}
async function api(url,method='GET',body,id=1){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token(id),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
function replayForm(key,content='same'){const f=new FormData();for(const[k,v]of Object.entries({title:'真实回放',description:'视频简介',summary:'回放摘要',lesson_id:'1',request_key:key}))f.append(k,v);const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.from(content)]);f.append('file',new Blob([bytes],{type:'video/mp4'}),'lesson.mp4');return f;}
test('课程详情保留章节计划、教学安排与上游完成状态，观察者可看尚未开始课时和完整报告',async()=>{
 const r=await api('/courses/1','GET',undefined,3);assert.equal(r.status,200);assert.equal(r.body.chapters[0].title,'已录章节');assert.equal(r.body.planNodes[0].lesson_id,1);assert.equal(r.body.lessons[0].location,'原教室');assert.equal(r.body.lessons[0].duration,45);assert.equal(r.body.lessons[0].instructor_name,'导师');assert.ok(r.body.course.completion);
 const d=observer.studentDetail({id:4,role:'teacher'},3);const lesson=d.lessons.find(l=>l.lesson_id===1);assert.equal(lesson.progress,40);assert.equal(lesson.key_points,'关键知识');assert.equal(lesson.application,'应用记录');assert.equal(lesson.difficulties,'困难记录');assert.equal(lesson.next_plan,'下一步');assert.equal(lesson.score,91);
 const a=archive.loadStudentArchive(3,{id:3,role:'student'},1);assert.deepEqual(a.learningReports.map(r=>r.lesson_id),[1]);assert.equal(a.learningReports[0].summary,'报告正文');assert.ok(!archive.loadStudentArchive(3,{id:3,role:'student'}).learningReports.some(r=>r.lesson_id===2));
});
test('回放保存摘要、字节幂等与部分修改，非管理角色不可通过任一写入口修改',async()=>{
 require('./helpers/publicationFixture.cjs').edit({id:1,role:'admin'},1,1);
 const one=await api('/courses/1/replays','POST',replayForm('replay_merge_123'));assert.equal(one.status,200,JSON.stringify(one.body));const id=one.body.id;
 const duplicate=await api('/courses/1/replays','POST',replayForm('replay_merge_123'));assert.equal(duplicate.status,200);assert.equal(duplicate.body.id,id);assert.equal(db.prepare('SELECT COUNT(*) n FROM course_replays').get().n,1);
 const changed=await api('/courses/1/replays','POST',replayForm('replay_merge_123','different'));assert.equal(changed.status,409);
 const updated=await api('/courses/replays/'+id,'PUT',{summary:'修改后的摘要'});assert.equal(updated.status,200);const stored=db.prepare('SELECT * FROM course_replays WHERE id=?').get(id);assert.equal(stored.title,'真实回放');assert.equal(stored.description,'视频简介');assert.equal(stored.summary,'修改后的摘要');assert.equal(stored.lesson_id,1);
 require('./helpers/publicationFixture.cjs').publish({id:1,role:'admin'},1,1);
 const list=await api('/courses/1/replays','GET',undefined,3);assert.equal(list.body.replays[0].summary,'修改后的摘要');assert.equal(list.body.replays[0].video_path,undefined);
 const maintenance=await api('/courses/1/maintenance');assert.equal(maintenance.body.replays[0].summary,'修改后的摘要');
 for(const [url,method,body]of [['/courses/1/replays','POST',replayForm('mentor_replay_123')],['/courses/replays/'+id,'PUT',{title:'越权'}],['/courses/replays/'+id,'DELETE',undefined],['/courses/1/maintenance/replays/'+id,'PUT',{title:'旁路越权'}],['/courses/1/maintenance/replays/'+id,'DELETE',undefined]])assert.equal((await api(url,method,body,4)).status,403);
});
test('原课程外观维护仍保存，有历史禁止撤回、待评禁止关闭，合法归档立即撤销学生读取',async()=>{
 db.prepare("UPDATE courses SET presentation_theme='voyage',public_theme=NULL,cover_image='/assets/redesign-v2/web/cosmos-960.webp' WHERE id=1").run(); // Explicit pre-existing voyage fixture; new courses cannot select it.
 const appearance=await api('/courses/1','PUT',{presentation_theme:'voyage',cover_image:'/assets/redesign-v2/web/cosmos-960.webp'});assert.equal(appearance.status,200);assert.equal(db.prepare('SELECT presentation_theme FROM courses WHERE id=1').get().presentation_theme,'voyage');
 assert.equal((await api('/courses/1','PUT',{status:'draft'})).status,409);
 assert.equal((await api('/courses/3','PUT',{status:'archived'})).status,409);
 db.prepare("UPDATE lesson_learning_reports SET status='approved',score=90 WHERE lesson_id=3").run();
 assert.equal((await api('/courses/3','PUT',{status:'archived'})).status,200);
 assert.equal((await api('/courses/3','GET',undefined,3)).status,404);
 assert.equal((await api('/courses/3','PUT',{title:'不得修改历史'})).status,409);
 assert.equal((await api('/courses/3/lessons','POST',{title:'不得添加'})).status,409);
});

test('资料上传保留原始文件名与可恢复标识，跨课程或取消课时不能挂接，文章引用不能误删',async()=>{
 require('./helpers/publicationFixture.cjs').edit({id:1,role:'admin'},1,1);
 const form=(lessonId,title='资料说明')=>{const f=new FormData();f.append('title',title);f.append('resource_type','other');f.append('lesson_id',String(lessonId));f.append('upload_token','12345678-1234-1234-1234-123456789abc');f.append('file',new Blob([Buffer.from('实际教材资料')],{type:'text/markdown'}),'original.md');return f;};
 const one=await api('/courses/1/resources','POST',form(1),2);assert.equal(one.status,200,JSON.stringify(one.body));
 const two=await api('/courses/1/resources','POST',form(1),2);assert.equal(two.status,200);assert.equal(two.body.id,one.body.id);assert.equal(two.body.reused,true);
 const changed=await api('/courses/1/resources','POST',form(1,'另一说明'),2);assert.equal(changed.status,409);
 assert.equal(db.prepare('SELECT file_name FROM resources WHERE id=?').get(one.body.id).file_name,'original.md');
 assert.equal((await api('/courses/1/resources','POST',form(2),2)).status,400);
 db.prepare('UPDATE lessons SET article_blocks=? WHERE id=1').run(JSON.stringify([{type:'image',resourceId:one.body.id}]));
 const removed=await api('/courses/resources/'+one.body.id,'DELETE');assert.equal(removed.status,409);assert.match(removed.body.error,/文章|快照/);
 assert.ok(db.prepare('SELECT id FROM resources WHERE id=?').get(one.body.id));
 db.prepare("INSERT INTO lessons(id,course_id,title,status) VALUES(4,1,'取消课时','cancelled')").run();
 assert.equal((await api('/courses/1/resources','POST',form(4),2)).status,400);
 const moved=await api('/courses/1/maintenance/resources/'+one.body.id,'PUT',{lesson_id:4},2);assert.equal(moved.status,409);assert.match(moved.body.error,/取消/);
 const historical=db.prepare("INSERT INTO resources(course_id,lesson_id,title,resource_type,upload_by) VALUES(1,4,'取消后的历史资料','other',2)").run().lastInsertRowid;
 const changedHistory=await api('/courses/1/maintenance/resources/'+historical,'PUT',{title:'不可修改历史'},2);assert.equal(changedHistory.status,409);assert.match(changedHistory.body.error,/取消/);
});
test('历史快照只保护实际引用的资料和回放，补充快照与文章引用受保护，同号异类新文件仍可删除',async()=>{
 const addResource=(title)=>{const target=path.join(dir,'uploads','resources',title+'.md');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,title);const id=Number(db.prepare("INSERT INTO resources(course_id,lesson_id,title,resource_type,upload_by,file_path) VALUES(1,1,?,'other',2,?)").run(title,target).lastInsertRowid);return{id,target};};
 const original=addResource('绑定版本的旧资料');require('../helpers/lessonVersions').saveVersion(db,1);
 const oldReplay=db.prepare('SELECT id,video_path FROM course_replays ORDER BY id LIMIT 1').get();
 const fresh=addResource('快照之后的新资料');const replay=await api('/courses/1/replays','POST',replayForm('fresh_replay_merge_123'));assert.equal(replay.status,200);const freshReplay=db.prepare('SELECT id,video_path FROM course_replays WHERE id=?').get(replay.body.id);
 const snapshot=(fingerprint,content)=>Number(db.prepare('INSERT INTO lesson_content_versions(lesson_id,fingerprint,content_json) VALUES(1,?,?)').run(fingerprint,JSON.stringify(content)).lastInsertRowid);
 // These two integer IDs are deliberately present only in the OTHER asset
 // namespace; this must not make unrelated new uploads undeletable.
 snapshot('asset-namespace-collision',{lesson:{id:1},resources:[{id:freshReplay.id}],replays:[{id:fresh.id}],cards:[]});
 assert.equal((await api('/courses/resources/'+original.id,'DELETE')).status,409);assert.ok(fs.existsSync(original.target));
 assert.equal((await api('/courses/replays/'+oldReplay.id,'DELETE')).status,409);assert.ok(fs.existsSync(oldReplay.video_path));
 assert.equal((await api('/courses/resources/'+fresh.id,'DELETE')).status,200);assert.equal(fs.existsSync(fresh.target),false);
 assert.equal((await api('/courses/replays/'+freshReplay.id,'DELETE')).status,200);assert.equal(fs.existsSync(freshReplay.video_path),false);
 const supplemented=addResource('升级补充中的资料'),version=snapshot('asset-sidecar',{lesson:{id:1},resources:[],replays:[],cards:[]});
 db.prepare('INSERT INTO lesson_version_supplements(content_version_id,lesson_json,resources_json) VALUES(?,?,?)').run(version,'{}',JSON.stringify([{id:supplemented.id}]));
 assert.equal((await api('/courses/resources/'+supplemented.id,'DELETE')).status,409);assert.ok(fs.existsSync(supplemented.target));
 const article=addResource('旧文章中的图片');snapshot('asset-article',{lesson:{id:1,article_blocks:JSON.stringify([{type:'image',resourceId:article.id}])},resources:[],replays:[],cards:[]});
 assert.equal((await api('/courses/resources/'+article.id,'DELETE')).status,409);assert.ok(fs.existsSync(article.target));
 const upgradeArticle=addResource('升级补充文章中的图片'),upgradeVersion=snapshot('asset-sidecar-article',{lesson:{id:1},resources:[],replays:[],cards:[]});
 db.prepare('INSERT INTO lesson_version_supplements(content_version_id,lesson_json) VALUES(?,?)').run(upgradeVersion,JSON.stringify({article_blocks:JSON.stringify([{type:'image',resourceId:upgradeArticle.id}])}));
 assert.equal((await api('/courses/resources/'+upgradeArticle.id,'DELETE')).status,409);assert.ok(fs.existsSync(upgradeArticle.target));
});
