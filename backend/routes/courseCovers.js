const router=require('express').Router({mergeParams:true});
const db=require('../config/database'),fs=require('fs'),path=require('path');
const {requireRole}=require('../middleware/auth');
const {uploadCover,validateUploadedFiles,UPLOAD_ROOT}=require('../middleware/upload');
const {removeFilesAfterCommit}=require('../helpers/fileLifecycle');
const {canManageCourse}=require('../policies/coursePolicy');
const {decodeOriginalName}=require('../helpers/fileName');
router.get('/',(req,res)=>{
 const c=db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
 const allowed=canManageCourse(req.user,c)||(req.user.role==='student'&&c?.status==='published'&&db.prepare("SELECT id FROM enrollments WHERE course_id=? AND student_id=? AND status='active'").get(c.id,req.user.id));
 if(!allowed)return res.status(404).json({error:'封面不可访问'});
 const file=db.prepare('SELECT * FROM course_covers WHERE course_id=?').get(c.id);if(!file)return res.status(404).json({error:'没有上传封面'});
 const absolute=path.resolve(file.file_path),rel=path.relative(UPLOAD_ROOT,absolute);
 if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(absolute))return res.status(404).json({error:'封面文件不存在'});
 res.set({'Content-Type':file.mime_type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.sendFile(absolute);
});
router.post('/',requireRole('admin','academic_mentor'),(req,res,next)=>{
 const c=db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
 if(!canManageCourse(req.user,c))return res.status(404).json({error:'无权管理当前课程'});
 if(c.status==='archived')return res.status(409).json({error:'课程已归档，不能上传'});next();
},uploadCover.single('file'),validateUploadedFiles,(req,res)=>{
 try{
  if(!req.file)return res.status(400).json({error:'请选择封面图片'});
  const b=fs.readFileSync(req.file.path),ext=path.extname(req.file.path);
  // Container checks beyond the existing upload magic; no arbitrary documents as covers.
  if(!require('../services/coverImageValidation').validateCover(b,ext))throw Object.assign(new Error('封面图片结构无效（最大 1600 万像素）'),{status:400});
  const old=db.prepare('SELECT file_path FROM course_covers WHERE course_id=?').get(req.params.id),url='/api/courses/'+req.params.id+'/cover?v='+require('crypto').randomUUID();
  db.transaction(()=>{db.prepare(`INSERT INTO course_covers(course_id,file_path,file_name,mime_type) VALUES(?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET file_path=excluded.file_path,file_name=excluded.file_name,mime_type=excluded.mime_type,updated_at=CURRENT_TIMESTAMP`).run(req.params.id,req.file.path,decodeOriginalName(req.file.originalname),{'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[ext]);db.prepare('UPDATE courses SET cover_image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(url,req.params.id);})();
  if(old)removeFilesAfterCommit([old.file_path],UPLOAD_ROOT);res.json({saved:true,id:Number(req.params.id),cover_image:url});
 }catch(e){if(req.file?.path)try{fs.unlinkSync(req.file.path);}catch{/* original retained */}res.status(e.status||500).json({error:e.message||'封面上传失败'});}
});
module.exports=router;
