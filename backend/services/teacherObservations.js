const db=require('../config/database'),scope=require('./mentorSchoolScope'),{fail}=require('./courseManagers'),requests=require('../helpers/requestResults');
// All SQL identifiers are server-owned call-site constants. User IDs are numeric JWT identities.
function sql(user,student='s.id',course=null){
 const id=Number(user.id);if(!Number.isSafeInteger(id))return '0=1';
 // legacy_teacher_id is the migration-frozen exception (including pre-existing cross-school pairs); it never grants new courses. New grants require both current schools and the actor's current account intersection.
 const bound=`EXISTS(SELECT 1 FROM teacher_observation_grants og JOIN users ot ON ot.id=og.teacher_id JOIN users os ON os.id=og.student_id LEFT JOIN schools school ON school.id=os.school_id WHERE og.teacher_id=${id} AND og.student_id=${student} ${course?`AND og.course_id=${course}`:''} AND og.active=1 AND (og.source NOT IN('legacy_teacher_id','admin_assignment') OR os.teacher_id=og.teacher_id) AND ot.role='teacher' AND ot.is_active=1 AND ot.archived_at IS NULL AND os.school_id IS og.school_id AND (og.source='legacy_teacher_id' OR ot.school_id IS og.school_id) AND (og.source='legacy_teacher_id' OR school.id IS NULL OR school.is_active=1) AND (og.source IN('legacy_teacher_id','admin','admin_assignment') OR EXISTS(SELECT 1 FROM users actor JOIN school_managers sm ON sm.mentor_id=actor.id AND sm.school_id=og.school_id JOIN school_applications sa ON sa.id=sm.application_id AND sa.status='approved' JOIN course_managers cm ON cm.mentor_id=actor.id AND cm.course_id=og.course_id WHERE actor.id=og.actor_id AND actor.role='academic_mentor' AND actor.is_active=1 AND actor.archived_at IS NULL AND actor.force_reset_password=0 AND sm.active=1 AND cm.active=1 AND ${scope.accountScopeSql('actor.id','os.id','os.school_id')})))`;
 if(course)return bound;
 return `(${bound} OR EXISTS(SELECT 1 FROM legacy_teacher_students old JOIN users os ON os.id=old.student_id JOIN users ot ON ot.id=old.teacher_id WHERE old.teacher_id=${id} AND old.student_id=${student} AND os.teacher_id=ot.id AND os.school_id IS old.school_id AND ot.role='teacher' AND ot.is_active=1 AND ot.archived_at IS NULL))`;
}
function can(user,studentId,courseId){return !!db.prepare(`SELECT 1 FROM users s WHERE s.id=? AND ${sql(user,'s.id',courseId===undefined?null:String(Number(courseId)))}`).get(studentId);}
function account(user,studentId){const s=db.prepare(`SELECT u.* FROM users u WHERE u.id=? AND u.role='student' AND ${scope.accountSql(user)}`).get(studentId);if(!s)fail('学生账号不在可维护范围',403);scope.school(user,s.school_id);return s;}
function teacher(user,id){const row=db.prepare("SELECT u.* FROM users u WHERE u.id=? AND u.role='teacher' AND u.is_active=1 AND u.archived_at IS NULL").get(id);if(!row)fail('教师账号不存在或已停用',404);scope.school(user,row.school_id);if(user.role!=='admin'&&!db.prepare('SELECT 1 FROM school_created_teachers WHERE teacher_id=? AND actor_id=?').get(id,user.id))fail('仅可配置本人创建的教师，其他账号请联系管理员',403);return row;}
function list(user,schoolId){scope.school(user,schoolId);return{
 mentors:user.role==='admin'?db.prepare("SELECT id,real_name FROM users WHERE role='academic_mentor' AND is_active=1 AND archived_at IS NULL").all():[],
 delegations:user.role==='admin'?db.prepare('SELECT d.*,u.real_name mentor_name,s.real_name student_name FROM organization_account_delegations d JOIN users u ON u.id=d.mentor_id JOIN users s ON s.id=d.student_id WHERE d.school_id=?').all(schoolId):[],
 teachers:db.prepare(`SELECT u.id,u.username,u.real_name,u.force_reset_password FROM users u ${user.role==='admin'?'':'JOIN school_created_teachers ct ON ct.teacher_id=u.id AND ct.actor_id='+Number(user.id)} WHERE u.school_id=? AND u.role='teacher' ORDER BY u.id`).all(schoolId),
 students:db.prepare(`SELECT u.id,u.real_name,u.class_id FROM users u WHERE u.school_id=? AND u.role='student' AND u.is_active=1 AND u.archived_at IS NULL AND ${scope.accountSql(user)}`).all(schoolId),
 courses:db.prepare(`SELECT c.id,c.title FROM courses c WHERE ${user.role==='admin'?'1=1':require('../helpers/courseScope').mentorCourseScope('c.id')}`).all(...(user.role==='admin'?[]:[user.id,user.id])),
 grants:db.prepare(`SELECT og.*,t.real_name teacher_name,s.real_name student_name,c.title course_title FROM teacher_observation_grants og JOIN users t ON t.id=og.teacher_id JOIN users s ON s.id=og.student_id JOIN courses c ON c.id=og.course_id WHERE og.school_id=? ${user.role==='admin'?'':'AND og.actor_id='+Number(user.id)} ORDER BY og.teacher_id,og.student_id,og.course_id`).all(schoolId)};}
