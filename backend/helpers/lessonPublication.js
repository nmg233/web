const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
function lesson(db,id){const row=db.prepare('SELECT * FROM lessons WHERE id=?').get(id);if(!row)fail('课时不存在',404);return row;}
function assertStudentOpen(db,id){const l=lesson(db,id);if(['draft','closed'].includes(l.publication_state))fail(l.publication_state==='closed'?'课时暂时关闭，学习记录已保留，请待管理员批准后恢复':'课时尚未审批发布',409);return l;}
function assertEditable(db,id){const l=lesson(db,id);if(l.status==='cancelled')fail('课时已取消，仅保留历史');if(['published','legacy'].includes(l.publication_state))fail('正式课时须先关闭再编辑，请使用“关闭并编辑”');return l;}
// Closed formal lessons remain in the completion denominator: temporary closure
// must never make an unfinished student accidentally graduate.
function requiredSql(alias='l',studentId=null){const bound=Number.isSafeInteger(Number(studentId))&&Number(studentId)>0?`(SELECT json_extract(v.content_json,'$.lesson.presentation_type') FROM student_lesson_versions s JOIN lesson_content_versions v ON v.id=s.content_version_id WHERE s.student_id=${Number(studentId)} AND s.lesson_id=${alias}.id),`:'';return `${alias}.status!='cancelled' AND ${alias}.publication_state!='draft' AND COALESCE(${bound}(SELECT json_extract(v.content_json,'$.lesson.presentation_type') FROM lesson_content_versions v WHERE v.id=${alias}.published_version_id),${alias}.presentation_type)!='visit'`;}
function visibleSql(alias='l'){return `${alias}.publication_state!='draft'`;}
function formalContent(db,id){const l=lesson(db,id);return l.published_version_id?JSON.parse(db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=?').get(l.published_version_id).content_json):null;}
function studentContent(db,studentId,id){return require('./lessonVersions').boundVersion(db,studentId,id)?.content||formalContent(db,id)||require('./lessonVersions').currentContent(db,id);}
function studentAsset(db,studentId,courseId,kind,assetId){
 for(const l of db.prepare("SELECT id FROM lessons WHERE course_id=? AND publication_state IN ('legacy','published') AND status!='cancelled'").all(courseId)){
  const content=studentContent(db,studentId,l.id);
  const asset=content[kind==='replay'?'replays':'resources'].find(a=>a.id===Number(assetId));
  if(asset)return asset;
 }
 return null;
}
function assetVisible(...args){return Boolean(studentAsset(...args));}
module.exports={assertStudentOpen,assertEditable,requiredSql,visibleSql,formalContent,studentContent,studentAsset,assetVisible};
