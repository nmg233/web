const db=require('../config/database'),requests=require('../helpers/requestResults'),{active,fail}=require('./courseManagers');
const normalize=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function fields(body,allowed){if(Object.keys(body).some(k=>!allowed.includes(k)))fail('包含不允许的字段');}
function text(value,label,max=1000,required=true){if(value==null&&!required)return null;if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(label+'格式无效');return value.trim()||null;}
function managed(user,schoolId){return require('./mentorSchoolScope').school(user,schoolId);}
function keyed(user,scope,body,fn){return db.transaction(()=>{const key=requests.identity(user,scope,body);if(!key)fail('缺少请求编号');const old=requests.existing(db,key);if(old)return old;const result=fn();requests.save(db,key,result);return result;}).immediate();}
function notify(user,key,title,content,recipients,url){require('./notificationService').safeCreateForUsers({eventKey:'school.application',dedupeKey:key,title,content,category:'account',actionUrl:url,createdBy:user.id},recipients);}
function list(user,query={}){
 active(user,user.role==='admin'?'admin':'academic_mentor');
 const rows=db.prepare(`SELECT a.*,u.real_name applicant_name,u.username applicant_username,r.real_name reviewer_name,(SELECT m.active FROM school_managers m WHERE m.school_id=a.school_id AND m.mentor_id=a.applicant_id) management_active FROM school_applications a JOIN users u ON u.id=a.applicant_id LEFT JOIN users r ON r.id=a.reviewed_by ${user.role==='admin'?'':'WHERE a.applicant_id=?'} ORDER BY a.id DESC`).all(...(user.role==='admin'?[]:[user.id]));
 const schools=db.prepare('SELECT id,name,region,is_active FROM schools').all();
 return{applications:rows.filter(r=>!query.status||r.status===query.status).map(r=>({...r,duplicates:user.role==='admin'?schools.filter(s=>normalize(s.name)===r.normalized_name):[]})),
 schools:user.role==='admin'?db.prepare('SELECT m.*,s.name,u.real_name mentor_name FROM school_managers m JOIN schools s ON s.id=m.school_id JOIN users u ON u.id=m.mentor_id ORDER BY s.id,m.mentor_id').all():db.prepare('SELECT s.id,s.name,s.region FROM schools s JOIN school_managers m ON m.school_id=s.id WHERE m.mentor_id=? AND m.active=1 AND s.is_active=1').all(user.id)};
}
function apply(user,body){active(user,'academic_mentor');fields(body,['name','region','contact','contact_details','explanation','request_key']);return keyed(user,'school-application',body,()=>{
 active(user,'academic_mentor');const name=text(body.name,'学校名称',120),normalized=normalize(name);text(body.region,'地区',120);text(body.explanation,'申请说明',2000);
 if(db.prepare("SELECT 1 FROM school_applications WHERE applicant_id=? AND normalized_name=? AND status='pending'").get(user.id,normalized))fail('已有同名待审核申请，请查看已有记录',409);
 const id=Number(db.prepare('INSERT INTO school_applications(applicant_id,name,normalized_name,region,contact,contact_details,explanation) VALUES(?,?,?,?,?,?,?)').run(user.id,name,normalized,body.region.trim(),text(body.contact,'联系人',120,false),text(body.contact_details,'联系方式',200,false),body.explanation.trim()).lastInsertRowid);
 notify(user,'school.apply:'+id,'学校申请待审核','收到新的学校申请，请核对重名学校及申请说明。','admins','/admin/organization?section=applications&application='+id);return{id};
 });}
function review(user,id,body){active(user,'admin');fields(body,['decision','reason','existingSchoolId','confirmExisting','expectedRevision','request_key']);return keyed(user,'school-review:'+id,body,()=>{
 active(user,'admin');const app=db.prepare('SELECT * FROM school_applications WHERE id=?').get(id);if(!app)fail('申请不存在',404);if(app.status!=='pending'||app.revision!==body.expectedRevision)fail('申请已经处理或修订发生变化，请重新核对',409);
 active({id:app.applicant_id,auth_version:db.prepare('SELECT auth_version FROM users WHERE id=?').get(app.applicant_id)?.auth_version},'academic_mentor');
 if(!['approved','rejected'].includes(body.decision))fail('请选择批准或驳回');const reason=text(body.reason,'审核说明',1000,body.decision==='rejected');let schoolId=null;
 if(body.decision==='approved'){
  const duplicates=db.prepare('SELECT * FROM schools').all().filter(s=>normalize(s.name)===app.normalized_name);
  if(duplicates.length){const chosen=duplicates.find(s=>s.id===Number(body.existingSchoolId)&&s.is_active);if(!chosen||body.confirmExisting!==true||!reason)fail('存在同名学校，请核对并明确确认关联已有学校及原因；不会自动授予权限',409);schoolId=chosen.id;}
  else{if(body.existingSchoolId)fail('不可关联名称不符的学校');schoolId=Number(db.prepare('INSERT INTO schools(name,region,contact_person,contact_phone,description) VALUES(?,?,?,?,?)').run(app.name,app.region,app.contact,app.contact_details,app.explanation).lastInsertRowid);}
  db.prepare('INSERT INTO school_managers(school_id,mentor_id,application_id,granted_by) VALUES(?,?,?,?) ON CONFLICT(school_id,mentor_id) DO UPDATE SET application_id=excluded.application_id,active=1,granted_by=excluded.granted_by,granted_at=CURRENT_TIMESTAMP,revoked_at=NULL,revoked_by=NULL,revision=school_managers.revision+1').run(schoolId,app.applicant_id,id,user.id);
 }
 db.prepare('UPDATE school_applications SET status=?,school_id=?,reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=?').run(body.decision,schoolId,reason,user.id,id);
 db.prepare('INSERT INTO school_management_events(school_id,mentor_id,application_id,actor_id,action,detail) VALUES(?,?,?,?,?,?)').run(schoolId,app.applicant_id,id,user.id,body.decision,reason||'批准新学校');
 notify(user,'school.review:'+id,'学校申请'+(schoolId?'已批准':'已驳回'),schoolId?'可在账号与组织中建立该校班级和学生账号。':'驳回原因：'+reason,[app.applicant_id],'/mentor/organization?application='+id);return{id:Number(id),schoolId,status:body.decision};
 });}
