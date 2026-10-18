const router=require('express').Router(),{requireAuth,requirePasswordChanged,requireRole}=require('../middleware/auth'),service=require('../services/courseCustomization'),db=require('../config/database');
router.use(requireAuth,requirePasswordChanged,requireRole('admin','academic_mentor'));
const handle=fn=>(req,res,next)=>{try{res.set('Cache-Control','no-store').json(fn(req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
router.get('/qualifications',handle(req=>service.qualifications(req.user)));
router.post('/qualifications',requireRole('admin'),handle(req=>service.grant(req.user,req.body)));
router.get('/courses/:id/modules',handle(req=>{require('../services/lessonMapImages').managed(db,req.user,req.params.id);return service.config(req.params.id);}));
router.put('/courses/:id/modules',handle(req=>service.save(req.user,req.params.id,req.body)));
module.exports=router;
