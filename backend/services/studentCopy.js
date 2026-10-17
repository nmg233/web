const registry=require('../../content/student-copy/registry.json');
const own=(o,k)=>Object.hasOwn(o,k),fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function scope(db,value){
 if(value==='global')return value;
 const m=/^(course|lesson):([1-9]\d*)$/.exec(value||'');if(!m)fail('文案范围无效');
 if(!db.prepare(`SELECT 1 FROM ${m[1]==='course'?'courses':'lessons'} WHERE id=?`).get(Number(m[2])))fail('文案范围对象不存在',404);return value;
}
function current(db,name){return db.prepare('SELECT * FROM student_copy_scopes WHERE scope=?').get(name)||{scope:name,draft_json:'{}',published_json:'{}',revision:0,published_revision:0};}
const parse=value=>JSON.parse(value||'{}');
function admin(db,user){if(!user||!db.prepare("SELECT 1 FROM users WHERE id=? AND role='admin' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(user.id))fail('仅管理员可管理学生文案',403);}
function authorize(db,user,name){
 if(user?.role==='admin')return admin(db,user);
 scope(db,name);if(name==='global')fail('导师不能管理全局文案',403);
 const [kind,id]=name.split(':'),courseId=kind==='course'?Number(id):db.prepare('SELECT course_id FROM lessons WHERE id=?').get(id)?.course_id;
 if(user?.role!=='academic_mentor'||!require('../helpers/courseScope').courseBelongsToMentor(user.id,courseId,db))fail('课程管理授权已失效',403);
}
function entries(db,name,draft=false){const row=current(db,name);return parse(draft?row.draft_json:row.published_json);}
function placeholders(text){return (text.match(/\{slot\d+\}/g)||[]).sort();}
function validate(change){
 if(!change||typeof change.id!=='string'||!own(registry,change.id))fail('未知文案ID');const base=registry[change.id];
 if(base.type==='content'||(base.sourceField&&base.scope!=='system'))fail('教学字段请在对应课时维护，不可全局替换');
 if(change.reset===true)return null;
 if(typeof change.text!=='string'||change.text.length>10000||typeof change.enabled!=='boolean')fail('文案格式无效');
 if(!base.optional&&base.enabled!==false&&(!change.enabled||!change.text.trim()))fail('必要操作文字不能删除或隐藏');
 if(JSON.stringify(placeholders(base.text))!==JSON.stringify(placeholders(change.text)))fail('动态占位符必须完整保留');
 return{text:change.text,enabled:change.enabled};
}
function managed(db,user,name){authorize(db,user,name);scope(db,name);const row=current(db,name),inherited={};if(name!=='global')Object.assign(inherited,entries(db,'global'));if(name.startsWith('lesson:')){const lesson=db.prepare('SELECT course_id FROM lessons WHERE id=?').get(Number(name.split(':')[1]));Object.assign(inherited,entries(db,'course:'+lesson.course_id));}return{...row,inherited,draft:parse(row.draft_json),published:parse(row.published_json),draft_json:undefined,published_json:undefined,history:db.prepare('SELECT id,scope,revision,action,actor_id,created_at FROM student_copy_history WHERE scope=? ORDER BY id DESC LIMIT 30').all(name)};}
function write(db,user,name,body,action='save'){
 authorize(db,user,name);scope(db,name);if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('请先读取当前修订号',409);
 return db.transaction(()=>{
  authorize(db,user,name);const old=current(db,name);if(old.revision!==body.expectedRevision)fail('文案已由其他管理员修改，请核对新版本，当前输入保留',409);
  let draft=parse(old.draft_json),published=parse(old.published_json);
  if(action==='save'||action==='sync'){
   if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>2000)fail('每次保存1至2000条修改');const seen=new Set();
   for(const change of body.changes){if(seen.has(change.id))fail('重复文案ID');seen.add(change.id);const value=validate(change);
    if(action==='sync'&&JSON.stringify(draft[change.id])!==JSON.stringify(published[change.id])&&!(Array.isArray(body.confirmedDraftIds)&&body.confirmedDraftIds.includes(change.id)))fail('所选文字存在未发布历史草稿，请核对差异后明确确认',409);
    if(value){draft[change.id]=value;if(action==='sync')published[change.id]=value;}else{delete draft[change.id];if(action==='sync')delete published[change.id];}
   }
  }else if(action==='restore'){
   if(body.defaults===true)draft={};else{const h=db.prepare('SELECT * FROM student_copy_history WHERE id=? AND scope=? AND action=\'publish\'').get(body.historyId,name);if(!h)fail('发布历史不存在',404);draft=parse(h.entries_json);}
  }else if(action==='publish')published=structuredClone(draft);else fail('操作无效');
  // Sync publishes exactly the confirmed selection. Unrelated draft entries remain unpublished.
  const publication=action==='publish'||action==='sync',historyAction=publication?'publish':action;
  const revision=old.revision+1,publishedRevision=publication?revision:old.published_revision;
  db.prepare(`INSERT INTO student_copy_scopes(scope,draft_json,published_json,revision,published_revision,updated_by,published_by,published_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?='publish' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(scope) DO UPDATE SET draft_json=excluded.draft_json,published_json=excluded.published_json,revision=excluded.revision,published_revision=excluded.published_revision,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP,published_by=CASE WHEN ?='publish' THEN excluded.published_by ELSE student_copy_scopes.published_by END,published_at=CASE WHEN ?='publish' THEN CURRENT_TIMESTAMP ELSE student_copy_scopes.published_at END`).run(name,JSON.stringify(draft),JSON.stringify(published),revision,publishedRevision,user.id,publication?user.id:null,historyAction,historyAction,historyAction);
  db.prepare('INSERT INTO student_copy_history(scope,revision,entries_json,action,actor_id) VALUES(?,?,?,?,?)').run(name,revision,JSON.stringify(publication?published:draft),historyAction,user.id);
  return managed(db,user,name);
 }).immediate();
}
function published(db,user,query){
 const scopes=['global'];let courseId=query.courseId?Number(query.courseId):null;
 if(query.lessonId){const lesson=db.prepare("SELECT * FROM lessons WHERE id=? AND status!='cancelled'").get(query.lessonId);if(!lesson||courseId&&lesson.course_id!==courseId)fail('课时当前不可访问',404);courseId=lesson.course_id;}
 if(courseId){const course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!course)fail('课程不存在',404);
  const allowed=user?.role==='admin'||user?.role==='academic_mentor'&&require('../helpers/courseScope').courseBelongsToMentor(user.id,courseId,db)||user?.role==='student'&&course.status==='published'&&db.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'").get(user.id,courseId);
  if(!allowed)fail('课程当前不可访问',404);scopes.push('course:'+courseId);if(query.lessonId)scopes.push('lesson:'+Number(query.lessonId));
 }
 const result={},versions=[];for(const name of scopes){const row=current(db,name);Object.assign(result,parse(row.published_json));versions.push(name+'@'+row.published_revision);}
 return{entries:result,version:versions.join('|'),effective:'发布后已打开页面在25秒内或重新聚焦时刷新'};
}
function importPreview(db,user,name,body){
 authorize(db,user,name);scope(db,name);if(body.format!=='page-copy-review-v1'||!Array.isArray(body.edits)||body.edits.length>2000)fail('请选择兼容的文案审阅JSON');
 const state=managed(db,user,name),effective={...registry,...state.inherited,...state.draft},changes=[],conflicts=[];
 for(const edit of body.edits){try{validate(edit);const base=effective[edit.id];if(edit.baseText===undefined&&Object.hasOwn(state.draft,edit.id)&&(edit.text!==base.text||edit.enabled!==base.enabled)){conflicts.push({...edit,reason:'缺少基线且当前已有人工草稿',current:base});continue;}if(edit.baseText!==undefined&&(edit.baseText!==base.text||edit.baseEnabled!==base.enabled)){conflicts.push({...edit,reason:'当前文案已变化',current:base});continue;}changes.push(edit);}catch(e){conflicts.push({...edit,reason:e.message});}}
 return{changes,conflicts,revision:current(db,name).revision};
}
module.exports={registry,scope,current,admin,validate,managed,write,published,importPreview};
