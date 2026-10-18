const db=require('../config/database');
const {courseBelongsToMentor}=require('./courseScope');
function fail(message,status=404){throw Object.assign(new Error(message),{status});}
function actor(id){const u=db.prepare('SELECT * FROM users WHERE id=? AND is_active=1 AND archived_at IS NULL AND force_reset_password=0').get(id);if(!u||!['admin','academic_mentor'].includes(u.role))fail('当前账号没有奖励管理权限',403);return u;}
function manage(id,courseId){const u=actor(id);if(courseId==null){if(u.role!=='admin')fail('存量未归属奖励仅管理员可核对',403);return null;}const c=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!c||u.role!=='admin'&&!courseBelongsToMentor(u.id,c.id,db))fail('课程不存在或已不在负责范围');return c;}
function accessible(student,course){return !!db.prepare("SELECT 1 FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE c.id=? AND c.status='published' AND e.student_id=? AND e.status='active'").get(course,student);}
function courses(student){return db.prepare("SELECT c.id,c.title FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.student_id=? AND e.status='active' AND c.status='published' ORDER BY c.id").all(student);}
function imageManage(id,imageId,courseId){const c=manage(id,courseId),im=db.prepare('SELECT * FROM reward_images WHERE id=?').get(imageId);if(!im)fail('图片不存在');if(im.course_id===c?.id||im.course_id==null&&actor(id).role==='admin'&&courseId==null)return im;
 if(c&&db.prepare('SELECT 1 FROM reward_gifts WHERE image_id=? AND course_id=?').get(imageId,c.id))return im;fail('图片不属于当前课程');}
function imageVisible(user,imageId){if(user.role==='admin')return true;if(user.role==='academic_mentor'){const im=db.prepare('SELECT course_id FROM reward_images WHERE id=?').get(imageId);if(im?.course_id&&courseBelongsToMentor(user.id,im.course_id,db))return true;return db.prepare('SELECT course_id FROM reward_gifts WHERE image_id=? AND course_id IS NOT NULL').all(imageId).some(g=>courseBelongsToMentor(user.id,g.course_id,db));}
 if(user.role!=='student')return false;
 if(db.prepare('SELECT 1 FROM reward_orders WHERE image_id=? AND student_id=? UNION ALL SELECT 1 FROM student_badge_grants WHERE image_id=? AND student_id=? LIMIT 1').get(imageId,user.id,imageId,user.id))return true;
 return !!db.prepare(`SELECT 1 FROM reward_gifts g JOIN courses c ON c.id=g.course_id JOIN enrollments e ON e.course_id=c.id WHERE g.image_id=? AND g.published=1 AND c.status='published' AND e.student_id=? AND e.status='active' UNION ALL SELECT 1 FROM lesson_badge_definitions b JOIN lessons l ON l.id=b.lesson_id JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE b.image_id=? AND b.enabled=1 AND trim(b.name)!='' AND trim(b.description)!='' AND l.status!='cancelled' AND c.lesson_badges_enabled=1 AND c.status='published' AND e.student_id=? AND e.status='active' LIMIT 1`).get(imageId,user.id,imageId,user.id);
}
module.exports={actor,manage,accessible,courses,imageManage,imageVisible,fail};
