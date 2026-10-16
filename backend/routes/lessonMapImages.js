const router=require('express').Router({mergeParams:true}),db=require('../config/database'),s=require('../services/lessonMapImages'),multer=require('multer'),fs=require('node:fs'),path=require('node:path');
const {requireRole}=require('../middleware/auth');
const parser=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2}}).single('image');
router.post('/',requireRole('admin','academic_mentor'),(req,res,next)=>{try{s.managed(db,req.user,req.params.id,true);next();}catch(e){res.status(e.status||400).json({error:e.message});}},parser,(req,res,next)=>{
 try{if(!req.file)s.fail('请选择关卡图片');if(Object.keys(req.body).some(k=>!['lessonId','requestKey'].includes(k)))s.fail('上传字段无效');s.managed(db,req.user,req.params.id,true);res.json(s.upload(db,req.user,req.params.id,req.body.lessonId||null,req.file.buffer,req.body.requestKey,path.resolve(__dirname,'..',process.env.UPLOAD_PATH||'uploads')));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}
});
router.get('/:imageId',(req,res,next)=>{try{const image=db.prepare('SELECT * FROM lesson_map_images WHERE id=?').get(req.params.imageId);res.set('Cache-Control','private, no-store');if(!s.canRead(db,req.user,req.params.id,image))return res.status(404).json({error:'关卡图片不存在或不可访问'});if(!fs.existsSync(image.file_path))return res.status(404).json({error:'关卡图片文件缺失'});res.type(image.mime_type).sendFile(path.resolve(image.file_path));}catch(e){next(e);}});
module.exports=router;
