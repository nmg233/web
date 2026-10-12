const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-space-'));
process.env.DB_PATH=path.join(tmp,'test.db');process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='test';process.env.UPLOAD_PATH=path.join(tmp,'uploads');
const app=require('../app'),db=require('../config/database');
let server,url,token;
const request=async(p,method='GET',body)=>fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
before(async()=>{
 const hash=require('bcryptjs').hashSync('test123',4);
 db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'mentor',?,'导师','academic_mentor'),(2,'student',?,'测试学生','student'),(3,'other',?,'另一学生','student')").run(hash,hash,hash);
 for(const id of [1,2]){
 db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(?,?,'junior','basic','published',1)").run(id,'测试课程'+id);
 db.prepare("INSERT INTO enrollments(id,student_id,course_id,status) VALUES(?,2,?,'active')").run(id,id);
 db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run(id,id,'测试课时'+id);
 db.prepare("INSERT INTO tasks(id,lesson_id,title) VALUES(?,?,?)").run(id,id,'测试任务'+id);
 db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description) VALUES(?,2,?,?,?,'测试成果')").run(id,id,id,'测试作品'+id);
 db.prepare("INSERT INTO glider_simulations(id,student_id,course_id,status) VALUES(?,2,?,'success')").run(id,id);
 db.prepare("INSERT INTO reflections(student_id,enrollment_id,lesson_id,difficulty) VALUES(2,?,?,?)").run(id,id,'测试反思'+id);
 }
 db.prepare("INSERT INTO glider_simulations(id,student_id,status) VALUES(3,2,'success')").run();
 await new Promise(r=>server=app.listen(0,r));url='http://127.0.0.1:'+server.address().port;
 const result=await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'student',password:'test123'})}).then(r=>r.json());token=result.token;assert.ok(token);
});
after(async()=>{if(server)await new Promise(r=>server.close(r));db.close();});
test('课程列表、作品、任务、档案与试飞范围由服务端限定',async()=>{
 for(const [p,key] of [['courses','courses'],['works','works'],['tasks','tasks'],['glider/simulations','items']]){const r=await request('/course-spaces/1/'+p);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d[key].map(x=>x.id),[1]);}
 const a=await request('/course-spaces/1/archives/generate').then(r=>r.json());assert.deepEqual(a.works.map(x=>x.id),[1]);assert.deepEqual(a.reflections.map(x=>x.enrollment_id),[1]);
});
test('两个课程均获授权也不能在 A 地址读写 B 对象',async()=>{
 for(const p of ['works/2','tasks/2','learning/lessons/2','glider/simulations/2','glider/simulations/3','courses/2']) assert.equal((await request('/course-spaces/1/'+p)).status,404,p);
 assert.equal((await request('/course-spaces/1/glider/simulate','POST',{course_id:2})).status,404);
 assert.equal((await request('/course-spaces/1/archives/reflection','POST',{enrollment_id:2,lesson_id:2,difficulty:'不得写入'})).status,404);
 const before=db.prepare('SELECT count(*) n FROM works').get().n;
 assert.equal((await request('/course-spaces/1/works','POST',{task_id:2,enrollment_id:2,title:'不得写入',description:'测试'})).status,404);
 assert.equal(db.prepare('SELECT count(*) n FROM works').get().n,before);
});
test('旧 API 保留；课程撤回同时禁止旧对象读取，重新发布恢复',async()=>{
 assert.equal((await request('/works/1')).status,200);
 assert.equal((await request('/glider/simulations/3')).status,200);
 db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();
 for(const p of ['/course-spaces/1/works','/works/1','/glider/simulations/1']) assert.ok([403,404].includes((await request(p)).status),p);
 db.prepare("UPDATE courses SET status='published' WHERE id=1").run();assert.equal((await request('/course-spaces/1/works/1')).status,200);
});

test('multipart 上传不能绕过课程范围，拒绝后无记录与孤立附件', async()=>{
 const before=db.prepare('SELECT count(*) n FROM works').get().n;
 const form=new FormData();
 form.set('task_id','2');form.set('enrollment_id','2');form.set('title','跨课程上传必须拒绝');
 form.set('description','隔离测试');form.set('file',new Blob(['%PDF-1.4\n% synthetic fixture\n%%EOF'],{type:'application/pdf'}),'fixture.pdf');
 const result=await fetch(url+'/api/course-spaces/1/works',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 assert.equal(result.status,404);assert.equal(db.prepare('SELECT count(*) n FROM works').get().n,before);
 const files=fs.existsSync(process.env.UPLOAD_PATH)?fs.readdirSync(process.env.UPLOAD_PATH,{recursive:true}).filter(p=>fs.statSync(path.join(process.env.UPLOAD_PATH,p)).isFile()):[];
 assert.deepEqual(files,[]);
 assert.equal((await request('/course-spaces/1/works?course_id=2')).status,404);
});
