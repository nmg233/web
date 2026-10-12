const router=require('express').Router(),db=require('../config/database'),s=require('../services/rewardRedemptions');
const {requireAuth,requirePasswordChanged,requireRole}=require('../middleware/auth');
const multer=require('multer'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {fields,invalid}=require('../services/studentRewards');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:1}}).single('image');
const root=path.resolve(__dirname,'..',process.env.UPLOAD_PATH||'uploads','reward-images');
router.use(requireAuth,requirePasswordChanged,(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const action=fn=>(req,res,next)=>{try{res.json(fn(req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
const student=requireRole('student'),admin=requireRole('admin');
router.get('/gifts',student,action(req=>{fields(req.query,[]);return s.catalog(req.user.id);}));
router.get('/orders',student,action(req=>{fields(req.query,['page']);return s.orders(req.user.id,req.query);}));
router.post('/orders',student,action(req=>s.redeem(req.user.id,req.body)));
router.get('/management/gifts',admin,action(()=>({gifts:db.prepare('SELECT * FROM reward_gifts ORDER BY id DESC').all().map(g=>s.giftDTO(g))})));
router.post('/management/gifts',admin,action(req=>s.saveGift(req.user.id,null,req.body)));
router.put('/management/gifts/:id',admin,action(req=>s.saveGift(req.user.id,req.params.id,req.body)));
router.get('/management/orders',admin,action(req=>{fields(req.query,['page']);return s.orders(null,req.query);}));
router.post('/management/orders/:id/fulfill',admin,action(req=>s.fulfill(req.user.id,req.params.id,req.body)));
router.get('/management/notifications',admin,action(()=>s.notificationState()));
router.post('/management/notifications/retry',admin,action(req=>{fields(req.body,[]);return s.flushNotifications();}));
router.post('/management/images',admin,upload,action(req=>{
 if(!db.prepare("SELECT 1 FROM users WHERE id=? AND role='admin' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(req.user.id))invalid('管理员权限已变化，请重新登录',403);
 fields(req.body,['requestKey']);const requestKey=s.key(req.body.requestKey),file=req.file;if(!file)invalid('请选择一张 PNG、JPEG 或 WebP 图片');
 const b=file.buffer,mime=b.length>=12&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!mime)invalid('图片格式无效，仅支持 PNG、JPEG、WebP');
 if(!require('../services/coverImageValidation').validateCover(b,{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]))invalid('图片结构无效或超过1600万像素');
 const digest=createHash('sha256').update(b).digest('hex'),old=db.prepare('SELECT * FROM reward_images WHERE uploaded_by=? AND upload_key=?').get(req.user.id,requestKey);
 if(old){if(old.digest!==digest)invalid('同一上传编号不能更换图片',409);return {id:old.id,image_url:'/api/reward-shop/images/'+old.id};}
 fs.mkdirSync(root,{recursive:true});const id=randomUUID(),target=path.join(root,id+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]));
 fs.writeFileSync(target,b,{flag:'wx'});
 try{db.prepare('INSERT INTO reward_images(id,uploaded_by,upload_key,digest,file_path,mime_type) VALUES(?,?,?,?,?,?)').run(id,req.user.id,requestKey,digest,target,mime);}catch(e){fs.unlinkSync(target);throw e;}
 return {id,image_url:'/api/reward-shop/images/'+id};
}));
router.get('/images/:id',requireRole('admin','student'),(req,res,next)=>{try{
 const image=db.prepare('SELECT * FROM reward_images WHERE id=?').get(req.params.id);if(!image)return res.status(404).json({error:'图片不存在'});
 const visible=req.user.role==='admin'||db.prepare('SELECT 1 FROM reward_gifts WHERE image_id=? AND published=1').get(image.id)||db.prepare('SELECT 1 FROM reward_orders WHERE image_id=? AND student_id=?').get(image.id,req.user.id);
 if(!visible)return res.status(404).json({error:'图片当前不可访问'});
 if(!fs.existsSync(image.file_path))return res.status(404).json({error:'图片文件不存在，请联系管理员'});
 res.type(image.mime_type);res.sendFile(path.resolve(image.file_path));
 }catch(e){next(e);}});
module.exports=router;
