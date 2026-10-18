const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {canManageCourse}=require('../policies/coursePolicy');
const {contentRevision}=require('../helpers/contentRevision');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function managed(db,user,courseId,write=false){
 const account=db.prepare('SELECT role,is_active,archived_at,force_reset_password FROM users WHERE id=?').get(user?.id);if(!account?.is_active||account.archived_at||account.force_reset_password||account.role!==user.role)fail('维护账号权限已变化',403);
 const course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
 if(!canManageCourse(user,course,db))fail('课程不存在或无维护权限',404);
 if(write&&course.status==='archived')fail('课程已归档，关卡图片只读',409);return course;
}
function imageBytes(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>5*1024*1024)fail('图片不能超过5MB');
 const mime=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'image/jpeg':buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime];
 if(!ext||!require('./coverImageValidation').validateCover(buffer,ext))fail('仅支持结构有效的PNG/JPEG/WebP，最大1600万像素');
 return {mime,ext,digest:crypto.createHash('sha256').update(buffer).digest('hex')};
}
function upload(db,user,courseId,lessonId,buffer,key,uploadRoot){
 managed(db,user,courseId,true);if(!/^[\w-]{8,100}$/.test(key||''))fail('上传编号无效');
 if(lessonId&&!db.prepare("SELECT 1 FROM lessons WHERE id=? AND course_id=? AND status!='cancelled'").get(lessonId,courseId))fail('课时不属于此课程或已取消',404);
 const {mime,ext,digest}=imageBytes(buffer),old=db.prepare('SELECT * FROM lesson_map_images WHERE uploaded_by=? AND course_id=? AND upload_key=?').get(user.id,courseId,key);
 if(old){if(old.digest!==digest||String(old.lesson_id||'')!==String(lessonId||''))fail('上传编号已用于其他文件或课时',409);return dto(old);}
 const id=crypto.randomUUID(),root=path.resolve(uploadRoot,'lesson-map-images');fs.mkdirSync(root,{recursive:true});const file=path.join(root,id+ext);fs.writeFileSync(file,buffer,{flag:'wx'});
 try{db.prepare('INSERT INTO lesson_map_images(id,course_id,lesson_id,uploaded_by,upload_key,digest,file_path,mime_type) VALUES(?,?,?,?,?,?,?,?)').run(id,courseId,lessonId||null,user.id,key,digest,file,mime);}catch(e){fs.unlinkSync(file);throw e;}return dto(db.prepare('SELECT * FROM lesson_map_images WHERE id=?').get(id));
}
function dto(row){return{id:row.id,url:`/api/courses/${row.course_id}/map-images/${row.id}`,digest:row.digest};}
function fields(db,courseId,lessonId,body){
 const data={};
 if(Object.hasOwn(body,'map_image_id')){
  const id=body.map_image_id;if(id!==null&&(typeof id!=='string'||!id.trim()))fail('关卡图片引用无效');
  if(id){const image=db.prepare('SELECT * FROM lesson_map_images WHERE id=? AND course_id=?').get(id,courseId);if(!image||(image.lesson_id&&Number(image.lesson_id)!==Number(lessonId)))fail('图片不属于本课时',409);}data.map_image_id=id;
 }
 for(const name of ['landing_x','landing_y'])if(Object.hasOwn(body,name)){const value=body[name];if(typeof value!=='number'||!Number.isFinite(value)||value<0.1||value>0.9)fail('角色站位须在0.1至0.9之间');data[name]=value;}
 if(Object.hasOwn(body,'map_art_preset')){
  if(require('./publicThemes').nodes[body.map_art_preset]){const course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!require('./publicThemes').registry.themes[require('./publicThemes').effective(course)]?.nodes.some(n=>n.id===body.map_art_preset))fail('默认图不属于当前课程公共主题');data.map_art_preset=body.map_art_preset;}
  else if(body.map_art_preset==='rock')data.map_art_preset='rock';
  else{const existing=lessonId&&db.prepare('SELECT map_art_preset FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId);if(!existing||body.map_art_preset!==existing.map_art_preset)fail('只能保留存量题材或显式恢复岩石默认图');}
 }
 return data;
}
function bind(db,lesson){if(lesson.map_image_id)db.prepare('UPDATE lesson_map_images SET lesson_id=? WHERE id=? AND lesson_id IS NULL').run(lesson.id,lesson.map_image_id);}
function canRead(db,user,courseId,image){
 const course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!course||!image||image.course_id!==Number(courseId))return false;
 if(canManageCourse(user,course,db))return true;
 return user?.role==='student'&&course.status==='published'&&Boolean(db.prepare("SELECT 1 FROM enrollments e JOIN lessons l ON l.course_id=e.course_id WHERE e.student_id=? AND e.course_id=? AND e.status='active' AND l.status!='cancelled' AND l.map_image_id=?").get(user.id,courseId,image.id));
}
module.exports={managed,imageBytes,upload,dto,fields,bind,canRead,fail,contentRevision};