function revoke(user,schoolId,mentorId,body){active(user,'admin');fields(body,['reason','expectedRevision','request_key']);return keyed(user,'school-revoke:'+schoolId+':'+mentorId,body,()=>{
 active(user,'admin');const reason=text(body.reason,'撤销原因'),m=db.prepare('SELECT * FROM school_managers WHERE school_id=? AND mentor_id=?').get(schoolId,mentorId);if(!m)fail('学校授权不存在',404);if(m.revision!==body.expectedRevision||!m.active)fail('学校授权已变化',409);
 db.prepare('UPDATE school_managers SET active=0,revoked_by=?,revoked_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE school_id=? AND mentor_id=?').run(user.id,schoolId,mentorId);
 db.prepare('INSERT INTO school_management_events(school_id,mentor_id,application_id,actor_id,action,detail) VALUES(?,?,?,?,?,?)').run(schoolId,mentorId,m.application_id,user.id,'revoke',reason);
 notify(user,'school.revoke:'+schoolId+':'+mentorId+':'+m.revision,'学校管理授权已撤销','建班和建学生入口已停用，既有教学记录保留。',[Number(mentorId)],'/mentor/organization');return{saved:true};
 });}
function classes(user,schoolId){managed(user,schoolId);return{classes:db.prepare('SELECT id,name,grade FROM classes WHERE school_id=? ORDER BY id').all(schoolId),students:db.prepare(`SELECT u.id,u.username,u.real_name,u.class_id,u.force_reset_password FROM users u WHERE u.school_id=? AND u.role='student' AND ${require('./mentorSchoolScope').accountSql(user)} ORDER BY u.id DESC`).all(schoolId)};}
function createClass(user,schoolId,body){managed(user,schoolId);fields(body,['name','grade','request_key']);return keyed(user,'school-class:'+schoolId,body,()=>{managed(user,schoolId);const name=text(body.name,'班级名称',120),grade=text(body.grade,'年级',120);if(db.prepare('SELECT 1 FROM classes WHERE school_id=? AND name=? AND grade=?').get(schoolId,name,grade))fail('该学校已有相同班级，请使用现有班级',409);const id=Number(db.prepare('INSERT INTO classes(school_id,name,grade) VALUES(?,?,?)').run(schoolId,name,grade).lastInsertRowid);db.prepare("INSERT INTO school_management_events(school_id,actor_id,action,detail) VALUES(?,?,'class_created',?)").run(schoolId,user.id,JSON.stringify({classId:id}));return{id};});}
async function createStudent(user,schoolId,body){
 managed(user,schoolId);fields(body,['class_id','real_name','username','request_key']);const real_name=text(body.real_name,'学生姓名',120);if(!Number.isSafeInteger(body.class_id))fail('请选择本校班级');
 const identity=requests.identity(user,'school-student:'+schoolId,body);if(!identity)fail('缺少请求编号');
 const prior=()=>{const row=db.prepare('SELECT * FROM school_created_accounts WHERE actor_id=? AND request_key=?').get(user.id,identity.key);if(row&&(row.fingerprint!==identity.fingerprint||row.school_id!==Number(schoolId)))fail('同一请求编号不能用于不同学生',409);return row?{id:row.student_id}:null;};const old=prior();if(old)return old;
 try{
 const account=await require('./accountCreationService').createAccount({real_name,username:body.username,role:'student',school_id:Number(schoolId),class_id:body.class_id},{beforeCommit:()=>{managed(user,schoolId);const replay=prior();if(replay)throw Object.assign(new Error('REPLAY'),{replay});},onCreated:a=>{
 db.prepare('UPDATE users SET mentor_id=? WHERE id=?').run(user.role==='academic_mentor'?user.id:null,a.id);
 db.prepare('INSERT INTO school_created_accounts(student_id,actor_id,school_id,class_id,request_key,fingerprint) VALUES(?,?,?,?,?,?)').run(a.id,user.id,schoolId,body.class_id,identity.key,identity.fingerprint);
 db.prepare("INSERT INTO school_management_events(school_id,actor_id,action,detail) VALUES(?,?,'student_created',?)").run(schoolId,user.id,JSON.stringify({studentId:a.id,classId:body.class_id}));}});return{id:account.id};
 }catch(e){if(e.replay)return e.replay;throw e;}
}
function credentials(user,schoolId,studentId){managed(user,schoolId);const a=db.prepare(`SELECT u.* FROM users u WHERE u.id=? AND u.school_id=? AND ${require('./mentorSchoolScope').accountSql(user)}`).get(studentId,schoolId);if(!a||a.role!=='student'||!a.is_active||a.archived_at)fail('学生账号不可交付',404);const password=require('./tempPasswordService').generateTemporaryPassword(a.real_name);if(a.force_reset_password!==1||!require('bcryptjs').compareSync(password,a.password_hash))fail('初始凭据已失效，不能再次导出；请联系管理员处理',409);return{id:a.id,username:a.username,real_name:a.real_name,role:'student',temp_password:password,force_reset_password:1};}
module.exports={list,apply,review,revoke,managed,classes,createClass,createStudent,credentials,normalize};
