const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-account-loop-'));
Object.assign(process.env, { DB_PATH:path.join(dir,'test.db'), UPLOAD_PATH:path.join(dir,'uploads'),
  FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'), JWT_SECRET:'account-loop-test-secret', NODE_ENV:'test',
  LOGIN_RATE_LIMIT_IP:'2000', LOGIN_RATE_LIMIT_USER:'1000', ACCOUNT_LOCK_THRESHOLD:'1000' });
fs.writeFileSync(process.env.DB_PATH,'');
const app = require('../app');
const db = require('../config/database');
const imports = require('../services/accountImportService');
const { parseInput } = require('../services/accountImportParser');
const { ensureSchoolCode } = require('../helpers/username');
const { generateTemporaryPassword } = require('../services/tempPasswordService');
let server, url, token, adminId, otherToken;
async function api(route, body, auth=token, method=body===undefined?'GET':'POST') {
  const response=await fetch(`${url}/api${route}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
const login=(username,password)=>api('/auth/login',{username,password},null);
const create=(role='student',name='张三',extra={})=>api('/students/users',{role,real_name:name,school_id:1,class_id:1,...extra});
const batch=(rows,extra={})=>api('/students/import?async=1',{data:rows,...extra});
async function done(id) { await imports.wait(id); return (await api(`/students/import-batches/${id}`)).body; }
before(async()=>{
  db.exec("INSERT INTO schools(id,name) VALUES(1,'北京小学'),(2,'北京小校'),(3,'重名学校'),(4,'重名学校'); INSERT INTO classes(id,name,school_id,grade) VALUES(1,'一班',1,'一年级'),(2,'一班',1,'二年级'),(3,'一班',2,'一年级');");
  const insert=db.prepare("INSERT INTO users(username,real_name,role,password_hash) VALUES(?,?,'admin',?)");
  adminId=Number(insert.run('loop-admin','管理员',bcrypt.hashSync('AdminTest!123',4)).lastInsertRowid);
  insert.run('other-admin','另一管理员',bcrypt.hashSync('AdminTest!123',4));
  server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); url=`http://127.0.0.1:${server.address().port}`;
  token=(await login('loop-admin','AdminTest!123')).body.token;
  otherToken=(await login('other-admin','AdminTest!123')).body.token;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('姓名拼音、角色、学校代码、平台导师和各角色独立流水正确',async()=>{
  assert.equal(generateTemporaryPassword('王小明'),'wangxiaoming@123');
  assert.equal(generateTemporaryPassword('吴'),'wu@123');
  assert.equal(generateTemporaryPassword('曾小贤'),'zengxiaoxian@123');
  assert.equal(generateTemporaryPassword('单小明'),'shanxiaoming@123');
  assert.equal(generateTemporaryPassword('万俟明'),'moqiming@123');
  assert.equal(generateTemporaryPassword('吕乐'),'lvle@123');
  assert.equal(generateTemporaryPassword('系统管理员'),'xitongguanliyuan@123');
  assert.throws(()=>generateTemporaryPassword('a'.repeat(69)),/72/);
  const student=await create(), teacher=await create('teacher'), mentor=await create('academic_mentor');
  assert.equal(student.body.username,'BJXX_student_zhangsan_1');
  assert.equal(teacher.body.username,'BJXX_teacher_zhangsan_1');
  assert.equal(mentor.body.username,'BUAA_mentor_zhangsan_1');
  assert.equal(mentor.body.school_id,null); assert.equal(mentor.body.class_id,null);
  const collision=await create('student','张三',{school_id:2,class_id:3});
  assert.equal(collision.body.username,'BJXX2_student_zhangsan_1');
  assert.equal(ensureSchoolCode(db,1),'BJXX');
  const longSchool=Number(db.prepare('INSERT INTO schools(name) VALUES(?)').run('A'.repeat(65)).lastInsertRowid);
  assert.throws(()=>ensureSchoolCode(db,longSchool),/不会自动截断/);
  for(const route of ['/dashboard/schools','/students/schools'])assert.equal((await api(route,{name:'A'.repeat(65)})).status,400);
});
test('删除不退号、固定账号计数、事务失败不消耗流水、并发创建不重号',async()=>{
  const a=await create(); assert.equal(a.status,200);
  assert.equal((await api(`/students/users/${a.body.id}`,{},token,'DELETE')).status,200);
  const b=await create(); assert.equal(Number(b.body.username.split('_').at(-1)),Number(a.body.username.split('_').at(-1))+1);
  const prior=db.prepare("SELECT last_value FROM account_sequences WHERE scope='school:1' AND role='student'").get().last_value;
  assert.equal((await create('student','张三',{username:'fixed-student'})).status,200);
  assert.equal(db.prepare("SELECT last_value FROM account_sequences WHERE scope='school:1' AND role='student'").get().last_value,prior+1);
  const { createAccount }=require('../services/accountCreationService');
  await assert.rejects(createAccount({real_name:'张三',school_id:1,class_id:1},{onCreated:()=>{throw new Error('rollback');}}),/rollback/);
  assert.equal(db.prepare("SELECT last_value FROM account_sequences WHERE scope='school:1' AND role='student'").get().last_value,prior+1);
  const rows=await Promise.all(Array.from({length:8},()=>create()));
  assert.ok(rows.every(r=>r.status===200)); assert.equal(new Set(rows.map(r=>r.body.username)).size,8);
});
test('删除学校也不复用已分配缩写',()=>{
  const id=Number(db.prepare("INSERT INTO schools(name) VALUES('空白学校')").run().lastInsertRowid);
  const code=ensureSchoolCode(db,id); db.prepare('DELETE FROM schools WHERE id=?').run(id);
  const next=Number(db.prepare("INSERT INTO schools(name) VALUES('空白学校')").run().lastInsertRowid);
  assert.notEqual(ensureSchoolCode(db,next),code);
});
test('精确表头、CSV 多行引号、编码与空名单校验，不误识别负责导师账号',()=>{
  const rows=parseInput({file:{name:'a.csv',buffer:Buffer.from('\uFEFF姓名,身份,负责导师账号,备注\r\n张三,执行导师,wrong-account,"第一行,内容\n第二行"')}});
  assert.equal(rows[0].username,'');assert.equal(rows[0].profile,'第一行,内容\n第二行');
  assert.throws(()=>parseInput({data:[]}),/为空/);
  assert.throws(()=>parseInput({data:[{姓名:'张三',真实姓名:'张三'}]}),/歧义/);
  assert.throws(()=>parseInput({file:{name:'a.csv',buffer:Buffer.from([0xff,0xfe])}}),/UTF-8/);
  assert.throws(()=>parseInput({file:{name:'a.csv',buffer:Buffer.from('姓名,备注\n张三,"未闭合')}}),/未闭合/);
  assert.throws(()=>parseInput({data:Array.from({length:1001},()=>({姓名:'张三'}))}),/1000/);
  const XLSX=require('xlsx'),book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['姓名','身份'],['张三','mentor']]),'名单');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[' ']]),'空白');
  assert.equal(parseInput({file:{name:'a.xlsx',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})}}).length,1);
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['姓名'],['李四']]),'遗漏名单');
  assert.throws(()=>parseInput({file:{name:'a.xlsx',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})}}),/非空工作表/);
});
test('未知角色拒绝，导师别名正确；学校/班级重名不静默选第一个',async()=>{
  const r=await batch([
    {姓名:'张三',身份:'未知角色',学校:'北京小学',班级:'一班'},
    {姓名:'张三',身份:'student',学校:'北京小学',班级:'一班'},
    {姓名:'张三',身份:'student',学校:'重名学校',班级:'一班'},
    {姓名:'张三',身份:'student',学校:'北京小学',班级:'一班',年级:'二年级'},
    ...['执行导师','导师','学术导师','mentor'].map(身份=>({姓名:'张三',身份})),
  ]);assert.equal(r.status,202);const result=await done(r.body.id);
  assert.equal(result.imported,5);assert.equal(result.failed,3);
  assert.match(result.errors[0],/不支持/);assert.match(result.errors[1],/班级名称重名/);assert.match(result.errors[2],/学校名称重名/);
  assert.equal(result.accounts[0].class_id,2);assert.ok(result.accounts.slice(1).every(a=>a.role==='academic_mentor'&&a.school_id===null));
});
test('25 条失败全部保留，不截断；零成功不能确认交付',async()=>{
  const r=await batch(Array.from({length:25},(_,i)=>({姓名:`失败${i}`,身份:'unknown'})));
  const result=await done(r.body.id);assert.equal(result.failed,25);assert.equal(result.imported,0);assert.equal(result.errors.length,25);assert.equal(result.row_results.length,25);
  assert.equal((await api(`/students/import-batches/${r.body.id}/acknowledge`,{})).status,400);
});
test('相同名单/请求幂等、标识冲突拒绝、主动另建需要明确新标识',async()=>{
  const rows=[{姓名:'重复名单',身份:'mentor'}], key='idempotent-key-123';
  const a=await batch(rows,{request_key:key});await done(a.body.id);
  const b=await batch(rows,{request_key:key});assert.equal(b.body.id,a.body.id);
  const c=await batch(rows,{request_key:'idempotent-key-456'});assert.equal(c.body.id,a.body.id);
  assert.equal((await batch([{姓名:'另一名单',身份:'mentor'}],{request_key:key})).status,409);
  assert.equal((await batch(rows,{confirm_new_batch:true})).status,400);
  const d=await batch(rows,{request_key:'idempotent-key-789',confirm_new_batch:true});assert.notEqual(d.body.id,a.body.id);await done(d.body.id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE real_name='重复名单'").get().n,2);
});
test('刷新恢复凭据、按创建者隔离、首次改密后历史不返回失效初始密码',async()=>{
  const r=await batch([{姓名:'交付学生',身份:'student',school_id:1,class_id:1}]);const result=await done(r.body.id);
  assert.equal(result.accounts[0].temp_password,undefined);
  assert.equal((await api(`/students/import-batches/${r.body.id}`,undefined,otherToken)).status,404);
  assert.equal((await api(`/students/import-batches/${r.body.id}/credentials`,undefined,otherToken)).status,404);
  const creds=(await api(`/students/import-batches/${r.body.id}/credentials`)).body.accounts[0];assert.equal(creds.temp_password,'jiaofuxuesheng@123');
  const logged=await login(creds.username,creds.temp_password);assert.equal(logged.status,200);
  assert.equal((await api('/courses',undefined,logged.body.token)).status,403);
  const changed=await api('/auth/change-password',{old_password:creds.temp_password,new_password:'NewStudent!123'},logged.body.token);assert.equal(changed.status,200);
  assert.equal((await api('/courses',undefined,changed.body.token)).status,200);
  assert.equal((await login(creds.username,creds.temp_password)).status,401);
  assert.equal((await api(`/students/import-batches/${r.body.id}/credentials`)).body.accounts[0].temp_password,undefined);
  assert.equal((await api(`/students/import-batches/${r.body.id}/acknowledge`,{})).status,200);
  assert.ok((await api(`/students/import-batches/${r.body.id}`)).body.delivered_at);
  const raw=db.prepare('SELECT input_json,result_json FROM account_import_batches WHERE id=?').get(r.body.id);
  assert.ok(!JSON.stringify(raw).includes(creds.temp_password));
});
test('导师停用/恢复后旧 token 和 refresh 不能复活，资料可编辑但账号不改变',async()=>{
  const mentor=(await create('academic_mentor','闭环导师')).body;
  const first=await login(mentor.username,mentor.temp_password);
  const changed=await api('/auth/change-password',{old_password:mentor.temp_password,new_password:'MentorNew!123'},first.body.token);
  assert.equal(changed.status,200);assert.equal((await api('/courses',undefined,changed.body.token)).status,200);
  const edit=await api(`/students/users/${mentor.id}`,{real_name:'导师新姓名',role:'academic_mentor'},token,'PUT');assert.equal(edit.status,200);
  assert.equal(db.prepare('SELECT username FROM users WHERE id=?').get(mentor.id).username,mentor.username);
  for(const action of ['disable','restore']) {
    assert.equal((await api(`/students/${mentor.id}/status`,{action,reason:'闭环验收'})).status,200);
    assert.equal((await api('/courses',undefined,changed.body.token)).status,401);
    assert.equal((await api('/auth/refresh',{refresh_token:changed.body.refresh_token},null)).status,401);
  }
  assert.equal((await login(mentor.username,'MentorNew!123')).status,200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM account_status_events WHERE user_id=?').get(mentor.id).n,2);
  const reset=await api('/auth/admin/reset-password',{user_id:mentor.id});assert.equal(reset.status,200);assert.equal(reset.body.temp_password,'daoshixinxingming@123');
  assert.equal((await login(mentor.username,reset.body.temp_password)).status,200);
  assert.equal((await login(mentor.username,'MentorNew!123')).status,401);
});
test('批次中途权限撤销时暂停，恢复只处理剩余行；创建和进度同事务',async()=>{
  const { hashPassword }=require('../services/passwordHashService');await hashPassword('warm-up');
  const r=await batch([{姓名:'恢复甲',身份:'mentor'},{姓名:'恢复乙',身份:'mentor'}]);
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(adminId);
  await imports.wait(r.body.id);
  assert.equal(db.prepare('SELECT status FROM account_import_batches WHERE id=?').get(r.body.id).status,'failed');
  db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(adminId);
  imports.resume(r.body.id,adminId);await imports.wait(r.body.id);
  const result=imports.view(r.body.id,adminId);assert.equal(result.status,'completed');assert.equal(result.imported,2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE real_name IN ('恢复甲','恢复乙')").get().n,2);
});
test('管理员在后台批次执行中改密会暂停，重新认证后明确恢复不重复建号',async()=>{
  const r=await batch(Array.from({length:4},(_,i)=>({姓名:`改密中批次${i}`,身份:'mentor'})));
  const change=await api('/auth/change-password',{old_password:'AdminTest!123',new_password:'ChangedAdmin!123'});assert.equal(change.status,200);token=change.body.token;
  await imports.wait(r.body.id);
  assert.equal(imports.view(r.body.id,adminId).status,'failed');
  assert.equal((await api(`/students/import-batches/${r.body.id}/resume`,{})).status,200);
  const result=await done(r.body.id);assert.equal(result.imported,4);
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE real_name LIKE '改密中批次%'").get().n,4);
});
test('停用审计事务失败完整回滚；其他管理员重置也适用姓名密码规则',async()=>{
  const teacher=(await create('teacher','事务教师')).body;
  const before=db.prepare('SELECT auth_version,is_active FROM users WHERE id=?').get(teacher.id);
  db.exec("CREATE TRIGGER fail_account_audit BEFORE INSERT ON account_status_events BEGIN SELECT RAISE(ABORT,'audit failure'); END;");
  try {assert.equal((await api(`/students/${teacher.id}/status`,{action:'disable',reason:'回滚验收'})).status,500);assert.deepEqual(db.prepare('SELECT auth_version,is_active FROM users WHERE id=?').get(teacher.id),before);}
  finally {db.exec('DROP TRIGGER fail_account_audit');}
  const other=db.prepare("SELECT id FROM users WHERE username='other-admin'").get();
  const reset=await api('/auth/admin/reset-password',{user_id:other.id});assert.equal(reset.status,200);assert.equal(reset.body.temp_password,'lingyiguanliyuan@123');
  assert.equal((await login('other-admin',reset.body.temp_password)).status,200);
  assert.equal((await api('/courses',undefined,otherToken)).status,401);
});
test('新学生/教师/导师改密后配置职责、建课、选课与访问课程完整闭环',async()=>{
  const student=(await create('student','业务学生')).body, teacher=(await create('teacher','业务教师')).body, mentor=(await create('academic_mentor','业务导师')).body;
  const sessions={};
  for(const [name,account] of Object.entries({student,teacher,mentor})) {
    const logged=await login(account.username,account.temp_password);
    const changed=await api('/auth/change-password',{old_password:account.temp_password,new_password:'BusinessNew!123'},logged.body.token);
    assert.equal(changed.status,200);sessions[name]=changed.body.token;
  }
  assert.equal((await api(`/students/${student.id}/assign`,{school_id:1,class_id:1,teacher_id:teacher.id,mentor_id:mentor.id},token,'PUT')).status,200);
  const course=await api('/courses',{title:'账号闭环课程',grade_level:'primary',difficulty:'basic'},sessions.mentor);assert.equal(course.status,200);
  assert.equal((await api(`/courses/${course.body.id}/lessons`,{title:'第一课',instructor_id:mentor.id},sessions.mentor)).status,200);
  assert.equal((await api(`/courses/${course.body.id}`,{status:'published'},sessions.mentor,'PUT')).status,200);
  assert.equal((await api(`/courses/${course.body.id}/enroll`,{student_ids:[student.id]},sessions.mentor)).status,200);
  assert.equal((await api(`/courses/${course.body.id}`,undefined,sessions.student)).status,200);
  assert.equal((await api(`/students/${student.id}`,undefined,sessions.teacher)).status,200);
  assert.equal((await api(`/students/${student.id}`,undefined,sessions.mentor)).status,200);
  const replay=Number(db.prepare('INSERT INTO course_replays(course_id,title,video_path,created_by) VALUES(?,?,?,?)').run(course.body.id,'测试播放',path.join(dir,'uploads','fake.mp4'),mentor.id).lastInsertRowid);
  const signed=await api(`/courses/replays/${replay}/stream-url`,undefined,sessions.mentor);assert.equal(signed.status,200);
  assert.equal((await api('/students/import-batches',undefined,sessions.mentor)).status,403);
  assert.equal((await api('/students/users',{role:'student',real_name:'越权',school_id:1,class_id:1},sessions.teacher)).status,403);
  assert.equal((await api(`/students/users/${mentor.id}`,{},token,'DELETE')).status,400);
  assert.equal((await api(`/students/users/${mentor.id}`,{real_name:'业务导师',role:'student',school_id:1,class_id:1},token,'PUT')).status,409);
  assert.equal((await api(`/students/${mentor.id}/status`,{action:'disable',reason:'测试职责保护'})).status,200);
  assert.equal((await api(signed.body.url.replace(/^\/api/,''),undefined,null)).status,401);
  assert.equal((await api(`/students/${student.id}/assign`,{school_id:1,class_id:1,teacher_id:teacher.id,mentor_id:mentor.id},token,'PUT')).status,400);
  assert.equal((await api(`/students/${mentor.id}/status`,{action:'restore',reason:'测试恢复'})).status,200);
  assert.equal((await api(signed.body.url.replace(/^\/api/,''),undefined,null)).status,401);
  assert.ok(db.prepare('SELECT id FROM courses WHERE id=?').get(course.body.id));
});
test('教师通用编辑停用与恢复同样撤销会话，非法姓名不可写入',async()=>{
  const teacher=(await create('teacher','状态教师')).body;
  const logged=await login(teacher.username,teacher.temp_password);
  const changed=await api('/auth/change-password',{old_password:teacher.temp_password,new_password:'TeacherNew!123'},logged.body.token);
  for(const is_active of [false,true]) {
    assert.equal((await api(`/students/users/${teacher.id}`,{real_name:'状态教师',role:'teacher',school_id:1,class_id:1,is_active},token,'PUT')).status,200);
    assert.equal((await api('/courses',undefined,changed.body.token)).status,401);
    assert.equal((await api('/auth/refresh',{refresh_token:changed.body.refresh_token},null)).status,401);
  }
  assert.equal((await api(`/students/users/${teacher.id}`,{real_name:'  ',role:'teacher',school_id:1,class_id:1},token,'PUT')).status,400);
  assert.equal((await login(teacher.username,'TeacherNew!123')).status,200);
});
test('失败名单导出含完整标识、年级与多行字段，修正后可重新导入',async()=>{
  const {importFailuresToCSV}=await import('../../frontend/src/utils/accountExport.js');
  const input={username:'retry-student',real_name:'修正学生',role:'oops',school_id:'1',class_id:'2',grade:'二年级',profile:'引号"内容\n下一行'};
  const csv=importFailuresToCSV([{row:1,error:'非法身份',input}]);
  const rows=parseInput({file:{name:'failed.csv',buffer:Buffer.from(csv)}});
  assert.equal(rows[0].grade,input.grade);assert.equal(rows[0].profile,input.profile);assert.equal(rows[0].class_id,'2');
  rows[0].role='student';const r=await batch(rows);const result=await done(r.body.id);assert.equal(result.imported,1);assert.equal(result.accounts[0].username,input.username);
});
test('改名后未改密批次仍按创建时姓名恢复，重置/停用后不交付旧凭据',async()=>{
  const r=await batch([{姓名:'原始姓名',身份:'mentor'}]);const result=await done(r.body.id);const a=result.accounts[0];
  assert.equal((await api(`/students/users/${a.id}`,{real_name:'改名之后',role:'academic_mentor'},token,'PUT')).status,200);
  const recovered=(await api(`/students/import-batches/${r.body.id}/credentials`)).body.accounts[0];
  assert.equal(recovered.temp_password,'yuanshixingming@123');assert.equal((await login(a.username,recovered.temp_password)).status,200);
  const reset=await api('/auth/admin/reset-password',{user_id:a.id});assert.equal(reset.status,200);assert.equal(reset.body.temp_password,'gaimingzhihou@123');
  assert.equal((await api(`/students/import-batches/${r.body.id}/credentials`)).body.accounts[0].temp_password,undefined);
  assert.equal((await login(a.username,reset.body.temp_password)).status,200);
  assert.equal((await api(`/students/${a.id}/status`,{action:'disable',reason:'凭据失效验收'})).status,200);
  assert.equal((await api(`/students/import-batches/${r.body.id}/credentials`)).body.accounts[0].credentials_available,false);
});
test('历史分页不丢失第 31 个之前的批次',async()=>{
  for(let i=0;i<33;i++)db.prepare("INSERT INTO account_import_batches(id,actor_id,fingerprint,request_key,input_json,status) VALUES(?,?,?,?,?,'completed')").run(`history-${i}`,adminId,`fp-${i}`,`key-${i}`,'[]');
  const a=await api('/students/import-batches'),b=await api('/students/import-batches?page=2');
  assert.equal(a.body.batches.length,30);assert.ok(b.body.batches.length>0);assert.ok(a.body.total>30);
  assert.equal(new Set([...a.body.batches,...b.body.batches].map(x=>x.id)).size,a.body.batches.length+b.body.batches.length);
});
test('120 人异步建号不阻塞查询，响应无需等待哈希完成，结果数量准确',async()=>{
  const beforeCount=db.prepare('SELECT count(*) AS n FROM users').get().n;
  const start=performance.now();const r=await batch(Array.from({length:120},(_,i)=>({姓名:`批量导师${i}`,身份:'mentor'})));
  assert.equal(r.status,202);assert.ok(performance.now()-start<10000);assert.ok(r.body.progress<120);
  let samples=0,maxLatency=0;
  while(!['completed','failed'].includes(imports.view(r.body.id,adminId).status)) {
    const t=performance.now();assert.equal((await api('/students/import-batches')).status,200);maxLatency=Math.max(maxLatency,performance.now()-t);samples++;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const result=await done(r.body.id);assert.equal(result.imported,120);assert.equal(result.failed,0);assert.equal(result.progress,120);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n-beforeCount,120);
  assert.ok(samples>5);assert.ok(maxLatency<3000,`max latency ${maxLatency} ms`);
  for(const a of result.accounts)assert.equal((await login(a.username,generateTemporaryPassword(a.real_name))).status,200);
  console.log(`120 人压力验收：查询 ${samples} 次，最慢 ${Math.round(maxLatency)} ms，全部登录成功`);
});
test('独立进程重启自动恢复 running 批次，不重复已提交账号',()=>{
  const file=path.join(dir,'restart.db');
  const script=phase=>`
    const assert=require('node:assert/strict');const fs=require('node:fs');
    if(!fs.existsSync(process.env.DB_PATH))fs.writeFileSync(process.env.DB_PATH,'');
    const db=require('./config/database');
    (async()=>{
      const batches=require('./services/accountImportService');
      if(${JSON.stringify(phase)}==='seed'){
        db.prepare("INSERT INTO users(username,real_name,role,password_hash) VALUES('restart-admin','管理员','admin','unused')").run();
        const id=db.prepare("SELECT id FROM users WHERE username='restart-admin'").get().id;
        const created=await require('./services/accountCreationService').createAccount({real_name:'重启甲',role:'mentor'});
        const {temp_password,force_reset_password,...meta}=created;
        db.prepare("INSERT INTO account_import_batches(id,actor_id,fingerprint,request_key,input_json,status,progress,result_json) VALUES(?,?,?,?,?,'running',1,?)").run('restart-job',id,'restart-fp','restart-key',JSON.stringify([{real_name:'重启甲',role:'mentor'},{real_name:'重启乙',role:'mentor'}]),JSON.stringify({accounts:[meta],errors:[],row_results:[{row:1,status:'created',username:meta.username}]}));
      } else {
        batches.resumePending();await batches.wait('restart-job');
        const r=batches.view('restart-job',1,true);assert.equal(r.status,'completed');assert.equal(r.imported,2);
        assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role='academic_mentor'").get().n,2);
        assert.equal(r.accounts[1].username,'BUAA_mentor_chongqiyi_2');
      }
      db.close();
    })().catch(e=>{console.error(e);process.exitCode=1;});`;
  for(const phase of ['seed','resume','resume']) {
    const r=spawnSync(process.execPath,['-e',script(phase)],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:20000,env:{...process.env,DB_PATH:file}});
    assert.equal(r.status,0,r.stderr);
  }
});
