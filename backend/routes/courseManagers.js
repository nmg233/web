const router=require('express').Router({mergeParams:true}),s=require('../services/courseManagers'),{requireRole}=require('../middleware/auth');
router.get('/',(req,res,next)=>{try{res.set('Cache-Control','no-store').json(s.read(req.user,req.params.id));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
router.post('/',requireRole('admin'),(req,res,next)=>{try{res.set('Cache-Control','no-store').json(s.write(req.user,req.params.id,req.body));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
module.exports=router;
