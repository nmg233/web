const db=require('../config/database'),{active,fail}=require('./courseManagers'),requests=require('../helpers/requestResults');
function read(user){active(user,'admin');return{
 schools:db.prepare('SELECT id,name FROM schools WHERE is_active=1 ORDER BY name,id').all(),
 mentors:db.prepare("SELECT id,real_name,username FROM users WHERE role='academic_mentor' AND is_active=1 AND archived_at IS NULL ORDER BY id").all(),
 applicationGrants:db.prepare("SELECT m.*,s.name school_name,u.real_name mentor_name,a.real_name actor_name,sa.reason,sa.status application_status FROM school_managers m JOIN schools s ON s.id=m.school_id JOIN users u ON u.id=m.mentor_id JOIN users a ON a.id=m.granted_by JOIN school_applications sa ON sa.id=m.application_id ORDER BY m.granted_at DESC,m.school_id,m.mentor_id").all(),
 grants:db.prepare("SELECT g.*,s.name school_name,u.real_name mentor_name,a.real_name actor_name FROM school_direct_grants g JOIN schools s ON s.id=g.school_id JOIN users u ON u.id=g.mentor_id JOIN users a ON a.id=g.actor_id ORDER BY g.updated_at DESC,g.school_id,g.mentor_id").all(),
};}
function write(user,body){active(user,'admin');return db.transaction(()=>{
 if(Object.keys(body).some(k=>!['schoolId','mentorId','active','expectedRevision','reason','request_key'].includes(k)))fail('学校授权字段无效');
 if(!Number.isSafeInteger(body.schoolId)||!Number.isSafeInteger(body.mentorId)||typeof body.active!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail('请选择学校、导师、状态，并填写授权原因及当前修订');
 const identity=requests.identity(user,'school-direct-grant',body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 const old=db.prepare('SELECT * FROM school_direct_grants WHERE school_id=? AND mentor_id=?').get(body.schoolId,body.mentorId);
 if((old?.revision||0)!==body.expectedRevision)fail('授权已变化，输入保留；请核对当前修订后再保存',409);
 if(body.active){
  if(!old&&db.prepare("SELECT 1 FROM school_managers m JOIN school_applications a ON a.id=m.application_id WHERE m.school_id=? AND m.mentor_id=? AND m.active=1 AND a.status='approved'").get(body.schoolId,body.mentorId))fail('该导师已通过学校申请获得授权，请维护现有申请授权记录，无需重复授予',409);
  if(!db.prepare('SELECT 1 FROM schools WHERE id=? AND is_active=1').get(body.schoolId))fail('学校不存在或已停用',404);
  if(!db.prepare("SELECT 1 FROM users WHERE id=? AND role='academic_mentor' AND is_active=1 AND archived_at IS NULL").get(body.mentorId))fail('导师不存在或已停用',404);
 }else if(!old)fail('直接学校授权不存在',404);
 db.prepare('INSERT INTO school_direct_grants(school_id,mentor_id,active,actor_id,reason) VALUES(?,?,?,?,?) ON CONFLICT(school_id,mentor_id) DO UPDATE SET active=excluded.active,actor_id=excluded.actor_id,reason=excluded.reason,revision=school_direct_grants.revision+1,updated_at=CURRENT_TIMESTAMP').run(body.schoolId,body.mentorId,body.active?1:0,user.id,body.reason.trim());
 db.prepare("INSERT INTO school_management_events(school_id,mentor_id,actor_id,action,detail) VALUES(?,?,?,'direct_school_grant',?)").run(body.schoolId,body.mentorId,user.id,JSON.stringify({active:body.active,reason:body.reason.trim(),revision:(old?.revision||0)+1}));
 require('./notificationService').safeCreateForUsers({eventKey:'school.direct',dedupeKey:`school.direct:${body.schoolId}:${body.mentorId}:${(old?.revision||0)+1}`,title:body.active?'学校管理权已授予':'直接学校管理权已撤销',content:'学校管理授权已更新；课程与既有学生账号权限仍须分别核对。',category:'account',actionUrl:'/mentor/organization?section=accounts',createdBy:user.id},[body.mentorId]);
 const result={saved:true,revision:(old?.revision||0)+1};requests.save(db,identity,result);return result;
 }).immediate();}
module.exports={read,write};
