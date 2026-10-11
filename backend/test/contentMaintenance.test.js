const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-maintenance-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(scratch,'content.db'),UPLOAD_PATH:path.join(scratch,'uploads'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),LOGIN_RATE_LIMIT_IP:'500',LOGIN_RATE_LIMIT_USER:'500'});
const app=require('../app'),db=require('../config/database'),XLSX=require('xlsx'),JSZip=require('jszip');
let server,url;const tokens={};
async function request(role,p,method='GET',body){const r=await fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+tokens[role],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});let value;try{value=await r.json();}catch{}return{status:r.status,body:value};}
async function file(role,course,name,bytes,mime='application/octet-stream',fields={},kind='resources'){const body=new FormData();body.append('file',new Blob([bytes],{type:mime}),name);for(const[k,v]of Object.entries(fields))if(v!=null)body.append(k,String(v));return request(role,'/courses/'+course+'/'+kind,'POST',body);}
const files=()=>!fs.existsSync(process.env.UPLOAD_PATH)?[]:fs.readdirSync(process.env.UPLOAD_PATH,{recursive:true}).filter(n=>fs.statSync(path.join(process.env.UPLOAD_PATH,n)).isFile()).sort();
const route=(p,course=1)=>'/courses/'+course+'/maintenance'+p;
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8pAAAAAASUVORK5CYII=','base64');
before(async()=>{
 const hash=require('bcryptjs').hashSync('test123',4);
 for(const[id,role]of [[1,'academic_mentor'],[2,'student'],[3,'teacher'],[4,'admin'],[5,'academic_mentor'],[6,'media']])db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'u'+id,hash,'隔离账号'+id,role);
 for(const id of[1,2,3]){db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(?,?,'junior','basic','published',?)").run(id,'合成课'+id,id===3?5:1);db.prepare('INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)').run(id,id,'课时'+id);db.prepare("INSERT INTO tasks(id,lesson_id,title,description) VALUES(?,?,?,'旧要求')").run(id,id,'任务'+id);db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(?,?,?,'测试','published',?)").run(id,id,'卡片'+id,id===3?5:1);}
 db.prepare("INSERT INTO enrollments(id,student_id,course_id,status) VALUES(1,2,1,'active'),(2,2,2,'active')").run();
 db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description) VALUES(1,2,1,1,'作品','保留历史')").run();
 db.prepare("INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(2,1,35)").run();
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,status,summary) VALUES(2,1,'draft','保留报告')").run();
 await new Promise(r=>server=app.listen(0,r));url='http://127.0.0.1:'+server.address().port;
 for(const role of[1,2,3,4,5,6])tokens[role]=(await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'u'+role,password:'test123'})}).then(r=>r.json())).token;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();});
