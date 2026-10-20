const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-authorization-'));
Object.assign(process.env,{DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),NODE_ENV:'test',JWT_SECRET:'isolated-authorization-secret'});
const app=require('../app'),db=require('../config/database');let server,base,schoolA,schoolB,classA,createdStudent;const key=()=>crypto.randomUUID();
const tokens={};
async function call(actor,url,body,method=body?'POST':'GET'){const res=await fetch(base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[actor],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});const type=res.headers.get('content-type');return{status:res.status,data:type?.includes('json')?await res.json():await res.arrayBuffer()};}
const grant=(courseId,mentorId,active=true,expectedRevision=0)=>call(1,`/courses/${courseId}/managers`,{mentorId,active,expectedRevision,reason:'隔离授权验收',request_key:key()});
before(async()=>{
 const pwd=require('bcryptjs').hashSync('user123',4);for(const[id,role]of[[1,'admin'],[2,'academic_mentor'],[3,'academic_mentor'],[4,'teacher'],[5,'student'],[6,'admin']]){db.prepare('INSERT INTO users(id,username,real_name,role,password_hash) VALUES(?,?,?,?,?)').run(id,'scope_'+id,'合成账号'+id,role,pwd);tokens[id]=jwt.sign({id,role,school_id:null,auth_version:0},process.env.JWT_SECRET);}
 for(const id of[1,2]){db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,created_by,status) VALUES(?,?,'junior','basic',1,'published')").run(id,'隔离课程'+id);db.prepare('INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)').run(id,id,'隔离课时'+id);}
 db.prepare("INSERT INTO schools(id,name) VALUES(1,'已有学校')").run();db.prepare("INSERT INTO classes(id,school_id,name,grade) VALUES(1,1,'已有班','七年级')").run();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('授权前拒绝、管理员幂等并发授权、多导师各课隔离、导师不可再授权',async()=>{
 assert.equal((await call(1,'/courses/1/managers',{mentorId:2,active:true,expectedRevision:0,reason:{invalid:true},request_key:key()})).status,400);
 assert.equal((await call(2,'/courses/1/maintenance')).status,404);
 const body={mentorId:2,active:true,expectedRevision:0,reason:'授予',request_key:key()},results=await Promise.all(Array.from({length:8},()=>call(1,'/courses/1/managers',body)));assert.ok(results.every(r=>r.status===200));assert.equal(db.prepare("SELECT count(*) n FROM course_manager_events WHERE course_id=1 AND action='grant'").get().n,1);
 assert.equal((await grant(2,3)).status,200);assert.equal((await call(2,'/courses/1/maintenance')).status,200);assert.equal((await call(2,'/courses/2/maintenance')).status,404);assert.equal((await call(3,'/courses/1')).status,403);assert.equal((await call(2,'/courses/1/managers',body)).status,403);assert.equal((await call(4,'/courses/1/maintenance')).status,403);
 require('./helpers/publicationFixture.cjs').close({id:1,role:'admin'},1,1);
 assert.equal((await call(2,'/courses/1/maintenance/lessons/1',{title:'导师维护'},'PUT')).status,200);
});
test('导师范围文案与受控学生预览；全局文案、他课、平台密钥和建管理员拒绝',async()=>{
 assert.equal((await call(2,'/student-copy/preview-data?courseId=1&lessonId=1')).status,200);assert.equal((await call(2,'/student-copy/preview-data?courseId=2')).status,404);const data=(await call(2,'/student-copy/preview-data')).data;assert.deepEqual(data.courses.map(c=>c.id),[1]);
 const id='workspace.map.objectives',body={expectedRevision:0,changes:[{id,text:'导师课程目标标签',enabled:true}]};assert.equal((await call(2,'/student-copy/manage/course%3A1/sync',body)).status,200);for(const scope of['global','course%3A2','lesson%3A2'])assert.equal((await call(2,'/student-copy/manage/'+scope+'/sync',body)).status,403);
 for(const[url,body]of[['/dashboard/ai/settings',{}],['/students/users',{role:'admin'}]])assert.equal((await call(2,url,body,'PUT')).status,403);
});
test('导师回放和资源真实上传及下载；主题、图片、签名播放撤销后即时拒绝',async()=>{
 const form=new FormData();form.append('file',new Blob([fs.readFileSync(path.join(__dirname,'../testFixtures/teaching-replay.webm'))],{type:'video/webm'}),'sample.webm');form.append('title','导师回放');form.append('description','真实上传验收');form.append('lesson_id','1');form.append('request_key',key());const r=await call(2,'/courses/1/replays',form);assert.equal(r.status,200);const replayId=r.data.id;const signed=await call(2,`/courses/replays/${replayId}/stream-url`);assert.equal(signed.status,200);
 const resource=new FormData();resource.append('file',new Blob(['# 合成资料'],{type:'text/markdown'}),'scope.md');resource.append('title','导师资料');resource.append('resource_type','other');const f=await call(2,'/courses/1/resources',resource);assert.equal(f.status,200);
 const imageForm=new FormData();imageForm.append('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8pAAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'scope.png');imageForm.append('purpose','desktop');imageForm.append('requestKey',key());const image=await call(2,'/courses/1/theme/images',imageForm);assert.equal(image.status,200);assert.equal((await call(2,'/courses/1/theme/images/'+image.data.id)).status,200);assert.equal((await call(3,'/courses/1/theme/images/'+image.data.id)).status,404);
 assert.equal((await call(2,'/courses/resources/'+f.data.id+'/download')).status,200);
 assert.equal((await grant(1,2,false,1)).status,200);assert.equal((await fetch(base+signed.data.url)).status,404);assert.equal((await call(2,'/courses/1/theme/images/'+image.data.id)).status,404);assert.equal((await call(2,'/courses/resources/'+f.data.id+'/download')).status,404);
assert.equal((await call(2,'/courses/1')).status,403);assert.equal((await call(2,`/courses/replays/${replayId}/stream-url`)).status,404);assert.equal((await call(2,'/courses/1/theme')).status,404);assert.equal((await call(2,'/student-copy/manage/course%3A1')).status,403);assert.deepEqual((await call(2,'/courses')).data.courses,[]);assert.ok(!require('../helpers/courseScope').managerRecipients(db,1).includes(2));
 db.prepare('UPDATE lessons SET instructor_id=2 WHERE id=1').run();db.prepare('UPDATE courses SET created_by=2 WHERE id=1').run();assert.equal((await call(2,'/courses/1/maintenance')).status,404);assert.equal((await grant(1,2,true,2)).status,200);
});
test('新建自有课程建立初始管理关系，可显式撤销且不改历史创建者',async()=>{
 const r=await call(2,'/courses',{title:'导师自建',grade_level:'junior',difficulty:'basic',request_key:key()});assert.equal(r.status,200);const id=r.data.id;assert.equal((await call(2,`/courses/${id}/maintenance`)).status,200);assert.equal((await grant(id,2,false,1)).status,200);assert.equal((await call(2,`/courses/${id}`)).status,403);assert.equal(db.prepare('SELECT created_by FROM courses WHERE id=?').get(id).created_by,2);
});
async function apply(actor,name){return call(actor,'/school-applications',{name,region:'合成地区',explanation:'隔离验收申请，不是正式学校',request_key:key()});}
async function approve(actor,id,extra={}){return call(actor,`/school-applications/${id}/review`,{decision:'approved',expectedRevision:1,request_key:key(),...extra});}
test('导师申请管理员待办通知、两管理员并发批准一次、学校与课程授权独立',async()=>{
 const a=await apply(2,'隔离学校甲');assert.equal(a.status,200);assert.ok((await call(1,'/dashboard/admin-pending')).data.applications.some(r=>r.url.includes('application='+a.data.id)));assert.ok(db.prepare("SELECT 1 FROM notifications WHERE dedupe_key=?").get('school.apply:'+a.data.id));
 const body={decision:'approved',expectedRevision:1,request_key:key()},results=await Promise.all([call(1,`/school-applications/${a.data.id}/review`,body),call(6,`/school-applications/${a.data.id}/review`,{...body,request_key:key()})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);schoolA=results.find(r=>r.status===200).data.schoolId;assert.equal(db.prepare("SELECT count(*) n FROM schools WHERE name='隔离学校甲'").get().n,1);
 const b=await apply(3,'隔离学校乙');schoolB=(await approve(1,b.data.id)).data.schoolId;assert.ok(schoolB);assert.equal((await call(2,`/school-applications/schools/${schoolB}/classes`)).status,403);assert.equal((await call(3,'/courses/1')).status,403);
});
test('未审核、驳回、停用均不可越过审批；重名只在显式确认后关联',async()=>{
 const a=await apply(2,'已有学校');assert.equal(a.status,200);const result=await approve(1,a.data.id);assert.equal(result.status,409);assert.equal((await call(2,'/school-applications/schools/1/classes',{name:'越权',grade:'七'})).status,403);
 assert.equal((await approve(1,a.data.id,{existingSchoolId:1,confirmExisting:true,reason:'经线下核对明确同校授权'})).status,200);assert.equal(db.prepare("SELECT count(*) n FROM schools WHERE name='已有学校'").get().n,1);
 const b=await apply(3,'待驳回学校');assert.equal((await call(1,`/school-applications/${b.data.id}/review`,{decision:'rejected',expectedRevision:1,request_key:key()})).status,400);assert.equal((await call(1,`/school-applications/${b.data.id}/review`,{decision:'rejected',reason:'信息不足',expectedRevision:1,request_key:key()})).status,200);
 const c=await apply(3,'停用申请学校');db.prepare('UPDATE users SET is_active=0 WHERE id=3').run();assert.equal((await approve(1,c.data.id)).status,403);db.prepare('UPDATE users SET is_active=1 WHERE id=3').run();
});
test('获准后幂等建班、并发建学生一次；角色注入、越校班级、全局账号管理拒绝',async()=>{
 const body={name:'合成七一班',grade:'七年级',request_key:key()},a=await call(2,`/school-applications/schools/${schoolA}/classes`,body);assert.equal(a.status,200);classA=a.data.id;assert.equal((await call(2,`/school-applications/schools/${schoolA}/classes`,body)).data.id,classA);
 const student={real_name:'验收同学',class_id:classA,request_key:key()};const results=await Promise.all(Array.from({length:5},()=>call(2,`/school-applications/schools/${schoolA}/students`,student)));assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.id)).size,1);createdStudent=results[0].data.id;const row=db.prepare('SELECT * FROM users WHERE id=?').get(createdStudent);assert.equal(row.role,'student');assert.equal(row.force_reset_password,1);assert.equal(row.mentor_id,2);
 for(const extra of[{role:'admin'},{mentor_id:3},{school_id:schoolB},{teacher_id:4}])assert.equal((await call(2,`/school-applications/schools/${schoolA}/students`,{...student,...extra,request_key:key()})).status,400);
 assert.equal((await call(2,`/school-applications/schools/${schoolA}/students`,{...student,class_id:1,request_key:key()})).status,400);assert.equal((await call(3,`/school-applications/schools/${schoolA}/students`,student)).status,403);assert.equal((await call(2,'/students/users',{role:'teacher'})).status,403);
});
test('初始凭据受控交付、强制改密、获配课程可读；不暴露他课档案或无关学生',async()=>{
 const c=await call(2,`/school-applications/schools/${schoolA}/students/${createdStudent}/credentials`);assert.equal(c.status,200);db.prepare("UPDATE users SET role='teacher' WHERE id=?").run(createdStudent);assert.equal((await call(2,`/school-applications/schools/${schoolA}/students/${createdStudent}/credentials`)).status,404);assert.ok(!(await call(2,`/school-applications/schools/${schoolA}/classes`)).data.students.some(s=>s.id===createdStudent));db.prepare("UPDATE users SET role='student' WHERE id=?").run(createdStudent);assert.equal((await call(3,`/school-applications/schools/${schoolA}/students/${createdStudent}/credentials`)).status,403);
 db.prepare('INSERT OR IGNORE INTO course_school_scopes(course_id,school_id,created_by) VALUES(1,?,1)').run(schoolA);
 const candidates=(await call(2,'/courses/1/enroll/candidates')).data.students;assert.ok(candidates.some(u=>u.id===createdStudent));assert.ok(!candidates.some(u=>u.id===5));assert.equal((await call(2,'/courses/1/enroll',{student_ids:[5]})).status,403);assert.equal((await call(2,'/courses/1/enroll',{student_ids:[createdStudent]})).status,200);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:c.data.username,password:c.data.temp_password})});const result=await login.json();tokens.new=result.token;assert.equal((await call('new','/courses')).status,403);
 const change=await call('new','/auth/change-password',{old_password:c.data.temp_password,new_password:'NewScope123!'});assert.equal(change.status,200);tokens.new=change.data.token;assert.equal((await call('new','/courses')).status,200);assert.equal((await call(2,`/school-applications/schools/${schoolA}/students/${createdStudent}/credentials`)).status,409);
});
test('撤销学校管理后旧会话建班建号拒绝、原学生教学与课程管理关系保留',async()=>{
 const m=db.prepare('SELECT * FROM school_managers WHERE school_id=? AND mentor_id=2').get(schoolA);const body={reason:'撤销学校职责',expectedRevision:m.revision,request_key:key()};assert.equal((await call(1,`/school-applications/schools/${schoolA}/managers/2/revoke`,body)).status,200);assert.equal((await call(1,`/school-applications/schools/${schoolA}/managers/2/revoke`,body)).status,200);
 assert.equal((await call(2,`/school-applications/schools/${schoolA}/classes`,{name:'撤销后',grade:'七',request_key:key()})).status,403);assert.equal((await call(2,`/school-applications/schools/${schoolA}/students`,{real_name:'拒绝',class_id:classA,request_key:key()})).status,403);assert.ok(db.prepare('SELECT 1 FROM users WHERE id=?').get(createdStudent));assert.equal((await call(2,'/courses/1/maintenance')).status,200);assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
});
