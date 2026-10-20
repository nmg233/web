const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-mentor-school-'));
Object.assign(process.env,{DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),NODE_ENV:'test',JWT_SECRET:'mentor-workspace-isolated-secret'});
const app=require('../app'),db=require('../config/database');let server,base,course,student,teacher;const tokens={},key=()=>crypto.randomUUID();
async function call(id,url,body,method=body?'POST':'GET'){const r=await fetch(base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[id],'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
const scope=(actor,cid,ids,revision=1,extra={})=>call(actor,`/mentor-workspace/courses/${cid}/schools`,{school_ids:ids,expectedRevision:revision,reason:'隔离范围验收',request_key:key(),...extra},'PUT');
before(async()=>{
 const hash=require('bcryptjs').hashSync('isolated-user',4);
 for(const[id,role]of[[1,'admin'],[2,'academic_mentor'],[3,'academic_mentor'],[4,'academic_mentor'],[5,'teacher']]){db.prepare('INSERT INTO users(id,username,real_name,role,password_hash) VALUES(?,?,?,?,?)').run(id,'mentor_test_'+id,'合成账号'+id,role,hash);tokens[id]=jwt.sign({id,role,auth_version:0},process.env.JWT_SECRET);}
 for(const id of[11,12]){db.prepare('INSERT INTO schools(id,name) VALUES(?,?)').run(id,'合成学校'+id);db.prepare('INSERT INTO classes(id,school_id,name,grade) VALUES(?,?,?,?)').run(id,id,'合成班','七');}
 for(const[id,mentor,school]of[[11,2,11],[12,3,12],[13,3,11]]){db.prepare("INSERT INTO school_applications(id,applicant_id,name,normalized_name,region,explanation,status,school_id) VALUES(?,?,?,?,'测试','测试','approved',?)").run(id,mentor,'学校'+school,'school'+school,school);db.prepare('INSERT INTO school_managers(school_id,mentor_id,application_id,granted_by) VALUES(?,?,?,1)').run(school,mentor,id);}
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('无学校可创建草稿，不能直接创建已发布课或绕过上线范围',async()=>{
 const draft=await call(4,'/courses',{title:'无校草稿',grade_level:'junior',difficulty:'basic',request_key:key()});assert.equal(draft.status,200);assert.equal((await call(4,`/courses/${draft.data.id}`,{status:'published'},'PUT')).status,409);
 assert.equal((await call(4,'/courses',{title:'绕过',grade_level:'junior',difficulty:'basic',status:'published'})).status,409);
 assert.equal((await scope(4,draft.data.id,[11])).status,403);
});
test('旧班级入口及学校目录只返回当前获准学校，admin包含全部',async()=>{
 assert.deepEqual((await call(2,'/auth/schools')).data.schools.map(s=>s.id),[11]);
 assert.equal((await call(2,'/auth/classes?school_id=12')).status,403);assert.equal((await call(2,'/auth/classes?school_id=11')).data.classes.length,1);
 assert.equal((await call(1,'/auth/classes?school_id=12')).status,200);
});
test('共管课程范围按修订合并，不清空其他导师学校，并发修订拒绝',async()=>{
 course=(await call(2,'/courses',{title:'共同课程',grade_level:'junior',difficulty:'basic',request_key:key()})).data.id;
 assert.equal((await call(1,`/courses/${course}/managers`,{mentorId:3,active:true,expectedRevision:0,reason:'共管',request_key:key()})).status,200);
 assert.equal((await scope(3,course,[12])).status,200);assert.equal((await scope(2,course,[11],2)).status,200);
 const data=(await call(2,`/mentor-workspace/courses/${course}/schools`)).data;assert.deepEqual(data.scopes.map(s=>s.school_id).sort(),[11,12]);assert.equal(data.scopes.find(s=>s.school_id===12).editable,false);
 assert.equal((await scope(2,course,[],1)).status,409);const publication=require('../services/publicationService'),actor={id:1,role:'admin'},p=publication.submit(actor,course,{reason:'隔离发布'});publication.decide(actor,course,p.id,{decision:'approved',reason:'核对批准'});
});
test('本校幂等建学生与教师，角色注入拒绝，admin真实操作者可建号',async()=>{
 student=(await call(2,'/school-applications/schools/11/students',{class_id:11,real_name:'范围同学',request_key:key()})).data.id;assert.ok(student);
 const body={real_name:'观察教师',class_id:11,request_key:key()},results=await Promise.all(Array.from({length:4},()=>call(2,'/mentor-workspace/schools/11/teachers',body)));
 assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.id)).size,1);teacher=results[0].data.id;
 assert.equal((await call(2,'/mentor-workspace/schools/11/teachers',{...body,role:'admin',request_key:key()})).status,400);
 assert.equal((await call(1,'/mentor-workspace/schools/12/teachers',{real_name:'管理员建教师',class_id:12,request_key:key()})).status,200);
 const creds=await call(2,`/mentor-workspace/schools/11/teachers/${teacher}/credentials`);assert.equal(creds.status,200);assert.equal(creds.data.role,'teacher');assert.equal(creds.data.force_reset_password,1);
 db.prepare('UPDATE users SET force_reset_password=0 WHERE id=?').run(teacher);tokens[teacher]=jwt.sign({id:teacher,role:'teacher',auth_version:0,school_id:11},process.env.JWT_SECRET);
 assert.equal((await call(2,`/mentor-workspace/schools/11/teachers/${teacher}/credentials`)).status,409);
});
test('招生需课程、上线学校、本人账号交集；同校/他课关系及批量不能绕过',async()=>{
 const other=(await call(3,'/school-applications/schools/11/students',{class_id:11,real_name:'同校另一导师同学',request_key:key()})).data.id;
 assert.equal((await call(2,`/courses/${course}/enroll`,{student_ids:[student,other]})).status,403);assert.equal(db.prepare('SELECT count(*) n FROM enrollments WHERE course_id=?').get(course).n,0);
 assert.equal((await call(2,`/courses/${course}/enroll`,{student_ids:[student]})).status,200);
 assert.equal((await call(2,`/courses/${course}/enroll/candidates`)).data.students.some(s=>s.id===other),false);
 assert.equal((await call(1,`/courses/${course}/enroll`,{student_ids:[other]})).status,200);
});
test('教师只读被授学生指定课程：列表、档案、过滤、预览无跨课数据',async()=>{
 const c2=(await call(2,'/courses',{title:'不得看到的第二课',grade_level:'junior',difficulty:'basic',request_key:key()})).data.id;
 assert.equal((await scope(2,c2,[11])).status,200);require('./helpers/publicationFixture.cjs').publish({id:1,role:'admin'},c2);assert.equal((await call(2,`/courses/${c2}/enroll`,{student_ids:[student]})).status,200);
 for(const cid of[course,c2])db.prepare('INSERT INTO lessons(course_id,title) VALUES(?,?)').run(cid,'课程课时'+cid);
 const body={teacherId:teacher,studentId:student,courseId:course,active:true,expectedRevision:0,reason:'只观察这一课',request_key:key()};assert.equal((await call(2,'/mentor-workspace/schools/11/observers',body)).status,200);
 const list=(await call(teacher,'/observer/students')).data;assert.equal(list.pagination.total,1);assert.deepEqual(list.items[0].courses.map(c=>c.id),[course]);assert.deepEqual(list.filters.courses.map(c=>c.value),[course]);
 const detail=(await call(teacher,`/observer/students/${student}`)).data;assert.deepEqual(detail.courses.map(c=>c.id),[course]);
 const archive=(await call(teacher,'/archives/generate?student_id='+student)).data;assert.deepEqual(archive.courses.map(c=>c.course_id),[course]);
 const forbiddenLesson=db.prepare('SELECT id FROM lessons WHERE course_id=?').get(c2).id;assert.equal((await call(teacher,`/learning/lessons/${forbiddenLesson}/preview`)).status,403);
 assert.equal((await call(teacher,'/mentor-workspace/schools/11/observers',body)).status,403);
});
test('学校撤权即时停止建号/招生及导师授予的教师观察，不删除课程权或历史',async()=>{
 db.prepare('UPDATE school_managers SET active=0 WHERE school_id=11 AND mentor_id=2').run();
 assert.equal((await call(2,'/auth/classes?school_id=11')).status,403);assert.equal((await call(2,'/mentor-workspace/schools/11/teachers',{real_name:'越权',class_id:11,request_key:key()})).status,403);
 assert.equal((await call(teacher,'/observer/students')).data.pagination.total,0);assert.equal((await call(2,`/courses/${course}/maintenance`)).status,200);
 assert.equal(db.prepare('SELECT count(*) n FROM enrollments WHERE student_id=?').get(student).n,2);
 db.prepare('UPDATE school_managers SET active=1 WHERE school_id=11 AND mentor_id=2').run();
});
test('缩小上线范围须admin影响确认，幂等保留既有报名；工作台计数完整',async()=>{
 assert.equal((await scope(2,course,[],3)).status,409);assert.equal((await scope(1,course,[12],3)).status,409);
 assert.equal((await scope(1,course,[12],3,{confirmExisting:true})).status,200);
 assert.equal(db.prepare("SELECT count(*) n FROM enrollment_access_confirmations a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.course_id=? AND source='admin_preserved'").get(course).n,2);
 const dashboard=(await call(2,'/mentor-workspace/dashboard?category=courses&pageSize=1')).data;assert.equal(dashboard.items.length,1);assert.equal(dashboard.total,dashboard.counts.courses);assert.ok(dashboard.total>=2);
 assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
});
test('管理员明确委托本校账号才可跨导师维护，导师不能自行再授权',async()=>{
 const url='/mentor-workspace/schools/11/account-delegations';
 const body={mentorId:3,studentId:student,active:true,expectedRevision:0,reason:'明确交接组织学生',request_key:key()};
 assert.equal((await call(3,url,body)).status,403);
 assert.equal((await call(3,'/mentor-workspace/schools/11/observers')).data.students.some(s=>s.id===student),false);
 assert.equal((await call(1,url,body)).status,200);assert.equal((await call(1,url,body)).status,200);
 assert.equal((await call(3,'/mentor-workspace/schools/11/observers')).data.students.some(s=>s.id===student),true);
 assert.equal((await call(1,url,{...body,active:false,expectedRevision:1,request_key:key()})).status,200);
 assert.equal((await call(3,'/mentor-workspace/schools/11/observers')).data.students.some(s=>s.id===student),false);
});