test('维护角色与上传前授权：只读教师、学生、新媒体、他课导师均拒绝，管理员可维护',async()=>{
 const n=files().length;
 for(const role of[2,3,5,6]){assert.ok([403,404].includes((await request(role,route(''))).status));assert.ok([403,404].includes((await request(role,route('/chapters'),'POST',{title:'不允许'})).status));for(const kind of['resources','replays','cover'])assert.ok([403,404].includes((await file(role,1,'资料.txt','test','text/plain',{},kind)).status));}
 assert.equal(files().length,n);assert.equal((await request(4,route(''))).status,200);assert.equal((await request(1,'/courses/upload-formats')).body.formats.length,22);
});
test('真实章节排序、课时归属与文字清空：不改原学习、报告、作品记录',async()=>{
 const a=(await request(1,route('/chapters'),'POST',{title:'观察（测试）'})).body.id,b=(await request(1,route('/chapters'),'POST',{title:'实践（测试）'})).body.id;
 const foreign=(await request(1,route('/chapters',2),'POST',{title:'另一课章节'})).body.id;
 for(const ids of[[a,a],[a],[a,foreign]])assert.equal((await request(1,route('/chapters/order'),'PUT',{ids})).status,400);
 assert.equal((await request(1,route('/chapters/order'),'PUT',{ids:[b,a]})).status,200);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{chapter_id:foreign})).status,400);
 assert.equal((await request(1,route('/lessons/2'),'PUT',{title:'跨课'})).status,404);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{chapter_id:a,description:'新说明',teaching_tip:'新提示'})).status,200);
 assert.equal((await request(1,route('/chapters/'+a),'DELETE')).status,409);
 assert.equal((await request(1,route('/tasks/1'),'PUT',{description:'新要求'})).status,200);
 assert.equal((await request(1,route('/tasks/1'),'PUT',{lesson_id:2})).status,400);
 assert.equal((await request(1,route('/tasks/2'),'PUT',{description:'跨课'})).status,404);
 assert.equal((await request(1,route('/tasks/1'),'PUT',{title:' '})).status,400);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{description:'',teaching_tip:''})).status,200);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{title:'保留课时'})).status,200);
 const detail=(await request(2,'/course-spaces/1/courses/1')).body;assert.equal(detail.lessons[0].description,null);assert.equal(detail.lessons[0].teaching_tip,null);assert.deepEqual(detail.chapters.map(c=>c.id),[b,a]);assert.equal(detail.tasks[0].description,'新要求');
 assert.equal(db.prepare('SELECT progress FROM lesson_progress WHERE student_id=2 AND lesson_id=1').get().progress,35);assert.equal(db.prepare('SELECT description FROM works WHERE id=1').get().description,'保留历史');assert.equal(db.prepare('SELECT summary FROM lesson_learning_reports WHERE student_id=2 AND lesson_id=1').get().summary,'保留报告');
 assert.equal((await request(1,route('/lessons/1'),'PUT',{chapter_id:null})).status,200);assert.equal((await request(1,route('/chapters/'+a),'DELETE')).status,200);
});
test('受控真实主题与实验关联：跨课和卡片拼接拒绝，启停/解除不改变历史',async()=>{
 assert.equal((await request(1,'/courses/1','PUT',{presentation_theme:'voyage'})).status,200);assert.equal((await request(2,'/course-spaces/1/courses/1')).body.course.presentation_theme,'voyage');
 for(const body of[{presentation_theme:'custom'},{cover_image:'https://evil.invalid/x'},{cover_image:'/uploads/private.png'},{description:'x'.repeat(10001)}])assert.equal((await request(1,'/courses/1','PUT',body)).status,400);
 const values={experiment:'glider',lessonId:1,stage:1,cardId:1,label:'试飞（测试）',enabled:true};
 for(const body of[{...values,lessonId:2},{...values,cardId:2},{...values,stage:2},{...values,experiment:'other'},{...values,url:'/x'}])assert.equal((await request(1,route('/experiments'),'POST',body)).status,400);
 const result=await request(1,route('/experiments'),'POST',values);assert.equal(result.status,200);const id=result.body.id;
 assert.equal((await request(1,route('/experiments'),'POST',values)).status,409);assert.equal((await request(1,route('/experiments/'+id,2),'PUT',values)).status,404);
 assert.equal((await request(2,'/course-spaces/1/courses/1')).body.experiments[0].cardId,1);
 await request(1,route('/experiments/'+id),'PUT',{...values,enabled:false});assert.equal((await request(2,'/course-spaces/1/courses/1')).body.experiments.length,0);
 await request(1,route('/experiments/'+id),'DELETE');assert.equal(db.prepare('SELECT count(*) n FROM works').get().n,1);
 // Existing legitimate IDs must not acquire an arbitrary one-million ceiling.
 db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(2000001,1,'大编号旧课时')").run();assert.equal((await request(1,route('/experiments'),'POST',{experiment:'glider',lessonId:2000001,stage:0,cardId:null,label:'合法大编号来源',enabled:true})).status,200);
});
test('受邀课时导师、停用/强制改密/匿名与回放对象链均遵循真实权限',async()=>{
 db.prepare('UPDATE lessons SET instructor_id=5 WHERE id=2').run();assert.equal((await request(5,route('',2))).status,200);assert.equal((await request(5,route('/chapters',2),'POST',{title:'授课导师可维护'})).status,200);
 const before=files().length;
 assert.equal((await fetch(url+'/api/courses/1/maintenance')).status,401);
 db.prepare('UPDATE users SET force_reset_password=1 WHERE id=1').run();assert.equal((await request(1,route(''))).status,403);assert.equal((await file(1,1,'拒绝.txt','x','text/plain')).status,403);db.prepare('UPDATE users SET force_reset_password=0 WHERE id=1').run();
 db.prepare('UPDATE users SET is_active=0 WHERE id=5').run();assert.equal((await request(5,route('',2))).status,401);assert.equal((await file(5,2,'拒绝.txt','x','text/plain')).status,401);db.prepare('UPDATE users SET is_active=1 WHERE id=5').run();assert.equal(files().length,before);
 const replay=await file(4,1,'回放.webm',fs.readFileSync(path.join(__dirname,'../testFixtures/teaching-replay.webm')),'video/webm',{title:'专用回放',lesson_id:1,description:'说明'},'replays');assert.equal(replay.status,200);const rid=replay.body.id;
 assert.equal((await request(1,route('/replays/'+rid,2),'PUT',{title:'跨课'})).status,404);assert.equal((await request(1,route('/replays/'+rid),'PUT',{lesson_id:2})).status,400);assert.equal((await request(1,route('/replays/'+rid),'PUT',{description:'',lesson_id:null})).status,200);
 assert.equal((await request(1,route('/replays/'+rid),'PUT',{title:'新标题'})).status,200);assert.equal(db.prepare('SELECT description FROM course_replays WHERE id=?').get(rid).description,null);assert.equal((await request(1,route('/replays/'+rid,2),'DELETE')).status,404);
});
test('新增四种真实资料、中文文件名、字段、课时过滤、幂等失败重试与原下载鉴权',async()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['名称','记录'],['试飞',12]]),'观察');
 const list=[['说明.md',Buffer.from('# 观察\n自己记录'), 'text/markdown'],['记录.csv',Buffer.from('名称,值\n试飞,12\n'),'text/csv'],['旧表.xls',XLSX.write(book,{type:'buffer',bookType:'biff8'}),'application/vnd.ms-excel'],['新表.xlsx',XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']];
 const token=crypto.randomUUID();let first;
 for(const [name,bytes,mime]of list){const result=await file(1,1,name,bytes,mime,{title:name,description:'材料说明',resource_type:'template',lesson_id:1,upload_token:name===list[0][0]?token:crypto.randomUUID()});assert.equal(result.status,200,JSON.stringify(result));first??=result.body.id;}
 const repeat=await file(1,1,...list[0],{title:list[0][0],description:'材料说明',resource_type:'template',lesson_id:1,upload_token:token});assert.equal(repeat.body.id,first);assert.equal(repeat.body.reused,true);
 assert.equal((await file(1,1,'说明.md','changed','text/markdown',{title:'changed',upload_token:token})).status,409);
 const another=await file(1,1,'其他课时.txt','other','text/plain',{lesson_id:null,title:'公共'});const r=await request(1,route('/resources/'+another.body.id),'PUT',{lesson_id:1,description:''});assert.equal(r.status,200);
 const data=(await request(1,route(''))).body;assert.equal(data.resources.find(r=>r.id===first).file_name,'说明.md');assert.ok(!JSON.stringify(data).includes(process.env.UPLOAD_PATH));
 const download=await fetch(url+'/api/courses/resources/'+first+'/download',{headers:{Authorization:'Bearer '+tokens[2]}});assert.equal(download.status,200);assert.match(decodeURIComponent(download.headers.get('Content-Disposition')),/说明\.md/);assert.equal(await download.text(),list[0][1].toString());
 assert.equal((await request(3,'/courses/resources/'+first+'/download')).status,404);
 const before=files().length;assert.equal((await file(1,1,'不允许.md','# x','text/markdown',{lesson_id:2})).status,400);assert.equal(files().length,before);
 assert.equal((await request(1,route('/resources/'+first,2),'DELETE')).status,404);assert.equal((await request(1,route('/resources/'+first),'PUT',{lesson_id:2})).status,400);
 assert.equal((await request(1,route('/resources/'+first+'/download',2))).status,404);
 const publicResource=await file(1,1,'公共.txt','public','text/plain',{title:'公共资料'});const foreignLesson=db.prepare("INSERT INTO lessons(course_id,title) VALUES(1,'第二课时')").run().lastInsertRowid;const foreignResource=await file(1,1,'另一课时.txt','other','text/plain',{lesson_id:foreignLesson,title:'另一课时专属'});
 const pkg=(await request(2,'/course-spaces/1/learning/lessons/1')).body;assert.ok(pkg.resources.some(r=>r.id===first));assert.ok(pkg.resources.some(r=>r.id===publicResource.body.id));assert.ok(!pkg.resources.some(r=>r.id===foreignResource.body.id));
});
test('旧资源白名单样本及删除清理兼容，附件仅下载，不扩大为可执行预览',async()=>{
 const zip=await new JSZip().file('readme.txt','synthetic only').generateAsync({type:'nodebuffer'});
 const samples=[['图片.png',image,'image/png'],['讲义.pdf',Buffer.from('%PDF-1.4\n% synthetic sample\n%%EOF'),'application/pdf'],['资料.zip',zip,'application/zip'],['模型.obj','v 0 0 0\n','model/obj'],['模型.gltf','{"asset":{"version":"2.0"},"scenes":[]}','model/gltf+json'],['模型.stl','solid empty\nendsolid empty','model/stl']];
 for(const[name,bytes,mime]of samples){const result=await file(1,1,name,bytes,mime);assert.equal(result.status,200,name);const pathSaved=db.prepare('SELECT file_path FROM resources WHERE id=?').get(result.body.id).file_path;assert.ok(fs.existsSync(pathSaved));assert.equal((await request(1,route('/resources/'+result.body.id),'DELETE')).status,200);assert.ok(!fs.existsSync(pathSaved));assert.equal((await request(2,'/courses/resources/'+result.body.id+'/download')).status,404);}
 const legacyFile=path.join(process.env.UPLOAD_PATH,'legacy.txt');fs.writeFileSync(legacyFile,'old content');const legacy=db.prepare("INSERT INTO resources(course_id,resource_type,title,file_path,upload_by) VALUES(1,'other','旧资料',?,1)").run(legacyFile).lastInsertRowid;assert.equal((await request(1,route(''))).body.resources.find(r=>r.id===legacy).title,'旧资料');assert.equal((await request(2,'/courses/resources/'+legacy+'/download')).status,200);
});
test('伪装/MIME/超限和落库失败均拒绝并清理本次孤立文件；不扩大作品/回放',async()=>{
 const badZip=await new JSZip().file('a.txt','hello').generateAsync({type:'nodebuffer'}),before=files().length;
 for(const[name,bytes,mime]of[['脚本.js','alert(1)','text/javascript'],['伪表.xlsx',badZip,'application/octet-stream'],['伪表.xls','not a workbook','application/octet-stream'],['文本.md',Buffer.from([0,255]),'application/octet-stream'],['错类.csv','a,b','image/png'],['引号.csv','"a,b','text/csv'],['注入.md','<script>alert(1)</script>','text/plain']])assert.equal((await file(1,1,name,bytes,mime)).status,400,name);
 assert.equal((await file(1,1,'超限.txt',Buffer.alloc(50*1024*1024+1,65),'text/plain')).status,400);assert.equal(files().length,before);
 assert.equal((await file(4,1,'回放.txt','test','text/plain',{},'replays')).status,400);assert.equal((await file(1,1,'封面.md','# x','text/markdown',{},'cover')).status,400);
 db.exec("CREATE TRIGGER synthetic_disk_failure BEFORE INSERT ON resources BEGIN SELECT RAISE(ABORT,'synthetic persistent failure'); END");assert.equal((await file(1,1,'失败.md','# x','text/markdown')).status,500);db.exec('DROP TRIGGER synthetic_disk_failure');assert.equal(files().length,before);
});
test('私有封面真实保存/替换、下载范围、失效清除与安全公共封面切换',async()=>{
 const result=await file(1,1,'校园.png',image,'image/png',{},'cover');assert.equal(result.status,200,JSON.stringify(result));const first=db.prepare('SELECT file_path FROM course_covers WHERE course_id=1').get().file_path;assert.ok(fs.existsSync(first));
 assert.equal((await request(2,'/courses/1/cover')).status,200);for(const role of[3,5,6])assert.equal((await request(role,'/courses/1/cover')).status,404);assert.equal((await fetch(url+'/api/courses/1/cover')).status,401);
 assert.equal((await fetch(url+'/uploads/course-covers/'+path.basename(first))).status,404);
 const next=await file(1,1,'新的.png',image,'image/png',{},'cover');assert.notEqual(next.body.cover_image,result.body.cover_image);assert.ok(!fs.existsSync(first));const replacement=db.prepare('SELECT file_path FROM course_covers WHERE course_id=1').get().file_path;
 assert.equal((await file(1,1,'坏图.png',Buffer.from('89504e47','hex'),'image/png',{},'cover')).status,400);assert.ok(fs.existsSync(replacement));
 assert.equal((await file(1,1,'超限.png',Buffer.alloc(5*1024*1024+1),'image/png',{},'cover')).status,400);assert.ok(fs.existsSync(replacement));
 db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();assert.equal((await request(2,'/courses/1/cover')).status,404);assert.equal((await request(2,'/course-spaces/1/courses/1')).status,404);db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
 await request(1,route('/course'),'PUT',{cover_image:'/assets/redesign-v2/web/campus-960.webp',expected_revision:(await request(1,route(''))).body.course.content_revision});assert.ok(!fs.existsSync(replacement));assert.equal(db.prepare('SELECT count(*) n FROM course_covers').get().n,0);
 db.prepare("UPDATE courses SET status='archived' WHERE id=1").run();assert.equal((await request(1,route('/chapters'),'POST',{title:'归档拒绝'})).status,409);assert.equal((await request(1,route(''))).status,200);db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
});
test('016真实旧库、全新库及重复启动迁移保护现有账号和业务记录',()=>{
 const Database=require('better-sqlite3'),legacy=new Database(path.join(scratch,'legacy.db'));legacy.pragma('foreign_keys=ON');legacy.exec(fs.readFileSync(path.join(__dirname,'../testFixtures/schema-v16.sql'),'utf8'));legacy.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
 for(const file of fs.readdirSync(path.join(__dirname,'../database/migrations')).filter(f=>/^\d+_/.test(f)&&parseInt(f)<=16))legacy.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(parseInt(file),file);
 const preserved=['users','courses','enrollments','lessons','tasks','works','lesson_progress','lesson_learning_reports','knowledge_cards','resources','course_replays'];
 for(const table of preserved){const rows=db.prepare('SELECT * FROM '+table).all();if(!rows.length)continue;const oldColumns=legacy.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);const insert=legacy.prepare('INSERT INTO '+table+'('+oldColumns.join(',')+') VALUES('+oldColumns.map(()=>'?').join(',')+')');for(const row of rows)insert.run(...oldColumns.map(c=>row[c]??null));}
 // Populate every required historical category in the real v16 schema, never a business DB.
 legacy.exec(`INSERT INTO works(id,student_id,enrollment_id,task_id,title,parent_work_id,version) VALUES(200,2,1,1,'旧作品第二版本',1,2);
 INSERT INTO card_exercises(id,card_id,question_type,prompt,answer_json) VALUES(200,1,'true_false','合成旧题','true');
 INSERT INTO card_exercise_attempts(student_id,exercise_id,answer_json,is_correct,score,attempt_no) VALUES(2,200,'true',1,1,1);
 INSERT INTO student_card_progress(student_id,card_id,completed_at,best_score) VALUES(2,1,'2026-01-01',1);
 INSERT INTO reflections(student_id,enrollment_id,lesson_id,report_id,difficulty) SELECT 2,1,1,id,'旧反思' FROM lesson_learning_reports WHERE student_id=2 AND lesson_id=1;
 INSERT INTO course_avatar_preferences(student_id,course_id,avatar_id) VALUES(2,1,'navigator');
 INSERT INTO glider_simulations(id,student_id,course_id,lesson_id,status,summary_json) VALUES(200,2,1,1,'success','{"synthetic":true}');
 INSERT INTO glider_trajectories(simulation_id,frame_count,state_dim,frames) VALUES(200,1,3,X'01020304');
 INSERT INTO ai_settings(id,model,base_url,system_prompt,api_key_encrypted) VALUES(1,'synthetic-model','https://example.invalid','旧合成配置','not-a-real-key');`);
 preserved.push('card_exercises','card_exercise_attempts','student_card_progress','reflections','course_avatar_preferences','glider_simulations','glider_trajectories','ai_settings');
 const snapshot=Object.fromEntries(preserved.map(t=>[t,legacy.prepare('SELECT * FROM '+t).all()]));
 const migrate=require('../database/migrate').runMigrations;migrate(legacy);migrate(legacy);
 for(const[t,rows]of Object.entries(snapshot)){assert.ok(rows.length,'旧库测试不是空表 '+t);for(const row of rows){const actual=legacy.prepare('SELECT * FROM '+t+' WHERE '+Object.keys(row).map(k=>k+' IS ?').join(' AND ')).get(...Object.values(row));assert.ok(actual,'旧记录完整 '+t);}}
 assert.deepEqual(legacy.pragma('foreign_key_check'),[]);assert.ok(fs.existsSync(legacy.prepare('SELECT file_path FROM resources WHERE file_path IS NOT NULL LIMIT 1').get().file_path));
 assert.equal(legacy.prepare('SELECT presentation_theme FROM courses WHERE id=1').get().presentation_theme,'campus');assert.equal(legacy.prepare('SELECT count(*) n FROM course_chapters').get().n,0);assert.equal(legacy.prepare('SELECT count(*) n FROM schema_migrations WHERE version=17').get().n,1);
 const fresh=new Database(':memory:');migrate(fresh);migrate(fresh);assert.equal(fresh.prepare('SELECT count(*) n FROM schema_migrations WHERE version=17').get().n,1);legacy.close();fresh.close();
});

