// Additive, one-time upgrade. Never publish current working tables for a closed lesson.
const NAME='live-authoring-v1';
function apply(db){
 return db.transaction(()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS lesson_authoring_recoveries (
   lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id),
   content_version_id INTEGER NOT NULL REFERENCES lesson_content_versions(id),
   previous_reason TEXT, restored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS lesson_version_task_baselines (
   content_version_id INTEGER PRIMARY KEY REFERENCES lesson_content_versions(id),
   tasks_json TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  if(db.prepare('SELECT 1 FROM app_schema_extensions WHERE name=?').get(NAME))return {name:NAME,applied:false};
  const publication=require('../helpers/lessonPublication');
  for(const l of db.prepare("SELECT * FROM lessons WHERE publication_state IN ('legacy','published','closed') ORDER BY id").all()){
   const version=publication.ensureFormalVersion(db,l.id);
   const content=JSON.parse(version.content_json);
   if(content.lesson?.id!==l.id||!Array.isArray(content.cards)||!Array.isArray(content.resources)||!Array.isArray(content.replays))throw Error('课时 '+l.id+' 的原正式快照不完整，停止恢复，请核对备份');
   if(l.publication_state==='closed'){
    db.prepare('INSERT INTO lesson_authoring_recoveries(lesson_id,content_version_id,previous_reason) VALUES(?,?,?)').run(l.id,version.id,l.closure_reason);
    db.prepare("UPDATE lessons SET publication_state='published',closure_reason=NULL WHERE id=?").run(l.id);
   }
  }
  db.prepare('INSERT INTO app_schema_extensions(name) VALUES(?)').run(NAME);
  return {name:NAME,applied:true};
 }).immediate();
}
module.exports={apply,NAME};
