const router=require('express').Router({mergeParams:true});
const db=require('../config/database');
const {requireRole}=require('../middleware/auth');
const {canManageCourse}=require('../policies/coursePolicy');
const v=require('../services/courseContentValidation');
const {courseDisplay}=require('../services/coursePresentation');
const {toFileDto}=require('../helpers/fileDto');
const path=require('path');
const {contentRevision:hash}=require('../helpers/contentRevision');
const revisionRow=(table,id)=>db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
const revisionDto=(table,row)=>({...row,content_revision:hash(revisionRow(table,row.id))});
function action(fn){return async(req,res,next)=>{try{res.json(await fn(req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'该来源已有关联，请修改已有记录'});next(e);}};}
router.use(requireRole('admin','academic_mentor'),(req,res,next)=>{
 const c=db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
 if(!canManageCourse(req.user,c))return res.status(404).json({error:'课程不存在或已不在负责范围'});
 if(req.method!=='GET'&&c.status==='archived')return res.status(409).json({error:'课程已归档，不能修改内容'});
 req.managedCourse=c;next();
});
function object(table,id,courseId){
 const row=table==='tasks'?db.prepare('SELECT t.*,l.course_id,l.status AS lesson_status FROM tasks t JOIN lessons l ON l.id=t.lesson_id WHERE t.id=? AND l.course_id=?').get(id,courseId):db.prepare(`SELECT * FROM ${table} WHERE id=? AND course_id=?`).get(id,courseId);
 if(!row)v.invalid('对象不属于当前课程',404);return row;
}
// Optional revision tokens preserve legacy callers; the visual editor always sends a known token.
router.use((req,res,next)=>{
 if(req.method!=='PUT'||req.body.expected_revision===undefined)return next();
 const expected=req.body.expected_revision;delete req.body.expected_revision;
 let current;const match=req.path.match(/^\/(lessons|tasks|resources|chapters|experiments|replays)\/(\d+)$/);
 const tables={lessons:'lessons',tasks:'tasks',resources:'resources',chapters:'course_chapters',experiments:'course_experiments',replays:'course_replays'};
 if(req.path==='/course')current=revisionRow('courses',req.params.id);
 else if(req.path==='/chapters/order')current=db.prepare('SELECT * FROM course_chapters WHERE course_id=? ORDER BY sort_order,id').all(req.params.id);
 else if(req.path==='/plan')current=db.prepare('SELECT * FROM course_plan_nodes WHERE course_id=? ORDER BY position').all(req.params.id);
 else if(match){const row=object(tables[match[1]],match[2],req.params.id);current=revisionRow(tables[match[1]],row.id);}
 if(!current||typeof expected!=='string'||hash(current)!==expected)return res.status(409).json({error:'内容已由其他维护者修改，请重新读取并核对后保存'});
 next();
});
function fields(body,allowed){if(Object.keys(body).some(k=>!allowed.includes(k)))v.invalid('包含不可修改字段');}
function update(table,id,data){const entries=Object.entries(data);if(!entries.length)v.invalid('没有需要修改的内容');db.prepare(`UPDATE ${table} SET ${entries.map(([k])=>k+'=?').join(',')} WHERE id=?`).run(...entries.map(([,value])=>value),id);return{id,saved:true,content_revision:hash(revisionRow(table,id))};}
router.get('/',action(req=>{
 const id=req.params.id,display=courseDisplay(id);
 const resources=db.prepare(`SELECT r.*,a.status AS ai_status,a.error_message AS ai_error FROM resources r LEFT JOIN ai_documents a ON a.resource_id=r.id WHERE r.course_id=? ORDER BY r.id DESC`).all(id).map(r=>toFileDto({...r,file_name:r.file_name||r.title,file_type:r.file_type||path.extname(r.file_path||'').slice(1)}));
 return {...display,chapters:display.chapters.map(r=>revisionDto('course_chapters',r)),chapters_revision:hash(db.prepare('SELECT * FROM course_chapters WHERE course_id=? ORDER BY sort_order,id').all(id)),experiments:display.experiments.map(r=>revisionDto('course_experiments',r)),course:revisionDto('courses',req.managedCourse),resources:resources.map(r=>revisionDto('resources',r)),plan_revision:hash(db.prepare('SELECT * FROM course_plan_nodes WHERE course_id=? ORDER BY position').all(id)),teachers:db.prepare("SELECT id,real_name FROM users WHERE role='academic_mentor' AND is_active=1 ORDER BY real_name").all(),
  lessons:db.prepare('SELECT * FROM lessons WHERE course_id=? ORDER BY sort_order,id').all(id).map(r=>revisionDto('lessons',r)),
  tasks:db.prepare('SELECT t.* FROM tasks t JOIN lessons l ON l.id=t.lesson_id WHERE l.course_id=? ORDER BY t.id').all(id).map(r=>revisionDto('tasks',r)),
  cards:db.prepare('SELECT k.id,k.lesson_id,k.title,k.status FROM knowledge_cards k JOIN lessons l ON l.id=k.lesson_id WHERE l.course_id=? ORDER BY k.sort_order,k.id').all(id),
  replays:db.prepare('SELECT id,course_id,lesson_id,title,description,duration_seconds,recording_date,sort_order FROM course_replays WHERE course_id=? ORDER BY sort_order,id').all(id).map(r=>revisionDto('course_replays',r))};
}));
router.get('/badges',action(req=>({definitions:db.prepare('SELECT b.* FROM lesson_badge_definitions b JOIN lessons l ON l.id=b.lesson_id WHERE l.course_id=? ORDER BY l.sort_order,l.id').all(req.params.id)})));
router.put('/badges/:lessonId',action(req=>{
 const row=object('lessons',req.params.lessonId,req.params.id);if(row.status==='cancelled')v.invalid('课时已取消',409);
 fields(req.body,['name','artId','description']);if(!['vr','theory','glider'].includes(req.body.artId))v.invalid('请选择受控徽章素材');
 const name=v.text(req.body.name,'徽章名称',60,true),description=v.text(req.body.description,'徽章说明',500)||'';
 db.prepare('INSERT INTO lesson_badge_definitions(lesson_id,name,art_id,description) VALUES(?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET name=excluded.name,art_id=excluded.art_id,description=excluded.description,updated_at=CURRENT_TIMESTAMP').run(row.id,name,req.body.artId,description);return {saved:true,lessonId:row.id};
}));
router.put('/course',(req,res,next)=>{const json=res.json.bind(res);res.json=value=>json(res.statusCode<400?{...value,id:Number(req.params.id),content_revision:hash(revisionRow('courses',req.params.id))}:value);c.update(req,res,next);});
router.post('/chapters',action(req=>{
 fields(req.body,['title']);const title=v.text(req.body.title,'章节名称',120,true);
 const n=db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM course_chapters WHERE course_id=?').get(req.params.id).n;
 const r=db.prepare('INSERT INTO course_chapters(course_id,title,sort_order) VALUES(?,?,?)').run(req.params.id,title,n);return{id:Number(r.lastInsertRowid),saved:true,content_revision:hash(revisionRow('course_chapters',r.lastInsertRowid))};
}));
router.put('/chapters/order',action(req=>{
 fields(req.body,['ids']);const ids=req.body.ids,existing=db.prepare('SELECT id FROM course_chapters WHERE course_id=?').all(req.params.id).map(r=>r.id);
 if(!Array.isArray(ids)||ids.length!==existing.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||!existing.includes(id)))v.invalid('排序必须包含当前课程全部章节且不能重复');
 db.transaction(()=>ids.forEach((id,i)=>db.prepare('UPDATE course_chapters SET sort_order=? WHERE id=? AND course_id=?').run(i+1,id,req.params.id)))();return{saved:true};
}));
router.put('/chapters/:chapterId',action(req=>{object('course_chapters',req.params.chapterId,req.params.id);fields(req.body,['title']);return update('course_chapters',req.params.chapterId,{title:v.text(req.body.title,'章节名称',120,true)});}));
router.delete('/chapters/:chapterId',action(req=>{
 object('course_chapters',req.params.chapterId,req.params.id);
 if(db.prepare('SELECT id FROM lessons WHERE chapter_id=? LIMIT 1').get(req.params.chapterId))v.invalid('请先将本章课时移到其他章节或未分组，再删除空章节',409);
 db.prepare('DELETE FROM course_chapters WHERE id=?').run(req.params.chapterId);return{deleted:true};
}));
router.put('/lessons/:lessonId',action(req=>{
 const row=object('lessons',req.params.lessonId,req.params.id);if(row.status==='cancelled')v.invalid('课时已取消，不能修改教学内容',409);
 fields(req.body,['title','description','teaching_tip','chapter_id','presentation_type','content_state','article_url','article_title','moments_note','review_content','report_guidance','experiment_guidance','article_blocks','duration','sort_order','start_at','end_at','location','instructor_id']);const data={};
 for(const [key,max,required]of[['title',120,true],['description',10000,false],['teaching_tip',2000,false]])if(v.own(req.body,key))data[key]=v.text(req.body[key],key,max,required);
 for(const [key,values]of [['presentation_type',['learning','visit','theory','experiment']],['content_state',['ready','preparing']]])if(v.own(req.body,key)){if(!values.includes(req.body[key]))v.invalid('课时模板状态无效');data[key]=req.body[key];}
 for(const [key,max]of [['article_title',120],['moments_note',10000],['review_content',10000],['report_guidance',10000],['experiment_guidance',10000]])if(v.own(req.body,key))data[key]=v.text(req.body[key],key,max);
 if(v.own(req.body,'article_blocks'))data.article_blocks=JSON.stringify(require('../services/articleBlocks').validate(req.body.article_blocks,req.params.id,row.id));
 if(v.own(req.body,'article_url')){const value=v.text(req.body.article_url,'文章地址',2000);if(value){let url;try{url=new URL(value);}catch{v.invalid('文章地址无效');}if(url.protocol!=='https:'||url.username||url.password)v.invalid('文章地址须为 HTTPS');}data.article_url=value;}
 for(const key of ['duration','sort_order'])if(v.own(req.body,key))data[key]=v.integer(req.body[key],key,{nullable:key==='duration',max:10000});
 if(v.own(req.body,'location'))data.location=v.text(req.body.location,'地点',500);
 for(const key of ['start_at','end_at'])if(v.own(req.body,key)){const value=v.text(req.body[key],key,40);if(value&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||Number.isNaN(Date.parse(value))))v.invalid('日期时间格式无效');data[key]=value;}
 const start=data.start_at===undefined?row.start_at:data.start_at,end=data.end_at===undefined?row.end_at:data.end_at;
 if(start&&end&&Date.parse(end)<Date.parse(start))v.invalid('结束时间不能早于开始时间');
 if(v.own(req.body,'instructor_id')){const teacher=v.integer(req.body.instructor_id,'授课人',{nullable:true,min:1});if(teacher&&!db.prepare("SELECT id FROM users WHERE id=? AND role='academic_mentor' AND is_active=1").get(teacher))v.invalid('授课人不存在或不可用');data.instructor_id=teacher;}
 if(v.own(req.body,'chapter_id'))data.chapter_id=v.chapterId(req.body.chapter_id,req.params.id);return update('lessons',row.id,data);
}));
router.put('/plan',action(req=>{
 fields(req.body,['nodes']);const nodes=req.body.nodes;
 if(!Array.isArray(nodes)||!nodes.length||nodes.length>100)v.invalid('地图节点无效');
 const positions=new Set(),lessons=new Set();
 const rows=nodes.map(n=>{fields(n,['position','lessonId']);const position=v.integer(n.position,'关卡编号',{min:1,max:100}),lessonId=v.lessonId(n.lessonId,req.params.id);if(positions.has(position)||(lessonId&&lessons.has(lessonId)))v.invalid('关卡编号和课时不能重复');positions.add(position);if(lessonId)lessons.add(lessonId);return{position,lessonId};});
 db.transaction(()=>{db.prepare('DELETE FROM course_plan_nodes WHERE course_id=?').run(req.params.id);const insert=db.prepare('INSERT INTO course_plan_nodes(course_id,position,lesson_id,state) VALUES(?,?,?,?)');for(const n of rows)insert.run(req.params.id,n.position,n.lessonId,n.lessonId?'linked':'preparing');db.prepare("UPDATE courses SET map_mode='plan' WHERE id=?").run(req.params.id);})();return{saved:true,plan_revision:hash(db.prepare('SELECT * FROM course_plan_nodes WHERE course_id=? ORDER BY position').all(req.params.id))};
}));
router.put('/tasks/:taskId',action(req=>{
 const row=object('tasks',req.params.taskId,req.params.id);if(row.lesson_status==='cancelled'||row.status!=='active')v.invalid('任务或课时已取消，不能修改',409);
 fields(req.body,['title','description']);const data={};for(const[key,max,required]of[['title',120,true],['description',10000,false]])if(v.own(req.body,key))data[key]=v.text(req.body[key],key,max,required);return update('tasks',row.id,data);
}));
function experiment(body,courseId){
 fields(body,['experiment','lessonId','stage','cardId','label','enabled']);if(body.experiment!=='glider')v.invalid('仅支持已有滑翔机模块');
 const lesson=v.lessonId(body.lessonId,courseId),stage=v.integer(body.stage,'学习阶段',{nullable:true,max:3}),card=v.integer(body.cardId,'卡片',{min:1,nullable:true});
 if(!lesson&&(stage!=null||card))v.invalid('自由入口不能指定学习阶段或卡片');
 if(card&&(stage!==1||!db.prepare('SELECT id FROM knowledge_cards WHERE id=? AND lesson_id=?').get(card,lesson)))v.invalid('卡片必须属于所选课时，且阶段为知识卡片');
 if(body.enabled!==undefined&&typeof body.enabled!=='boolean')v.invalid('启用状态无效');
 return {experiment_id:'glider',lesson_id:lesson,stage,card_id:card,label:v.text(body.label,'关联名称',120,true),enabled:body.enabled===false?0:1};
}
router.post('/experiments',action(req=>{const data=experiment(req.body,req.params.id),r=db.prepare(`INSERT INTO course_experiments(course_id,${Object.keys(data).join(',')}) VALUES(${Array(Object.keys(data).length+1).fill('?').join(',')})`).run(req.params.id,...Object.values(data));return{id:Number(r.lastInsertRowid),saved:true,content_revision:hash(revisionRow('course_experiments',r.lastInsertRowid))};}));
router.put('/experiments/:experimentId',action(req=>{const row=object('course_experiments',req.params.experimentId,req.params.id);return update('course_experiments',row.id,experiment(req.body,req.params.id));}));
router.delete('/experiments/:experimentId',action(req=>{const row=object('course_experiments',req.params.experimentId,req.params.id);db.prepare('DELETE FROM course_experiments WHERE id=?').run(row.id);return{deleted:true};}));
router.put('/resources/:resourceId',action(req=>{
 const row=object('resources',req.params.resourceId,req.params.id);fields(req.body,['title','description','lesson_id','resource_type','display_order']);const data={};
 if(v.own(req.body,'title'))data.title=v.text(req.body.title,'资料名称',120,true);
 if(v.own(req.body,'description'))data.description=v.text(req.body.description,'资料说明',10000);
 if(v.own(req.body,'lesson_id')){data.lesson_id=v.lessonId(req.body.lesson_id,req.params.id);if(data.lesson_id!==row.lesson_id&&db.prepare("SELECT l.id FROM lessons l,json_each(l.article_blocks) b WHERE json_extract(b.value,'$.resourceId')=? LIMIT 1").get(row.id))v.invalid('图片正在文章中使用，请先移除文章引用再更改归属',409);}
 if(v.own(req.body,'display_order'))data.display_order=v.integer(req.body.display_order,'图片/资料排序',{max:10000});
 if(v.own(req.body,'resource_type')){if(!['lesson_plan','guide_card','template','courseware','video','other'].includes(req.body.resource_type))v.invalid('资料类型无效');data.resource_type=req.body.resource_type;}
 return update('resources',row.id,data);
}));
// Nested old operations also check path course before delegating.
const c=require('../controllers/courseController');
router.get('/resources/:resourceId/download',(req,res,next)=>{try{object('resources',req.params.resourceId,req.params.id);req.params.resource_id=req.params.resourceId;c.downloadResource(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
router.delete('/resources/:resourceId',(req,res,next)=>{try{object('resources',req.params.resourceId,req.params.id);req.params.resource_id=req.params.resourceId;c.deleteResource(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
for(const [method,handler]of[['put',c.updateReplay],['delete',c.deleteReplay]])router[method]('/replays/:replayId',(req,res,next)=>{try{object('course_replays',req.params.replayId,req.params.id);if(method==='put'){const json=res.json.bind(res);res.json=value=>json(res.statusCode<400?{...value,id:Number(req.params.replayId),content_revision:hash(revisionRow('course_replays',req.params.replayId))}:value);}handler(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
module.exports=router;
