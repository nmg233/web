const db=require('../config/database'),requests=require('../helpers/requestResults');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function active(user,role){const row=db.prepare('SELECT * FROM users WHERE id=?').get(user?.id);if(!row||row.role!==role||!row.is_active||row.archived_at||row.force_reset_password||row.auth_version!==(user.auth_version||0))fail('账号权限已变化',403);return row;}
function read(user,courseId){
 if(user.role!=='admin'&&!require('../helpers/courseScope').courseBelongsToMentor(user.id,courseId))fail('课程管理授权已失效',403);
 if(!db.prepare('SELECT 1 FROM courses WHERE id=?').get(courseId))fail('课程不存在',404);
 return{managers:db.prepare('SELECT m.*,u.username,u.real_name,u.is_active,a.real_name grantor_name,r.real_name revoker_name FROM course_managers m JOIN users u ON u.id=m.mentor_id LEFT JOIN users a ON a.id=m.granted_by LEFT JOIN users r ON r.id=m.revoked_by WHERE m.course_id=? ORDER BY m.active DESC,m.mentor_id').all(courseId),
 candidates:user.role==='admin'?db.prepare("SELECT id,username,real_name FROM users WHERE role='academic_mentor' AND is_active=1 AND archived_at IS NULL ORDER BY real_name,id").all():[],
 history:user.role==='admin'?db.prepare('SELECT e.*,u.real_name actor_name FROM course_manager_events e LEFT JOIN users u ON u.id=e.actor_id WHERE course_id=? ORDER BY id DESC LIMIT 100').all(courseId):[]};
}
function write(user,courseId,body){return db.transaction(()=>{
 active(user,'admin');if(Object.keys(body).some(k=>!['mentorId','active','expectedRevision','reason','request_key'].includes(k)))fail('授权字段无效');
 if(!Number.isSafeInteger(body.mentorId)||typeof body.active!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000))fail('请选择导师、填写原因并读取修订号');
 if(!db.prepare('SELECT 1 FROM courses WHERE id=?').get(courseId))fail('课程不存在',404);
 const identity=requests.identity(user,'course-managers:'+courseId,body);if(!identity)fail('缺少请求编号');const prior=requests.existing(db,identity);if(prior)return prior;
 const target=db.prepare("SELECT * FROM users WHERE id=? AND role='academic_mentor'").get(body.mentorId);if(!target||(body.active&&(!target.is_active||target.archived_at)))fail('导师不存在或已停用');
 const old=db.prepare('SELECT * FROM course_managers WHERE course_id=? AND mentor_id=?').get(courseId,body.mentorId);if((old?.revision||0)!==body.expectedRevision)fail('授权已被其他管理员修改，请核对最新状态，输入已保留',409);
 db.prepare(`INSERT INTO course_managers(course_id,mentor_id,source,granted_by,active) VALUES(?,?,'admin',?,?) ON CONFLICT(course_id,mentor_id) DO UPDATE SET active=excluded.active,source='admin',revision=course_managers.revision+1,granted_by=CASE WHEN excluded.active=1 THEN excluded.granted_by ELSE course_managers.granted_by END,granted_at=CASE WHEN excluded.active=1 THEN CURRENT_TIMESTAMP ELSE course_managers.granted_at END,revoked_by=CASE WHEN excluded.active=0 THEN excluded.granted_by ELSE NULL END,revoked_at=CASE WHEN excluded.active=0 THEN CURRENT_TIMESTAMP ELSE NULL END`).run(courseId,body.mentorId,user.id,body.active?1:0);
 db.prepare('INSERT INTO course_manager_events(course_id,mentor_id,actor_id,action,reason) VALUES(?,?,?,?,?)').run(courseId,body.mentorId,user.id,body.active?'grant':'revoke',body.reason.trim().slice(0,1000));
 const result={saved:true,revision:(old?.revision||0)+1};requests.save(db,identity,result);
 require('./notificationService').safeCreateForUsers({eventKey:'course.management.changed',dedupeKey:'course.management:'+courseId+':'+body.mentorId+':'+result.revision,title:body.active?'课程管理已授权':'课程管理已撤销',content:'课程管理关系已变更；创建者及授课安排保持不变，请以当前课程授权为准。',category:'course',actionUrl:body.active?'/courses/'+courseId:'/courses',createdBy:user.id},[body.mentorId]);return result;
 }).immediate();}
module.exports={read,write,active,fail};