test('管理员回放上传边界在文件解析前生效，旧及嵌套入口不落盘',async()=>{
 const old=files(),count=db.prepare('SELECT count(*) n FROM course_replays').get().n;
 for(const role of[1,2,3,5,6])for(const p of['/courses/1/replays','/courses/1/maintenance/replays']){const body=new FormData();body.append('file',new Blob(['invalid video'],{type:'video/webm'}),'forbidden.webm');const r=await request(role,p,'POST',body);assert.ok([403,404].includes(r.status),role+' '+p);}
 assert.deepEqual(files(),old);assert.equal(db.prepare('SELECT count(*) n FROM course_replays').get().n,count);
});
test('维护课时安排与版本冲突保护，跨课授课人及日期无效不写入',async()=>{
 const first=(await request(1,route(''))).body,lesson=first.lessons.find(l=>l.id===1);
 const values={location:'隔离验收教室',duration:45,start_at:'2026-10-20T09:00',end_at:'2026-10-20T09:45',instructor_id:1,sort_order:2};
 assert.equal((await request(1,route('/lessons/1'),'PUT',{...values,expected_revision:lesson.content_revision})).status,200);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{description:'不得覆盖',expected_revision:lesson.content_revision})).status,409);
 const fresh=(await request(1,route(''))).body.lessons.find(l=>l.id===1);assert.equal(fresh.location,values.location);
 for(const values of[{instructor_id:3},{start_at:'not-a-date'},{duration:-1},{start_at:'2026-10-20T10:00',end_at:'2026-10-20T09:00'}])assert.equal((await request(1,route('/lessons/1'),'PUT',values)).status,400);
 const course=(await request(1,route(''))).body.course;
 assert.equal((await request(1,route('/course'),'PUT',{description:'课程真实填写',expected_revision:course.content_revision})).status,200);
 assert.equal((await request(1,route('/course'),'PUT',{description:'旧版本不得覆盖',expected_revision:course.content_revision})).status,409);
});

