const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),jwt=require('jsonwebtoken');
let db,server,base,tokens,nextId=11000;
const key=()=>crypto.randomUUID();
async function call(id,url,body,method=body?'POST':'GET'){
 const r=await fetch(base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[id],'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json()};
}
before(async()=>{
 const {prepareMentorFixture}=await import('../../tests/mentor-fixture.mjs');const f=prepareMentorFixture(0,0);Object.assign(process.env,f.env);
 const app=require('../app');db=require('../config/database');tokens={};
 for(const id of[10001,10002,10003,10004,10005,10007]){const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);tokens[id]=jwt.sign({id:u.id,role:u.role,auth_version:u.auth_version,school_id:u.school_id},f.env.JWT_SECRET);}
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));db?.close();});
const grant=p=>db.prepare('SELECT * FROM teacher_observation_grants WHERE teacher_id=? AND student_id=? AND course_id=?').get(p.teacherId,p.studentId,p.courseId);
const events=p=>db.prepare('SELECT * FROM teacher_observation_events WHERE teacher_id=? AND student_id=? AND course_id=? ORDER BY id').all(p.teacherId,p.studentId,p.courseId);
async function pair(courseId=91001,creator=10002){
 const teacherId=++nextId,studentId=++nextId;
 for(const[id,role]of[[teacherId,'teacher'],[studentId,'student']])db.prepare("INSERT INTO users(id,username,password_hash,real_name,role,school_id,class_id) SELECT ?,?,password_hash,?,?,7001,7001 FROM users WHERE id=10005").run(id,'revocation_'+id,'合成撤销测试'+id,role);
 db.prepare("INSERT INTO school_created_teachers(teacher_id,actor_id,school_id,request_key,fingerprint) VALUES(?,?,7001,?,'synthetic')").run(teacherId,creator,key());
 db.prepare("INSERT INTO school_created_accounts(student_id,actor_id,school_id,class_id,request_key,fingerprint) VALUES(?,?,7001,7001,?,'synthetic')").run(studentId,creator,key());
 const e=db.prepare('INSERT INTO enrollments(student_id,course_id,enrolled_by) VALUES(?,?,?)').run(studentId,courseId,creator);
 const p={teacherId,studentId,courseId};const created=await call(creator,'/mentor-workspace/schools/7001/observers',{...p,active:true,expectedRevision:0,reason:'合成：建立真实观察授权',request_key:key()});assert.equal(created.status,200,JSON.stringify(created));return {...p,enrollmentId:Number(e.lastInsertRowid)};
}
async function remove(p){const r=await call(10001,`/courses/${p.courseId}/enrollments/${p.enrollmentId}`,{reason:'合成：尚无历史，正常移除报名',request_key:key()},'DELETE');assert.equal(r.status,200,JSON.stringify(r));}
const revokeBody=p=>({teacherId:p.teacherId,studentId:p.studentId,courseId:p.courseId,active:false,expectedRevision:grant(p).revision,reason:'合成：清理既有授权，保留历史',request_key:key()});
test('真实HTTP：正常移除报名后撤销既有观察授权，保留历史后允许教师迁校',async()=>{
 const e=db.prepare('SELECT * FROM enrollments WHERE student_id=10004 AND course_id=91001').get(),g=db.prepare('SELECT * FROM teacher_observation_grants WHERE teacher_id=10005 AND student_id=10004 AND course_id=91001').get();
 const removed=await call(10001,`/courses/91001/enrollments/${e.id}`,{reason:'合成验收：未学习的报名正常移除',request_key:key()},'DELETE');assert.equal(removed.status,200,JSON.stringify(removed));
 assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'removed');
 const revoked=await call(10001,'/mentor-workspace/schools/7001/observers',{teacherId:g.teacher_id,studentId:g.student_id,courseId:g.course_id,active:false,expectedRevision:g.revision,reason:'合成验收：明确撤销既有授权以交接迁校',request_key:key()});
 assert.equal(revoked.status,200,JSON.stringify(revoked));assert.equal(db.prepare('SELECT active FROM teacher_observation_grants WHERE teacher_id=? AND student_id=? AND course_id=?').get(g.teacher_id,g.student_id,g.course_id).active,0);
 const teacher=db.prepare('SELECT * FROM users WHERE id=10005').get(),moved=await call(10001,'/students/users/10005',{real_name:teacher.real_name,role:'teacher',school_id:7002,class_id:7002},'PUT');assert.equal(moved.status,200,JSON.stringify(moved));
 assert.equal(grant({teacherId:10005,studentId:10004,courseId:91001}).revision,g.revision+1);
 for(const k of['source','actor_id','school_id'])assert.equal(grant({teacherId:10005,studentId:10004,courseId:91001})[k],g[k]);
 const audit=events({teacherId:10005,studentId:10004,courseId:91001});assert.equal(audit.length,1);assert.equal(audit[0].actor_id,10001);assert.equal(audit[0].active,0);assert.match(audit[0].reason,/交接迁校/);
 assert.equal(db.prepare('SELECT count(*) n FROM enrollments WHERE student_id=10004 AND course_id=91001').get().n,1);
 assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'removed');
});
test('撤销严格定位既有三元记录和学校，不能创建空授权或跨学校清理',async()=>{
 const count=db.prepare('SELECT count(*) n FROM teacher_observation_grants').get().n;
 for(const [school,student]of[[7001,10003],[7002,10004]]){
  const r=await call(10001,`/mentor-workspace/schools/${school}/observers`,{teacherId:10005,studentId:student,courseId:91001,active:false,expectedRevision:0,reason:'不存在的关系不得写入',request_key:key()});assert.equal(r.status,404,JSON.stringify(r));
 }
 assert.equal(db.prepare('SELECT count(*) n FROM teacher_observation_grants').get().n,count);
});
test('旧修订409；并发同请求和已撤销新请求不重复审计、不覆盖来源、不新增授权',async()=>{
 const p=await pair();await remove(p);const original=grant(p),body=revokeBody(p),count=db.prepare('SELECT count(*) n FROM teacher_observation_grants').get().n;
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',{...body,expectedRevision:0})).status,409);assert.equal(events(p).length,1);
 const replies=await Promise.all(Array.from({length:5},()=>call(10001,'/mentor-workspace/schools/7001/observers',body)));for(const r of replies){assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.revision,original.revision+1);}
 assert.equal(events(p).length,2);assert.equal(grant(p).active,0);for(const k of['source','actor_id','school_id'])assert.equal(grant(p)[k],original[k]);
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',{...body,request_key:key()})).status,409);
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',{...revokeBody(p),reason:'再次明确核对已撤销'})).status,200);assert.equal(events(p).length,2);assert.equal(grant(p).revision,original.revision+1);
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',{...body,reason:'同请求不能换内容'})).status,409);assert.equal(db.prepare('SELECT count(*) n FROM teacher_observation_grants').get().n,count);
});
test('当前授权mentor可撤销自己的既有记录；无授权mentor或他人课程拒绝',async()=>{
 const p=await pair();await remove(p);const body=revokeBody(p);
 for(const actor of[10003,10007,10004])assert.equal((await call(actor,'/mentor-workspace/schools/7001/observers',body)).status,403);
 assert.equal(grant(p).active,1);assert.equal(events(p).length,1);
 assert.equal((await call(10002,'/mentor-workspace/schools/7001/observers',body)).status,200);assert.equal(events(p).length,2);
 const other=await pair(91002,10003);await remove(other);assert.equal((await call(10002,'/mentor-workspace/schools/7001/observers',revokeBody(other))).status,403);assert.equal(grant(other).active,1);
});
test('撤销不放宽新增及重新启用：无有效报名仍拒绝，恢复组织关系不复活授权',async()=>{
 const p=await pair();await remove(p);assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',revokeBody(p))).status,200);
 const active={...revokeBody(p),active:true};assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',active)).status,400);assert.equal((await call(10002,'/mentor-workspace/schools/7001/observers',{...active,request_key:key()})).status,400);
 const newTeacher=++nextId;db.prepare("INSERT INTO users(id,username,password_hash,real_name,role,school_id,class_id) SELECT ?,?,password_hash,'合成未授权教师','teacher',7001,7001 FROM users WHERE id=10005").run(newTeacher,'revocation_'+newTeacher);
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',{...active,teacherId:newTeacher,expectedRevision:0,request_key:key()})).status,400);
 assert.equal(grant({...p,teacherId:newTeacher}),undefined);assert.equal(grant(p).active,0);assert.equal(require('../services/teacherObservations').can({id:p.teacherId},p.studentId,p.courseId),false);
});
test('管理员清理不要求目标仍可新增授权，导师的当前组织与课程管理权仍必须有效',async()=>{
 const p=await pair();await remove(p);const body=revokeBody(p);
 const cm=db.prepare('SELECT * FROM course_managers WHERE course_id=91001 AND mentor_id=10002').get();db.prepare('UPDATE course_managers SET active=0 WHERE course_id=91001 AND mentor_id=10002').run();
 try{assert.equal((await call(10002,'/mentor-workspace/schools/7001/observers',body)).status,403);}finally{db.prepare('UPDATE course_managers SET active=? WHERE course_id=91001 AND mentor_id=10002').run(cm.active);}
 db.prepare('UPDATE users SET is_active=0,school_id=7002,class_id=7002 WHERE id=?').run(p.studentId);db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(p.teacherId);
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',body)).status,200);assert.equal(grant(p).active,0);assert.equal(events(p).length,2);
});
test('审计写入失败会回滚撤销和请求记录，原请求可重试一次',async()=>{
 const p=await pair();await remove(p);const body=revokeBody(p),original=grant(p);
 db.exec(`CREATE TRIGGER fail_observer_audit BEFORE INSERT ON teacher_observation_events WHEN NEW.teacher_id=${p.teacherId} AND NEW.active=0 BEGIN SELECT RAISE(ABORT,'isolated audit failure'); END`);
 try{assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',body)).status,500);assert.deepEqual(grant(p),original);assert.equal(events(p).length,1);}finally{db.exec('DROP TRIGGER fail_observer_audit');}
 assert.equal((await call(10001,'/mentor-workspace/schools/7001/observers',body)).status,200);assert.equal(events(p).length,2);
});
