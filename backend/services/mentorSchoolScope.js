const db=require('../config/database');
const {active,fail}=require('./courseManagers');
const requests=require('../helpers/requestResults');
function actor(user){return active(user,user.role==='admin'?'admin':'academic_mentor');}
function schoolSql(user,column='s.id'){
 if(user.role==='admin')return '1=1';
 const id=Number(user.id);if(!Number.isSafeInteger(id))fail('账号无效',403);
 return schoolGrantSql(String(id),column);
}
function schoolGrantSql(mentor,column){
 return `EXISTS(SELECT 1 FROM users school_actor WHERE school_actor.id=${mentor} AND school_actor.role='academic_mentor' AND school_actor.is_active=1 AND school_actor.archived_at IS NULL AND (EXISTS(SELECT 1 FROM school_managers sm JOIN school_applications sa ON sa.id=sm.application_id WHERE sm.school_id=${column} AND sm.mentor_id=school_actor.id AND sm.active=1 AND sa.status='approved') OR EXISTS(SELECT 1 FROM school_direct_grants dg WHERE dg.school_id=${column} AND dg.mentor_id=school_actor.id AND dg.active=1)))`;
}
function schools(user){actor(user);return db.prepare(`SELECT s.id,s.name,s.region FROM schools s WHERE s.is_active=1 AND ${schoolSql(user)} ORDER BY s.name,s.id`).all();}
function school(user,id){actor(user);const row=db.prepare(`SELECT s.* FROM schools s WHERE s.id=? AND s.is_active=1 AND ${schoolSql(user)}`).get(id);if(!row)fail('学校不存在或管理授权已失效',403);return row;}
function manages(user,courseId){actor(user);if(user.role!=='admin'&&!require('../helpers/courseScope').courseBelongsToMentor(user.id,courseId))fail('课程管理授权已失效',403);const c=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!c)fail('课程不存在',404);return c;}
// Expressions are internal server-owned SQL identifiers, never request text.
function accountScopeSql(mentor,student='u.id',schoolColumn='u.school_id'){
 return `(EXISTS(SELECT 1 FROM school_created_accounts ca WHERE ca.student_id=${student} AND ca.actor_id=${mentor}) OR EXISTS(SELECT 1 FROM organization_account_delegations od WHERE od.student_id=${student} AND od.mentor_id=${mentor} AND od.active=1 AND od.school_id=${schoolColumn}))`;
}
function accountSql(user,column='u.id',schoolColumn='u.school_id'){
 if(user.role==='admin')return '1=1';const id=Number(user.id);return Number.isSafeInteger(id)?accountScopeSql(String(id),column,schoolColumn):'0=1';
}
function admissionSql(user,courseId){
 const cid=Number(courseId);if(!Number.isSafeInteger(cid))fail('课程编号无效');
 return `u.is_active=1 AND u.archived_at IS NULL AND EXISTS(SELECT 1 FROM schools s JOIN course_school_scopes cs ON cs.school_id=s.id WHERE cs.course_id=${cid} AND s.id=u.school_id AND s.is_active=1 AND ${schoolSql(user)}) AND ${accountSql(user)}`;
}
function assertAdmission(user,courseId,studentId){manages(user,courseId);if(!db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.role='student' AND ${admissionSql(user,courseId)}`).get(studentId))fail('学生不在课程上线学校与账号管理交集内，请核对学校范围及账号委托',403);}
function assertPublish(user,courseId){manages(user,courseId);const scopes=db.prepare('SELECT s.id FROM course_school_scopes cs JOIN schools s ON s.id=cs.school_id WHERE cs.course_id=? AND s.is_active=1').all(courseId);if(!scopes.length)fail('请先明确选择课程上线学校；无获准学校时可保留草稿并申请学校',409);if(user.role!=='admin'&&!schools(user).some(s=>scopes.some(v=>v.id===s.id)))fail('没有可在当前获准学校上线的范围',403);}
function read(user,courseId){const c=manages(user,courseId);const owned=schools(user);return{revision:c.school_scope_revision,available:owned,enrollments:db.prepare("SELECT e.id,e.student_id,u.real_name,u.school_id FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.course_id=? AND e.status='active'").all(courseId),scopes:db.prepare('SELECT cs.*,s.name,s.is_active FROM course_school_scopes cs JOIN schools s ON s.id=cs.school_id WHERE cs.course_id=?').all(courseId).map(s=>({...s,editable:user.role==='admin'||owned.some(v=>v.id===s.school_id)})),legacy:db.prepare('SELECT e.id,e.student_id,u.real_name,u.school_id,a.school_id confirmed_school_id,a.source FROM enrollments e JOIN users u ON u.id=e.student_id JOIN enrollment_access_confirmations a ON a.enrollment_id=e.id WHERE e.course_id=?').all(courseId)};}
function save(user,courseId,body){return db.transaction(()=>{
 const c=manages(user,courseId);if(c.status==='archived')fail('已归档课程只读',409);
 if(Object.keys(body).some(k=>!['school_ids','expectedRevision','reason','confirmExisting','request_key'].includes(k)))fail('上线范围字段无效');
 const identity=requests.identity(user,'course-schools:'+courseId,body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 if(c.school_scope_revision!==body.expectedRevision)fail('上线范围已变化，请核对最新修订，输入保留',409);
 if(!Array.isArray(body.school_ids)||body.school_ids.some(id=>!Number.isSafeInteger(id))||new Set(body.school_ids).size!==body.school_ids.length)fail('请选择合法学校');
 const reason=typeof body.reason==='string'?body.reason.trim():'';if(!reason||reason.length>1000)fail('请填写范围调整说明');
 for(const id of body.school_ids)school(user,id);
 const current=read(user,courseId),editable=current.scopes.filter(s=>s.editable),removed=editable.filter(s=>!body.school_ids.includes(s.school_id));
 const affected=db.prepare("SELECT e.id,u.real_name,u.school_id FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.course_id=? AND e.status='active'").all(courseId).filter(e=>removed.some(s=>s.school_id===e.school_id));
 if(affected.length&&(user.role!=='admin'||body.confirmExisting!==true))throw Object.assign(new Error('缩小范围涉及现有学生，须管理员核对并明确保留现有报名访问'),{status:409,items:affected});
 for(const row of affected)db.prepare("INSERT INTO enrollment_access_confirmations(enrollment_id,school_id,source,actor_id,reason) VALUES(?,?,'admin_preserved',?,?) ON CONFLICT(enrollment_id) DO UPDATE SET school_id=excluded.school_id,source=excluded.source,actor_id=excluded.actor_id,reason=excluded.reason").run(row.id,row.school_id,user.id,reason);
 for(const s of editable)db.prepare('DELETE FROM course_school_scopes WHERE course_id=? AND school_id=?').run(courseId,s.school_id);
 for(const id of body.school_ids)db.prepare('INSERT OR IGNORE INTO course_school_scopes(course_id,school_id,created_by) VALUES(?,?,?)').run(courseId,id,user.id);
 db.prepare('UPDATE courses SET school_scope_revision=school_scope_revision+1 WHERE id=?').run(courseId);
 db.prepare("INSERT INTO mentor_scope_events(actor_id,course_id,action,detail) VALUES(?,?,'school_scope',?)").run(user.id,courseId,JSON.stringify({before:current.scopes.map(s=>s.school_id),chosen:body.school_ids,reason,preserved:affected.map(a=>a.id)}));
 const result={saved:true,revision:c.school_scope_revision+1,preserved:affected.length};requests.save(db,identity,result);return result;
 }).immediate();}
function delegate(user,schoolId,body){return db.transaction(()=>{
 active(user,'admin');
 if(Object.keys(body).some(k=>!['mentorId','studentId','active','expectedRevision','reason','request_key'].includes(k)))fail('账号委托字段无效');
 if(typeof body.active!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail('请填写状态、修订与原因');
 const target=db.prepare("SELECT * FROM users WHERE id=? AND role='academic_mentor' AND is_active=1 AND archived_at IS NULL").get(body.mentorId);
 const recorded=db.prepare('SELECT * FROM organization_account_delegations WHERE student_id=? AND mentor_id=?').get(body.studentId,body.mentorId);
 if(body.active){school(user,schoolId);if(!target)fail('导师不可用');school({...target,auth_version:target.auth_version},schoolId);
 if(!db.prepare("SELECT 1 FROM users WHERE id=? AND role='student' AND school_id=?").get(body.studentId,schoolId))fail('学生不属于该校');
 }else if(!recorded||recorded.school_id!==Number(schoolId))fail('当前学校的历史委托不存在',404);
 const identity=requests.identity(user,'organization-delegate:'+schoolId,body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 const old=db.prepare('SELECT revision FROM organization_account_delegations WHERE student_id=? AND mentor_id=?').get(body.studentId,body.mentorId);if((old?.revision||0)!==body.expectedRevision)fail('委托已变化，请核对最新记录',409);
 db.prepare('INSERT INTO organization_account_delegations(student_id,mentor_id,school_id,active,actor_id,reason) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,mentor_id) DO UPDATE SET school_id=excluded.school_id,active=excluded.active,actor_id=excluded.actor_id,reason=excluded.reason,revision=organization_account_delegations.revision+1').run(body.studentId,body.mentorId,schoolId,body.active?1:0,user.id,body.reason.trim());
 db.prepare("INSERT INTO school_management_events(school_id,actor_id,mentor_id,action,detail) VALUES(?,?,?,'account_delegation',?)").run(schoolId,user.id,body.mentorId,JSON.stringify({studentId:body.studentId,active:body.active,reason:body.reason}));
 const result={saved:true,revision:(old?.revision||0)+1};requests.save(db,identity,result);return result;
 }).immediate();}
module.exports={schoolGrantSql,actor,schools,school,schoolSql,manages,accountScopeSql,accountSql,admissionSql,assertAdmission,assertPublish,read,save,delegate};