test('卡片管理版本使用同一原始对象，首次更新成功且过期版本拒绝',async()=>{const card=(await request(1,'/learning/manage/lessons/1/cards')).body.cards[0];assert.equal((await request(1,'/learning/manage/cards/'+card.id,'PUT',{content:'隔离新正文',expected_revision:card.content_revision})).status,200);assert.equal((await request(1,'/learning/manage/cards/'+card.id,'PUT',{content:'旧版本不得覆盖',expected_revision:card.content_revision})).status,409);});

test('新增实验关联真实 ID 与版本返回，同一已知版本只能更新一次',async()=>{const first=await request(1,route('/experiments'),'POST',{experiment:'glider',lessonId:1,stage:0,label:'隔离版本关联',enabled:true});assert.equal(first.status,200);assert.equal(typeof first.body.content_revision,'string');const values={experiment:'glider',lessonId:1,stage:0,label:'隔离更新关联',enabled:true,expected_revision:first.body.content_revision};assert.equal((await request(1,route('/experiments/'+first.body.id),'PUT',values)).status,200);assert.equal((await request(1,route('/experiments/'+first.body.id),'PUT',values)).status,409);});

test('新增练习保存真实版本，后续更新拒绝旧版本且不改作答次数',async()=>{const first=await request(1,'/learning/manage/cards/1/exercises','POST',{question_type:'true_false',prompt:'隔离版本题',answer:true,explanation:'隔离解释'});assert.equal(first.status,201);assert.equal(typeof first.body.content_revision,'string');const value={prompt:'隔离二次更新',expected_revision:first.body.content_revision};assert.equal((await request(1,'/learning/manage/exercises/'+first.body.id,'PUT',value)).status,200);assert.equal((await request(1,'/learning/manage/exercises/'+first.body.id,'PUT',value)).status,409);assert.equal(db.prepare('SELECT max_attempts FROM card_exercises WHERE id=?').get(first.body.id).max_attempts,1);const managed=(await request(1,'/learning/manage/lessons/1/cards')).body.cards.find(c=>c.id===1).exercises.find(e=>e.id===first.body.id);assert.equal(managed.content_revision,require('../helpers/contentRevision').contentRevision(db.prepare('SELECT * FROM card_exercises WHERE id=?').get(first.body.id)));const student=(await request(2,'/learning/lessons/1')).body.cards.find(c=>c.id===1).exercises.find(e=>e.id===first.body.id);assert.equal(Object.hasOwn(student,'content_revision'),false);assert.equal(Object.hasOwn(student,'answer_json'),false);assert.equal(student.correct_answer,null);assert.equal(student.explanation,null);const edit={prompt:'从维护读取的修订更新',expected_revision:managed.content_revision};assert.equal((await request(1,'/learning/manage/exercises/'+first.body.id,'PUT',edit)).status,200);assert.equal((await request(1,'/learning/manage/exercises/'+first.body.id,'PUT',edit)).status,409);});

