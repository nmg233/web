const router=require('express').Router(),db=require('../config/database'),s=require('../services/rewardRedemptions');
const {requireAuth,requirePasswordChanged,requireRole}=require('../middleware/auth');
const multer=require('multer'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {fields,invalid}=require('../services/studentRewards');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2}}).single('image');
const root=path.resolve(__dirname,'..',process.env.UPLOAD_PATH||'uploads','reward-images');
router.use(requireAuth,requirePasswordChanged,(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const action=fn=>(req,res,next)=>{try{res.json(fn(req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
const student=requireRole('student'),admin=requireRole('admin','academic_mentor'),scope=require('../helpers/courseRewardScope');
const course=req=>{const id=req.query.courseId??req.body?.courseId;if(id==null)return null;if(!/^\d{1,12}$/.test(String(id))||Number(id)<1)invalid('课程编号无效');return Number(id);};
router.get('/gifts',student,action(req=>{fields(req.query,['courseId']);return s.catalog(req.user.id,course(req));}));
router.get('/orders',student,action(req=>{fields(req.query,['page','courseId']);return s.orders(req.user.id,req.query);}));
router.post('/orders',student,action(req=>s.redeem(req.user.id,req.body)));
router.get('/management/gifts',admin,action(req=>{fields(req.query,['courseId']);return s.managedGifts(req.user.id,course(req));}));
router.post('/management/gifts',admin,action(req=>s.saveGift(req.user.id,null,req.body)));
router.put('/management/gifts/:id',admin,action(req=>s.saveGift(req.user.id,req.params.id,req.body)));
router.get('/management/orders',admin,action(req=>{fields(req.query,['page','courseId']);return s.orders(null,req.query,req.user.id);}));
router.get('/management/orders/:id',admin,action(req=>{fields(req.query,['courseId']);return s.managedOrder(req.user.id,req.params.id,req.query.courseId);}));
router.post('/management/orders/:id/fulfill',admin,action(req=>s.fulfill(req.user.id,req.params.id,req.body)));
router.get('/management/notifications',admin,action(req=>{fields(req.query,['courseId']);return s.notificationState(req.user.id,course(req));}));
router.post('/management/notifications/retry',admin,action(req=>{fields(req.body,['courseId']);scope.manage(req.user.id,course(req));s.flushNotifications(req.user.id,course(req));return s.notificationState(req.user.id,course(req));}));
router.post('/management/images',admin,upload,action(req=>{
 const courseId=course(req);scope.writable(req.user.id,courseId);
 fields(req.body,['requestKey','courseId']);const requestKey=s.key(req.body.requestKey),file=req.file;if(!file)invalid('请选择一张 PNG、JPEG 或 WebP 图片');
 const b=file.buffer,mime=b.length>=12&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!mime)invalid('图片格式无效，仅支持 PNG、JPEG、WebP');
 if(!require('../services/coverImageValidation').validateCover(b,{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]))invalid('图片结构无效或超过1600万像素');
 const digest=createHash('sha256').update(b).digest('hex'),old=db.prepare('SELECT * FROM reward_images WHERE uploaded_by=? AND upload_key=?').get(req.user.id,requestKey);
 if(old){if(old.course_id!==courseId)invalid('同一上传请求不能更换课程',409);if(old.digest!==digest)invalid('同一上传编号不能更换图片',409);return {id:old.id,image_url:'/api/reward-shop/images/'+old.id};}
 fs.mkdirSync(root,{recursive:true});const id=randomUUID(),target=path.join(root,id+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]));
 fs.writeFileSync(target,b,{flag:'wx'});
 try{db.prepare('INSERT INTO reward_images(id,uploaded_by,upload_key,digest,file_path,mime_type,course_id) VALUES(?,?,?,?,?,?,?)').run(id,req.user.id,requestKey,digest,target,mime,courseId);}catch(e){fs.unlinkSync(target);throw e;}
 return {id,image_url:'/api/reward-shop/images/'+id};
}));
router.get('/images/:id',requireRole('admin','academic_mentor','student'),(req,res,next)=>{try{
 const image=db.prepare('SELECT * FROM reward_images WHERE id=?').get(req.params.id);if(!image)return res.status(404).json({error:'图片不存在'});
 const visible=scope.imageVisible(req.user,image.id);
 if(!visible)return res.status(404).json({error:'图片当前不可访问'});
 if(!fs.existsSync(image.file_path))return res.status(404).json({error:'图片文件不存在，请联系管理员'});
 res.type(image.mime_type);res.sendFile(path.resolve(image.file_path));
 }catch(e){next(e);}});
router.post('/management/gifts/:id/bind-course',admin,action(req=>require('../services/courseBadges').bind(req.user.id,req.params.id,req.body)));
router.use((err,req,res,next)=>{if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'图片超过5MB，请重新选择':'请只上传一张图片及有效课程字段'});next(err);});
module.exports=router;
