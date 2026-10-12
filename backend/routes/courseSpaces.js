const express = require('express');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { activeCourse, matchesSpace, bodyMatchesSpace } = require('../helpers/studentCourseAccess');
const router = express.Router({mergeParams:true});
router.use(requireAuth, requirePasswordChanged, requireRole('student'));
router.use((req,res,next)=>{
  const id=req.params.courseId;
  const allowed = /^\/(?:courses(?:\/\d+(?:\/replays)?|\/(?:resources\/\d+\/download|replays\/\d+\/stream-url))?|tasks(?:\/\d+)?|works(?:\/(?:upload-options|pending-tasks|\d+(?:\/download)?))?|archives\/(?:generate|reflection)|learning\/(?:lessons\/\d+(?:\/(?:review-complete|report))?|cards\/\d+\/complete|exercises\/\d+\/submit)|glider\/(?:simulate|capabilities|simulations(?:\/\d+(?:\/(?:files\/[^/]+|stream-url|trace))?)?)|dashboard\/ai\/(?:courses|ask))\/?$/.test(req.path);
  if(!allowed && req.path!=='/preferences/avatar')return res.status(404).json({error:'课程空间不提供此入口'});
  const denied=()=>res.status(404).json({error:'当前课程或对象已不可访问',code:'COURSE_SCOPE_DENIED'});
  if(!/^\d+$/.test(id)||!activeCourse(req.user.id,id))return denied();
  req.courseSpace=Number(id);
  if((req.query.course_id && String(req.query.course_id)!==id)||!bodyMatchesSpace(req))return denied();
  const checks=[[/^\/works\/(\d+)(?:\/|$)/,'work'],[/^\/tasks\/(\d+)(?:\/|$)/,'task'],[/^\/glider\/simulations\/(\d+)(?:\/|$)/,'simulation'],[/^\/learning\/lessons\/(\d+)(?:\/|$)/,'lesson'],[/^\/learning\/cards\/(\d+)(?:\/|$)/,'card'],[/^\/learning\/exercises\/(\d+)(?:\/|$)/,'exercise'],[/^\/courses\/resources\/(\d+)(?:\/|$)/,'resource'],[/^\/courses\/replays\/(\d+)(?:\/|$)/,'replay']];
  for(const [pattern,kind] of checks){const m=req.path.match(pattern);if(m&&!matchesSpace(req,kind,m[1]))return denied();}
  const course=req.path.match(/^\/courses\/(\d+)(?:\/|$)/);if(course&&course[1]!==id)return denied();
  if(req.path==='/glider/simulate'||req.path==='/dashboard/ai/ask')req.body={...req.body,course_id:req.courseSpace};
  // 复用现有控制器的业务处理，集合在服务器响应前按真实归属收窄。
  const json=res.json.bind(res);
  res.json=body=>{
    if(res.statusCode<400&&body&&typeof body==='object'){
      for(const key of ['courses','courseOptions','enrollments'])if(Array.isArray(body[key]))body[key]=body[key].filter(row=>String(row.course_id??row.id)===id);
      if(Array.isArray(body.tasks))body.tasks=body.tasks.filter(row=>row.course_id!=null?String(row.course_id)===id:matchesSpace(req,'task',row.id));
      if(Array.isArray(body.works))body.works=body.works.filter(row=>matchesSpace(req,'work',row.id));
    }
    return json(body);
  };
  next();
});
router.use('/preferences',require('./coursePreferences'));
for(const [url,module] of [['courses','courses'],['tasks','tasks'],['works','works'],['archives','archives'],['learning','learning'],['glider','gliders'],['dashboard','dashboard']])router.use('/'+url,require('./'+module));
module.exports=router;
