// Original local 016–023 meanings are moved, with timestamps and an audit trail,
// to 1016–1023. Upstream 001–020 keep their published identity.
const fs=require('node:fs'),path=require('node:path');
const signatures={
 16:{course_avatar_preferences:['student_id','course_id','avatar_id']},
 17:{courses:['presentation_theme'],lessons:['chapter_id','teaching_tip'],resources:['file_name','file_type','upload_token','upload_digest'],course_chapters:['title'],course_experiments:['card_id','stage'],course_covers:['file_path']},
 18:{users:['avatar_preset'],courses:['map_mode'],lessons:['presentation_type','content_state','article_url','article_title','moments_note'],course_plan_nodes:['position','lesson_id','state']},
 19:{course_plan_nodes:['position']},20:{reflections:['reflection_version','entry_note','together_note','extra_note']},
 21:{lesson_badge_definitions:['lesson_id','art_id'],student_badge_grants:['criterion_snapshot'],demo_exchange_events:['operation_id']},
 22:{student_coin_ledger:['sequence','snapshot_json','report_version'],student_coin_checkins:['ledger_id','streak']},
 23:{lessons:['review_content','report_guidance','experiment_guidance','article_blocks'],resources:['display_order']},
};
function verify(db,version){
 for(const [table,columns] of Object.entries(signatures[version])){
  const actual=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
  if(columns.some(c=>!actual.has(c)))throw Error(`迁移 ${version} 的结构与记录不符：${table}；请核对备份，不会猜测放行`);
 }
 if(version===19&&!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='course_plan_detach_lesson'").get())throw Error('019 课时解绑触发器缺失');
}
function bridge(db){
 const files=fs.readdirSync(path.join(__dirname,'migrations')).filter(f=>/^10\d\d_/.test(f));
 const moves=[];
 for(const file of files){const oldVersion=Number(file.slice(1,4)),oldName=file.slice(1),row=db.prepare('SELECT * FROM schema_migrations WHERE version=?').get(oldVersion);
  if(row?.name!==oldName)continue;
  verify(db,oldVersion);
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(1000+oldVersion))throw Error('兼容迁移目标编号已占用，请核对，不覆盖迁移历史');
  moves.push({row,file,version:1000+oldVersion});
 }
 db.exec(`CREATE TABLE IF NOT EXISTS migration_identity_history (
  original_version INTEGER PRIMARY KEY,original_name TEXT NOT NULL,original_applied_at TEXT,
  canonical_version INTEGER NOT NULL,canonical_name TEXT NOT NULL,verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );`);
 for(const {row,file,version}of moves){
  db.prepare('INSERT INTO migration_identity_history(original_version,original_name,original_applied_at,canonical_version,canonical_name) VALUES(?,?,?,?,?)').run(row.version,row.name,row.applied_at,version,file);
  db.prepare('UPDATE schema_migrations SET version=?,name=? WHERE version=?').run(version,file,row.version);
 }
}
// Add upstream-compatible version snapshots without changing current completion,
// scores, enrollment closure or the student's original teaching rows.
function snapshotLegacy(db){
 const versions=require('../helpers/lessonVersions');
 const pairs=db.prepare(`SELECT student_id,lesson_id FROM lesson_progress UNION SELECT student_id,lesson_id FROM lesson_review_completions UNION SELECT student_id,lesson_id FROM lesson_learning_reports UNION SELECT p.student_id,c.lesson_id FROM student_card_progress p JOIN knowledge_cards c ON c.id=p.card_id UNION SELECT a.student_id,c.lesson_id FROM card_exercise_attempts a JOIN card_exercises e ON e.id=a.exercise_id JOIN knowledge_cards c ON c.id=e.card_id`).all();
 for(const p of pairs){const v=versions.saveVersion(db,p.lesson_id,true);db.prepare('INSERT OR IGNORE INTO student_lesson_versions(student_id,lesson_id,content_version_id) VALUES(?,?,?)').run(p.student_id,p.lesson_id,v.id);}
 db.exec(`INSERT OR IGNORE INTO report_content_versions(report_id,content_version_id) SELECT r.id,s.content_version_id FROM lesson_learning_reports r JOIN student_lesson_versions s ON s.student_id=r.student_id AND s.lesson_id=r.lesson_id`);
}
module.exports={bridge,snapshotLegacy};