function write(user,schoolId,body){return db.transaction(()=>{
 scope.actor(user);if(![body.teacherId,body.studentId,body.courseId].every(v=>Number.isSafeInteger(v)&&v>0))fail('请选择有效教师、学生和课程');
 if(typeof body.active!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail('请填写授权状态、修订及原因');
 if(Object.keys(body).some(k=>!['teacherId','studentId','courseId','active','expectedRevision','reason','request_key'].includes(k)))fail('观察授权字段无效');
 const g=db.prepare('SELECT * FROM teacher_observation_grants WHERE teacher_id=? AND student_id=? AND course_id=?').get(body.teacherId,body.studentId,body.courseId);
 if(body.active){
  scope.school(user,schoolId);const t=teacher(user,body.teacherId),s=account(user,body.studentId);scope.manages(user,body.courseId);
  if(t.school_id!==Number(schoolId)||s.school_id!==Number(schoolId))fail('教师与学生必须属于当前学校');
  if(!db.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'").get(s.id,body.courseId))fail('学生尚未报名此课程');
 }else{
  // Cleanup addresses an existing grant in its recorded school, not a new admission.
  if(!g||g.school_id!==Number(schoolId))fail('当前学校的观察授权不存在',404);
  if(user.role!=='admin'){
   scope.school(user,schoolId);scope.manages(user,body.courseId);
   const t=db.prepare("SELECT school_id FROM users WHERE id=? AND role='teacher'").get(body.teacherId),s=account(user,body.studentId);
   if(t?.school_id!==Number(schoolId)||s.school_id!==Number(schoolId)||!db.prepare('SELECT 1 FROM school_created_teachers WHERE teacher_id=? AND actor_id=?').get(body.teacherId,user.id))fail('教师或学生不在当前可维护范围',403);
  }
 }
 if(g&&user.role!=='admin'&&g.actor_id!==user.id)fail('已有观察关系请管理员核对，不覆盖他人授权',403);
 const identity=requests.identity(user,'teacher-observe:'+schoolId,body);if(!identity)fail('缺少请求编号');const old=requests.existing(db,identity);if(old)return old;
 if((g?.revision||0)!==body.expectedRevision)fail('观察授权已变化，请重新核对',409);
 if(!body.active&&!g.active){const result={saved:true,revision:g.revision};requests.save(db,identity,result);return result;}
 if(body.active)db.prepare(`INSERT INTO teacher_observation_grants(teacher_id,student_id,course_id,school_id,actor_id,source,active) VALUES(?,?,?,?,?,?,1) ON CONFLICT(teacher_id,student_id,course_id) DO UPDATE SET active=1,actor_id=excluded.actor_id,source=excluded.source,school_id=excluded.school_id,revision=teacher_observation_grants.revision+1,updated_at=CURRENT_TIMESTAMP`).run(body.teacherId,body.studentId,body.courseId,schoolId,user.id,user.role==='admin'?'admin':'mentor');
 else db.prepare('UPDATE teacher_observation_grants SET active=0,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE teacher_id=? AND student_id=? AND course_id=?').run(g.teacher_id,g.student_id,g.course_id);
 db.prepare('INSERT INTO teacher_observation_events(teacher_id,student_id,course_id,actor_id,active,reason) VALUES(?,?,?,?,?,?)').run(body.teacherId,body.studentId,body.courseId,user.id,body.active?1:0,body.reason.trim());
 const result={saved:true,revision:(g?.revision||0)+1};requests.save(db,identity,result);return result;
 }).immediate();}
async function createTeacher(user,schoolId,body){
 scope.school(user,schoolId);if(!Number.isSafeInteger(body.class_id)||body.class_id<1)fail('请选择本校班级');if(Object.keys(body).some(k=>!['real_name','username','class_id','request_key'].includes(k)))fail('教师账号字段无效');
 if(typeof body.real_name!=='string'||!body.real_name.trim()||body.real_name.length>120)fail('请填写教师姓名');
 const identity=requests.identity(user,'school-teacher:'+schoolId,body);if(!identity)fail('缺少请求编号');
 const prior=()=>{const row=db.prepare('SELECT * FROM school_created_teachers WHERE actor_id=? AND request_key=?').get(user.id,identity.key);if(row&&(row.fingerprint!==identity.fingerprint||row.school_id!==Number(schoolId)))fail('同一请求编号不能用于不同教师',409);return row?{id:row.teacher_id}:null;};const old=prior();if(old)return old;
 try{const result=await require('./accountCreationService').createAccount({...body,school_id:Number(schoolId),role:'teacher'},{beforeCommit:()=>{scope.school(user,schoolId);const replay=prior();if(replay)throw Object.assign(new Error('REPLAY'),{replay});},onCreated:a=>{db.prepare('INSERT INTO school_created_teachers(teacher_id,actor_id,school_id,request_key,fingerprint) VALUES(?,?,?,?,?)').run(a.id,user.id,schoolId,identity.key,identity.fingerprint);db.prepare("INSERT INTO school_management_events(school_id,actor_id,action,detail) VALUES(?,?,'teacher_created',?)").run(schoolId,user.id,JSON.stringify({teacherId:a.id}));}});return{id:result.id};}catch(e){if(e.replay)return e.replay;throw e;}
}
function credentials(user,schoolId,id){const t=teacher(user,id);if(t.school_id!==Number(schoolId))fail('教师不属于当前学校',404);const password=require('./tempPasswordService').generateTemporaryPassword(t.real_name);if(!t.force_reset_password||!require('bcryptjs').compareSync(password,t.password_hash))fail('初始凭据已失效，请联系管理员',409);return{id:t.id,username:t.username,real_name:t.real_name,temp_password:password,force_reset_password:1,role:'teacher'};}
module.exports={sql,can,list,write,createTeacher,credentials};
