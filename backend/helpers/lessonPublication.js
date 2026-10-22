const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
function lesson(db,id){const row=db.prepare('SELECT * FROM lessons WHERE id=?').get(id);if(!row)fail('课时不存在',404);return row;}
function assertStudentOpen(db,id){const l=lesson(db,id);if(['draft','closed'].includes(l.publication_state))fail(l.publication_state==='closed'?'课时暂时关闭，学习记录已保留，请待管理员批准后恢复':'课时尚未审批发布',409);return l;}
// Freeze a legacy formal edition BEFORE its first in-place authoring write.
// The mutable tables are the working draft; published_version_id is student-facing.
function ensureFormalVersion(db,id){
 return db.transaction(()=>{const l=lesson(db,id);if(!['legacy','published','closed'].includes(l.publication_state))return null;
  if(!l.published_version_id){
   if(l.publication_state==='closed')fail('历史关闭课时缺少原正式版本，请核对备份，不能将未审草稿自动开放');
   const version=require('./lessonVersions').saveVersion(db,id,true);
   db.prepare('UPDATE lessons SET published_version_id=? WHERE id=? AND published_version_id IS NULL').run(version.id,id);
  }
  const row=db.prepare('SELECT * FROM lesson_content_versions WHERE id=? AND lesson_id=?').get(lesson(db,id).published_version_id,id);
  if(!row)fail('课时正式版本缺失或归属不一致，请核对备份');
  if(!Object.hasOwn(JSON.parse(row.content_json),'tasks'))db.prepare('INSERT OR IGNORE INTO lesson_version_task_baselines(content_version_id,tasks_json) VALUES(?,?)').run(row.id,JSON.stringify(db.prepare('SELECT * FROM tasks WHERE lesson_id=? ORDER BY sort_order,id').all(id)));
  return row;
 }).immediate();
}
function assertEditable(db,id){const l=lesson(db,id);if(l.status==='cancelled')fail('课时已取消，仅保留历史');ensureFormalVersion(db,id);return lesson(db,id);}
// Closed formal lessons remain in the completion denominator: temporary closure
// must never make an unfinished student accidentally graduate.
function requiredSql(alias='l',studentId=null){const bound=Number.isSafeInteger(Number(studentId))&&Number(studentId)>0?`(SELECT json_extract(v.content_json,'$.lesson.presentation_type') FROM student_lesson_versions s JOIN lesson_content_versions v ON v.id=s.content_version_id WHERE s.student_id=${Number(studentId)} AND s.lesson_id=${alias}.id),`:'';return `${alias}.status!='cancelled' AND ${alias}.publication_state!='draft' AND COALESCE(${bound}(SELECT json_extract(v.content_json,'$.lesson.presentation_type') FROM lesson_content_versions v WHERE v.id=${alias}.published_version_id),${alias}.presentation_type)!='visit'`;}
function visibleSql(alias='l'){return `${alias}.publication_state!='draft'`;}
function formalContent(db,id){const l=lesson(db,id);if(!l.published_version_id)return null;const content=JSON.parse(db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=? AND lesson_id=?').get(l.published_version_id,id).content_json);if(!Object.hasOwn(content,'tasks')){const baseline=db.prepare('SELECT tasks_json FROM lesson_version_task_baselines WHERE content_version_id=?').get(l.published_version_id);if(baseline)content.tasks=JSON.parse(baseline.tasks_json);}return content;}
function studentContent(db,studentId,id){return require('./lessonVersions').boundVersion(db,studentId,id)?.content||formalContent(db,id)||require('./lessonVersions').currentContent(db,id);}
// Independent works use the latest approved task definition, not a student's card version.
function formalTask(db,id){
 const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);if(!task)return null;
 const l=lesson(db,task.lesson_id);if(!l.published_version_id&&!['legacy','published'].includes(l.publication_state))return null;
 const formal=formalContent(db,l.id);
 const baseline=l.published_version_id&&db.prepare('SELECT tasks_json FROM lesson_version_task_baselines WHERE content_version_id=?').get(l.published_version_id);
 const tasks=formal?.tasks||(baseline?JSON.parse(baseline.tasks_json):db.prepare('SELECT * FROM tasks WHERE lesson_id=?').all(l.id));
 const official=tasks.find(t=>t.id===task.id);
 return official?{...official,status:task.status}:null;
}
function publishedTask(db,id){const task=formalTask(db,id);if(!task)return null;const l=lesson(db,task.lesson_id);return l.status!=='cancelled'&&['legacy','published'].includes(l.publication_state)?task:null;}
function studentAsset(db,studentId,courseId,kind,assetId){
 for(const l of db.prepare("SELECT id FROM lessons WHERE course_id=? AND publication_state IN ('legacy','published') AND status!='cancelled'").all(courseId)){
  const content=studentContent(db,studentId,l.id);
  const asset=content[kind==='replay'?'replays':'resources'].find(a=>a.id===Number(assetId));
  if(asset)return asset;
 }
 return null;
}
function assetVisible(...args){return Boolean(studentAsset(...args));}
module.exports={assertStudentOpen,assertEditable,ensureFormalVersion,formalTask,publishedTask,requiredSql,visibleSql,formalContent,studentContent,studentAsset,assetVisible};
