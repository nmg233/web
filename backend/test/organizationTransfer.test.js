const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-class-transfer-'));
Object.assign(process.env, { DB_PATH: path.join(dir,'test.db'), UPLOAD_PATH: path.join(dir,'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(dir,'private'), NODE_ENV:'test', JWT_SECRET:'class-transfer-test', LOGIN_RATE_LIMIT_IP:'1000' });
const app = require('../app');
const db = require('../config/database');
const org = require('../services/organizationService');
const observer = require('../services/observerService');
let base, server, sequence = 0;
const admin = { id:1,role:'admin' };
const hash = bcrypt.hashSync('Test!1234',4);
before(async () => {
  db.prepare("INSERT INTO users (id,username,password_hash,real_name,role) VALUES (1,'transfer_admin',?,'迁移管理员','admin')").run(hash);
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
function fixture() {
  const n = ++sequence;
  const school = name => Number(db.prepare('INSERT INTO schools (name) VALUES (?)').run(name).lastInsertRowid);
  const from=school(`原学校${n}`), to=school(`目标学校${n}`);
  const cls = (name,s) => Number(db.prepare('INSERT INTO classes (name,school_id) VALUES (?,?)').run(name,s).lastInsertRowid);
  const id=cls(`待迁班级${n}`,from), holding=cls(`原教师班级${n}`,from), targetClass=cls(`目标教师班级${n}`,to);
  const user=(role,s,c) => Number(db.prepare('INSERT INTO users (username,password_hash,real_name,role,school_id,class_id) VALUES (?,?,?,?,?,?)')
    .run(`user_${n}_${role}_${c || 0}`,hash,`姓名${role}${n}`,role,s,c).lastInsertRowid);
  const oldTeacher=user('teacher',from,holding), teacher=user('teacher',to,targetClass), mentor=user('academic_mentor',null,null);
  const student=user('student',from,id), archived=user('student',from,holding);
  db.prepare('UPDATE users SET class_id=?,is_active=0,archived_at=CURRENT_TIMESTAMP WHERE id=?').run(id,archived);
  db.prepare('UPDATE users SET teacher_id=?,mentor_id=? WHERE id IN (?,?)').run(oldTeacher,mentor,student,archived);
  const course=Number(db.prepare("INSERT INTO courses (title,grade_level,difficulty,status,created_by) VALUES ('迁移历史课程','primary','basic','published',?)").run(mentor).lastInsertRowid);
  const lesson=Number(db.prepare("INSERT INTO lessons (course_id,title,status) VALUES (?,'课时','completed')").run(course).lastInsertRowid);
  const enrollment=Number(db.prepare("INSERT INTO enrollments (student_id,course_id,status) VALUES (?,?,'active')").run(student,course).lastInsertRowid);
  const card=Number(db.prepare("INSERT INTO knowledge_cards (lesson_id,title,content,status,created_by) VALUES (?,'卡片','内容','published',?)").run(lesson,mentor).lastInsertRowid);
  const exercise=Number(db.prepare("INSERT INTO card_exercises (card_id,question_type,prompt,answer_json,explanation) VALUES (?,'true_false','题目','true','详解')").run(card).lastInsertRowid);
  db.prepare("INSERT INTO card_exercise_attempts (student_id,exercise_id,answer_json,is_correct,score,attempt_no) VALUES (?,?,'false',0,0,1)").run(student,exercise);
  db.prepare('INSERT INTO lesson_progress (student_id,lesson_id,progress,completed_at) VALUES (?,?,100,CURRENT_TIMESTAMP)').run(student,lesson);
  db.prepare("INSERT INTO lesson_learning_reports (student_id,lesson_id,enrollment_id,summary,status,score,version,reviewer_id) VALUES (?,?,?,'报告','approved',95,1,?)").run(student,lesson,enrollment,mentor);
  db.prepare('INSERT INTO enrollment_completions (enrollment_id,lesson_manifest_json) VALUES (?,?)').run(enrollment,JSON.stringify([lesson]));
  return { id,from,to,holding,teacher,oldTeacher,mentor,student,archived,
    data:{source_school_id:from,target_school_id:to,teacher_id:teacher,reason:'班级整体调整',student_count:2,request_key:`transfer_key_${n}`} };
}
const user = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const historyTables = ['enrollments','card_exercise_attempts','lesson_progress','lesson_learning_reports','enrollment_completions'];
const history = () => historyTables.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());
function token(id) { const row=user(id); return jwt.sign({id,role:row.role,school_id:row.school_id,auth_version:row.auth_version},process.env.JWT_SECRET,{expiresIn:'1h'}); }
async function api(url,method='GET',body,bearer=token(1)) {
  const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
}

test('整班迁校保留班级标识、两类学生账号和全部学习历史，教师查看权限即时移交', () => {
  const f=fixture(), beforeHistory=history(), before=[user(f.student),user(f.archived)];
  assert.equal(observer.students({id:f.oldTeacher,role:'teacher'}).pagination.total,1);
  const result=org.transferClass(admin,f.id,f.data); assert.equal(result.student_count,2);
  assert.equal(db.prepare('SELECT school_id FROM classes WHERE id=?').get(f.id).school_id,f.to);
  for (const prior of before) {
    const next=user(prior.id); assert.equal(next.school_id,f.to); assert.equal(next.teacher_id,f.teacher);
    assert.deepEqual({...next,school_id:prior.school_id,teacher_id:prior.teacher_id},prior);
  }
  assert.deepEqual(history(),beforeHistory);
  assert.equal(observer.students({id:f.oldTeacher,role:'teacher'}).pagination.total,0);
  assert.equal(observer.students({id:f.teacher,role:'teacher'}).pagination.total,1);
  assert.throws(()=>observer.studentDetail({id:f.oldTeacher,role:'teacher'},f.student),e=>e.status===404);
  const [audit]=org.classTransfers(admin,f.id); assert.equal(audit.members.length,2);
  assert.equal(audit.members[0].teacher_id,f.oldTeacher); assert.equal(audit.members[0].mentor_id,f.mentor);
  assert.equal(audit.context.target_school_name,`目标学校${sequence}`);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok'); assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
test('重复请求只有一次审计；改内容复用标识、旧学校页面再操作均被拒绝', () => {
  const f=fixture(), first=org.transferClass(admin,f.id,f.data);
  assert.deepEqual(org.transferClass(admin,f.id,f.data),first);
  assert.equal(org.classTransfers(admin,f.id).length,1);
  assert.throws(()=>org.transferClass(admin,f.id,{...f.data,reason:'另一原因'}),e=>e.status===409);
  assert.throws(()=>org.transferClass(admin,f.id,{...f.data,request_key:'another_request'}),e=>e.status===409);
});
test('原班级仍绑定教师时不自动改教师账号，解除归属后才可迁移', () => {
  const f=fixture(); db.prepare('UPDATE users SET class_id=? WHERE id=?').run(f.id,f.oldTeacher);
  const before=user(f.oldTeacher);
  assert.throws(()=>org.transferClass(admin,f.id,f.data),/仍绑定教师/);
  assert.deepEqual(user(f.oldTeacher),before); assert.equal(user(f.student).school_id,f.from);
  db.prepare('UPDATE users SET class_id=? WHERE id=?').run(f.holding,f.oldTeacher);
  assert.equal(org.transferClass(admin,f.id,f.data).student_count,2);
});
test('拒绝错误学校教师、停用目标、无原因、人数变化和异常学生归属，所有关系保持不变', () => {
  const f=fixture();
  for (const data of [{...f.data,teacher_id:f.oldTeacher},{...f.data,teacher_id:f.mentor},{...f.data,reason:' '},
    {...f.data,student_count:1},{...f.data,target_school_id:f.from},{...f.data,request_key:undefined}, {...f.data,teacher_id:'1 OR 1=1'}]) {
    assert.throws(()=>org.transferClass(admin,f.id,data));
    assert.equal(user(f.student).school_id,f.from);
  }
  org.setSchoolActive(f.to,false); assert.throws(()=>org.transferClass(admin,f.id,f.data),/已停用/); org.setSchoolActive(f.to,true);
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(f.teacher);
  assert.throws(()=>org.transferClass(admin,f.id,f.data),/有效负责教师/); db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(f.teacher);
  db.prepare('UPDATE users SET school_id=? WHERE id=?').run(f.to,f.archived);
  assert.throws(()=>org.transferClass(admin,f.id,f.data),/归属不一致/);
  assert.equal(db.prepare('SELECT school_id FROM classes WHERE id=?').get(f.id).school_id,f.from);
  assert.equal(org.classTransfers(admin,f.id).length,0);
});
test('审计写入失败整个迁移回滚，不留半迁班级、半迁学生或成功重试记录', () => {
  const f=fixture(), beforeHistory=history(), before=user(f.student), prepare=db.prepare;
  try {
    db.prepare=function(sql) { if(sql.includes('INSERT INTO class_school_transfers')) throw Error('模拟审计失败'); return prepare.call(this,sql); };
    assert.throws(()=>org.transferClass(admin,f.id,f.data),/模拟审计失败/);
  } finally { db.prepare=prepare; }
  assert.deepEqual(user(f.student),before); assert.deepEqual(history(),beforeHistory);
  assert.equal(db.prepare('SELECT school_id FROM classes WHERE id=?').get(f.id).school_id,f.from);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM request_results WHERE request_key=?').get(f.data.request_key).n,0);
  assert.equal(org.transferClass(admin,f.id,f.data).student_count,2);
});
test('HTTP迁移和记录均仅管理员可用；学生换校后旧令牌失效，原密码重新登录即可继续学习', async () => {
  const f=fixture(), oldToken=token(f.student);
  for(const id of [f.student,f.oldTeacher,f.mentor]) {
    assert.equal((await api(`/students/classes/${f.id}/transfer`,'POST',f.data,token(id))).status,403);
    assert.equal((await api(`/students/classes/${f.id}/transfers`,'GET',undefined,token(id))).status,403);
  }
  assert.equal((await api(`/students/classes/${f.id}/transfer`,'POST',f.data)).status,200);
  assert.equal((await api(`/students/classes/${f.id}/transfers`)).body.transfers.length,1);
  assert.equal((await api('/auth/me','GET',undefined,oldToken)).status,401);
  const login=await api('/auth/login','POST',{username:user(f.student).username,password:'Test!1234'},'');
  assert.equal(login.status,200); assert.equal(login.body.user.school_id,f.to);
  assert.equal((await api('/auth/me','GET',undefined,login.body.token)).status,200);
});
