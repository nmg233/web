const MIN_SCHEMA_VERSION=20;
const checks={
  users:'id,role,school_id,teacher_id,auth_version,force_reset_password,archived_at',
  schools:'id,is_active', classes:'id,school_id',courses:'id,status',lessons:'id,course_id,status',
  enrollments:'id,student_id,course_id,status,completed_at',course_replays:'id,lesson_id,video_path',resources:'id,lesson_id,file_path',
  knowledge_cards:'id,lesson_id,status',card_exercises:'id,card_id,answer_json',
  student_card_progress:'student_id,card_id,completed_at',card_exercise_attempts:'student_id,exercise_id,attempt_no',
  lesson_review_completions:'student_id,lesson_id',lesson_progress:'student_id,lesson_id,completed_at',
  lesson_learning_reports:'id,student_id,lesson_id,status,version',reflections:'report_id',works:'id,parent_work_id,review_status',
  lesson_content_versions:'id,content_json,legacy_compat',student_lesson_versions:'student_id,lesson_id,content_version_id',
  report_content_versions:'report_id,content_version_id',report_replacements:'report_id,replacement_report_id',
  enrollment_completions:'enrollment_id,lesson_manifest_json',retired_exercises:'exercise_id',exercise_feedback:'student_id,exercise_id',
  request_results:'actor_id,scope,request_key,fingerprint',notification_outbox:'event_key,next_retry_at,quarantined_at,delivered_at',
  notifications:'id,dedupe_key',user_notifications:'user_id,notification_id',
  class_school_transfers:'id,actor_id',student_school_transfers:'id,student_id,actor_id',ai_documents:'id,status',ai_chunks:'id,text',
  tasks:'id,lesson_id,status',work_reviews:'work_id,comment',feedbacks:'id,user_id,status',feedback_messages:'feedback_id,content',
  feedback_attachments:'id,feedback_id,file_path',refresh_tokens:'user_id,token_hash',account_import_batches:'id,actor_id,status',
};
const uniques={
  users:['username'],enrollments:['student_id','course_id'],
  lesson_learning_reports:['student_id','lesson_id','version'],
  notifications:['dedupe_key'],user_notifications:['notification_id','user_id'],
  student_card_progress:['student_id','card_id'],lesson_review_completions:['student_id','lesson_id'],
  student_lesson_versions:['student_id','lesson_id'],request_results:['actor_id','scope','request_key'],
};
function hasUnique(db,table,columns) {
  const same=(actual)=>JSON.stringify(actual)===JSON.stringify(columns);
  if(same(db.pragma(`table_info(${table})`).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name))) return true;
  return db.pragma(`index_list(${table})`).filter(i=>i.unique && !i.partial)
    .some(i=>same(db.pragma(`index_info("${i.name.replaceAll('"','""')}")`).map(c=>c.name)));
}
function assertReady(db) {
  const version=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version;
  if(!Number.isInteger(version) || version<MIN_SCHEMA_VERSION) throw new Error('Schema not ready');
  for(const [table,columns] of Object.entries(checks)) db.prepare(`SELECT ${columns} FROM ${table} WHERE 0`).all();
  for(const [table,columns] of Object.entries(uniques)) if(!hasUnique(db,table,columns)) throw new Error('Required uniqueness missing');
  if(db.readonly || db.pragma('query_only',{simple:true}) || !db.pragma('foreign_keys',{simple:true})) throw new Error('Database cannot accept safe writes');
  if(db.inTransaction) throw new Error('Readiness probe must not run inside a business transaction');
  db.exec('BEGIN IMMEDIATE');
  db.exec('ROLLBACK');
  return version;
}
module.exports={assertReady,MIN_SCHEMA_VERSION};