test('真实教材字段和有序文章统一修订保存，旧说明回退且不改变学生记录',async()=>{
 const tables=['lesson_progress','student_card_progress','card_exercise_attempts','lesson_learning_reports','works','reflections','student_coin_ledger','student_coin_checkins','student_badge_grants'];
 const snapshot=()=>JSON.stringify(tables.map(t=>db.prepare('SELECT * FROM '+t).all()));const before=snapshot();
 const r=await file(1,1,'正文.png',image,'image/png',{title:'正文原图',lesson_id:1});assert.equal(r.status,200);
 const lesson=(await request(1,route(''))).body.lessons.find(l=>l.id===1),blocks=[{id:'p1',type:'paragraph',text:'保留原稿。\n第二行'},{id:'i1',type:'image',resourceId:r.body.id,title:'原图',caption:'说明'},{id:'p2',type:'paragraph',text:'下一段。'},{id:'i2',type:'image',resourceId:r.body.id,title:'同图再出现',caption:''}];
 const saved=await request(1,route('/lessons/1'),'PUT',{article_title:'站内文章',article_blocks:blocks,review_content:'独立回顾',report_guidance:'报告指导',experiment_guidance:'实验指导',expected_revision:lesson.content_revision});assert.equal(saved.status,200);
 assert.equal((await request(1,route('/lessons/1'),'PUT',{article_blocks:[],expected_revision:lesson.content_revision})).status,409);
 const actual=(await request(2,'/learning/lessons/1')).body;assert.deepEqual(actual.lesson.article_blocks,blocks);assert.equal(actual.lesson.review_content,'独立回顾');assert.equal(actual.lesson.report_guidance,'报告指导');assert.equal(actual.lesson.experiment_guidance,'实验指导');
 // Student package recalculates updated_at; authoring itself must not create answers/rewards.
 const afterRead=snapshot();await request(1,route(''));await request(1,'/learning/manage/lessons/1/cards');assert.equal(snapshot(),afterRead);assert.equal(db.prepare('SELECT count(*) n FROM student_coin_ledger').get().n,0);
 assert.ok(before.length);assert.equal((await request(1,route('/resources/'+r.body.id),'DELETE')).status,409);assert.equal((await request(1,route('/resources/'+r.body.id),'PUT',{lesson_id:null})).status,409);
 const fresh=(await request(1,route(''))).body.lessons.find(l=>l.id===1);assert.equal((await request(1,route('/lessons/1'),'PUT',{article_blocks:[],expected_revision:fresh.content_revision})).status,200);assert.equal((await request(1,route('/resources/'+r.body.id),'DELETE')).status,200);
});
test('文章安全白名单、课时图片归属及维护授权由服务端强制检查',async()=>{
 const foreign=(await file(1,2,'异课.png',image,'image/png',{title:'另一课图',lesson_id:2})).body.id;
 const rejected=[[{id:'a',type:'html',html:'<script>1</script>'}],[{id:'a',type:'paragraph',text:'<iframe src=x>'}],[{id:'a',type:'paragraph',text:'javascript:alert(1)'}],[{id:'a',type:'image',resourceId:foreign,title:'',caption:''}],[{id:'a',type:'image',resourceId:foreign,url:'https://evil.invalid/x'}],[{id:'a',type:'paragraph',text:'x'},{id:'a',type:'paragraph',text:'y'}],Array.from({length:201},(_,i)=>({id:String(i),type:'paragraph',text:'x'}))];
 for(const article_blocks of rejected)assert.equal((await request(1,route('/lessons/1'),'PUT',{article_blocks})).status,400);
 for(const role of[2,3,5,6])assert.ok([403,404].includes((await request(role,route('/lessons/1'),'PUT',{review_content:'不得写'})).status));
 assert.equal((await request(4,route('/lessons/1'),'PUT',{review_content:'管理员合法更新'})).status,200);
 db.prepare("UPDATE courses SET status='archived' WHERE id=1").run();assert.equal((await request(1,route('/lessons/1'),'PUT',{review_content:'归档拒绝'})).status,409);db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
});
