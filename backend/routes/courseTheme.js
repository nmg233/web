const router=require('express').Router({mergeParams:true});
const db=require('../config/database'),multer=require('multer'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {requireRole}=require('../middleware/auth'),images=require('../services/lessonMapImages'),{contentRevision}=require('../helpers/contentRevision');
const purposes=['cover','desktop','mobile','mark'];
const parser=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2}}).single('image');
const {dto}=require('../services/courseThemeImages'),selected=courseId=>require('../services/courseThemeImages').selected(db,courseId);
const write=(req,res,next)=>{try{images.managed(db,req.user,req.params.id,true);next();}catch(e){res.status(e.status||400).json({error:e.message});}};
router.post('/images',requireRole('admin','academic_mentor'),write,parser,(req,res,next)=>{
 try{
  images.managed(db,req.user,req.params.id,true);
  if(!req.file||!purposes.includes(req.body.purpose)||Object.keys(req.body).some(k=>!['purpose','requestKey'].includes(k))||!/^[\w-]{8,100}$/.test(req.body.requestKey||''))images.fail('请选择图片用途及有效上传编号');
  const {mime,ext,digest}=images.imageBytes(req.file.buffer);
  const existing=db.prepare('SELECT * FROM course_theme_images WHERE uploaded_by=? AND course_id=? AND upload_key=?').get(req.user.id,req.params.id,req.body.requestKey);
  if(existing){if(existing.digest!==digest||existing.purpose!==req.body.purpose)images.fail('上传编号已用于其他内容',409);return res.json(dto(existing));}
  const id=crypto.randomUUID(),dir=path.resolve(__dirname,'..',process.env.UPLOAD_PATH||'uploads','course-themes');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id+ext);fs.writeFileSync(file,req.file.buffer,{flag:'wx'});
  try{db.prepare('INSERT INTO course_theme_images(id,course_id,purpose,uploaded_by,upload_key,digest,file_path,mime_type) VALUES(?,?,?,?,?,?,?,?)').run(id,req.params.id,req.body.purpose,req.user.id,req.body.requestKey,digest,file,mime);}catch(e){fs.unlinkSync(file);throw e;}
  res.json(dto(db.prepare('SELECT * FROM course_theme_images WHERE id=?').get(id)));
 }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}
});
router.put('/',requireRole('admin','academic_mentor'),write,(req,res,next)=>{
 try{
  const result=db.transaction(()=>{
   const course=images.managed(db,req.user,req.params.id,true),b=req.body;
   if(b.expected_revision!==contentRevision(course))images.fail('课程已更新，请重新读取并核对主题',409);
   if(Object.keys(b).some(k=>!['expected_revision','images','preset','opacity'].includes(k))||!['campus','voyage'].includes(b.preset)||typeof b.opacity!=='number'||!Number.isFinite(b.opacity)||b.opacity<0||b.opacity>1||!b.images||typeof b.images!=='object'||Array.isArray(b.images))images.fail('主题设置无效');
   for(const [purpose,id]of Object.entries(b.images)){
    if(!purposes.includes(purpose))images.fail('素材用途无效');
    if(id!==null&&!db.prepare('SELECT 1 FROM course_theme_images WHERE id=? AND course_id=? AND purpose=?').get(id,req.params.id,purpose))images.fail('素材不属于当前课程或用途',404);
    if(id===null)db.prepare('DELETE FROM course_theme_bindings WHERE course_id=? AND purpose=?').run(req.params.id,purpose);
    else db.prepare('INSERT INTO course_theme_bindings(course_id,purpose,image_id) VALUES(?,?,?) ON CONFLICT(course_id,purpose) DO UPDATE SET image_id=excluded.image_id').run(req.params.id,purpose,id);
   }
   const cover=selected(req.params.id).cover;
   // Only an explicitly changed cover changes the legacy cover field. No file is deleted.
   db.prepare('UPDATE courses SET presentation_theme=?,background_opacity=?,cover_image=?,theme_revision=theme_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.preset,b.opacity,Object.hasOwn(b.images,'cover')?cover?.url||null:course.cover_image,course.id);
   return{saved:true,images:selected(course.id),content_revision:contentRevision(db.prepare('SELECT * FROM courses WHERE id=?').get(course.id))};
  }).immediate();res.json(result);
 }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}
});
router.get('/images/:imageId',(req,res,next)=>{
 try{
  res.set('Cache-Control','private, no-store');const c=db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id),i=db.prepare('SELECT * FROM course_theme_images WHERE id=? AND course_id=?').get(req.params.imageId,req.params.id);
  const manager=c&&require('../policies/coursePolicy').canManageCourse(req.user,c,db);
  const student=c?.status==='published'&&req.user.role==='student'&&db.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'").get(req.user.id,c.id)&&i&&db.prepare('SELECT 1 FROM course_theme_bindings WHERE course_id=? AND image_id=?').get(c.id,i.id);
  if(!i||(!manager&&!student)||!fs.existsSync(i.file_path))return res.status(404).json({error:'主题图片不存在或不可访问'});
  res.type(i.mime_type).sendFile(path.resolve(i.file_path));
 }catch(e){next(e);}
});
module.exports=router;
