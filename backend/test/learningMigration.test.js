const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { runMigrations } = require('../database/migrate');

const newTables = ['report_replacements','student_school_transfers','class_school_transfers','request_results','notification_outbox','enrollment_completions','lesson_version_repairs','report_content_versions','exercise_feedback','retired_exercises','student_lesson_versions','lesson_content_versions'];
function legacyFixture(completedAt = null) {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON');
  // The existing frozen v16 fixture is the exact original 49c179e v15 schema
  // followed by our avatar extension. Start from its unchanged v15 prefix and
  // apply the original upstream published 016/017 SQL to obtain a real v17 DB.
  const schema = fs.readFileSync(path.join(__dirname,'../testFixtures/schema-v16.sql'),'utf8').split('-- 016:')[0];
  db.exec(schema);
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const files = fs.readdirSync(path.join(__dirname,'../database/migrations')).filter(file=>/^\d+_/.test(file)&&parseInt(file)<=17).sort();
  for(const file of files) {
    const version=parseInt(file);
    if(version>=16) db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations',file),'utf8'));
    db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(version,file);
  }
  db.exec(`INSERT INTO users (id,username,password_hash,real_name,role) VALUES (1,'mentor','hash','导师','academic_mentor'),(2,'student','hash','学生','student');
    INSERT INTO courses (id,title,grade_level,difficulty,created_by,status) VALUES (1,'旧课程','primary','basic',1,'published');
    INSERT INTO lessons (id,course_id,title,status) VALUES (1,1,'旧课时','completed');
    INSERT INTO enrollments (id,student_id,course_id,status) VALUES (1,2,1,'active');
    INSERT INTO knowledge_cards (id,lesson_id,title,content,status,created_by) VALUES (1,1,'旧卡片','当前可取正文','published',1);
    INSERT INTO card_exercises (id,card_id,question_type,prompt,answer_json,explanation) VALUES (1,1,'true_false','当前可取题目','true','当前可取详解');
    INSERT INTO card_exercise_attempts (student_id,exercise_id,answer_json,is_correct,score,attempt_no) VALUES (2,1,'false',0,0,1);
    INSERT INTO student_card_progress (student_id,card_id,viewed_at,completed_at,best_score) VALUES (2,1,'2026-01-01','2026-01-01',0);
    INSERT INTO lesson_progress (student_id,lesson_id,progress,completed_at) VALUES (2,1,100,'2026-01-01');
    INSERT INTO lesson_learning_reports (student_id,lesson_id,enrollment_id,summary,status,score,version) VALUES (2,1,1,'旧报告','approved',95,1);`);
  if(completedAt)db.prepare('UPDATE enrollments SET completed_at=? WHERE id=1').run(completedAt);
  return db;
}

test('017旧库增量迁移保留错题、成绩、报告和答题次数，兼容版本及结课重复启动幂等', () => {
  const db=legacyFixture(); const fresh=new Database(':memory:');
  try {
    const attempts=db.prepare('SELECT * FROM card_exercise_attempts').all();
    const reports=db.prepare('SELECT * FROM lesson_learning_reports').all();
    runMigrations(db); runMigrations(fresh);
    const version=db.prepare('SELECT * FROM lesson_content_versions').get();
    assert.equal(version.legacy_compat,1);
    assert.equal(JSON.parse(version.content_json).cards[0].exercises[0].explanation,'当前可取详解');
    assert.equal(db.prepare('SELECT content_version_id FROM report_content_versions').get().content_version_id,version.id);
    const closed=db.prepare('SELECT * FROM enrollment_completions').get(); assert.equal(closed,undefined);
    assert.equal(db.prepare('SELECT completed_at FROM enrollments WHERE id=1').get().completed_at,null);
    runMigrations(db);
    assert.deepEqual(db.prepare('SELECT * FROM enrollment_completions').get(),closed);
    assert.deepEqual(db.prepare('SELECT * FROM card_exercise_attempts').all(),attempts);
    assert.deepEqual(db.prepare('SELECT * FROM lesson_learning_reports').all(),reports);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_content_versions').get().n,1);
    for(const table of [...newTables,'schools']) {
      // ALTER ADD COLUMN 的物理列序号不同；比较名字、类型、默认值及约束语义。
      const columns=(database)=>database.prepare(`PRAGMA table_info(${table})`).all().map(({cid,...column})=>column).sort((a,b)=>a.name.localeCompare(b.name));
      assert.deepEqual(columns(db),columns(fresh),table);
      assert.deepEqual(db.prepare(`PRAGMA foreign_key_list(${table})`).all(),fresh.prepare(`PRAGMA foreign_key_list(${table})`).all(),table);
    }
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok'); assert.deepEqual(db.pragma('foreign_key_check'),[]);
  } finally {db.close();fresh.close();}
});

test('兼容快照回填失败时整个018迁移回滚，修复故障后可重试且不删旧答案', () => {
  const db=legacyFixture(); const prepare=db.prepare;
  try {
    db.prepare=function(sql) {if(sql.includes('video_path AS file_path')) throw Error('模拟回填故障');return prepare.call(this,sql);};
    assert.throws(()=>runMigrations(db),/模拟回填故障/);
    db.prepare=prepare;
    assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,17);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='lesson_content_versions'").get(),undefined);
    assert.equal(db.prepare('SELECT answer_json,attempt_no FROM card_exercise_attempts').get().answer_json,'false');
    runMigrations(db);
    assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,1026);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM card_exercise_attempts').get().n,1);
  } finally {db.prepare=prepare;db.close();}
});


test('旧库已有结课时间仅补兼容闭包，不更改原时间或纳入后加未完成课时',()=>{
  const db=legacyFixture('2026-01-02 09:30:00');
  try {
    db.prepare("INSERT INTO lessons(id,course_id,title,status) VALUES(2,1,'后来新增未完成课时','scheduled')").run();
    const enrollment=db.prepare('SELECT * FROM enrollments WHERE id=1').get();
    runMigrations(db);
    const closure=db.prepare('SELECT * FROM enrollment_completions WHERE enrollment_id=1').get();
    assert.equal(closure.completed_at,enrollment.completed_at);
    assert.deepEqual(JSON.parse(closure.lesson_manifest_json),[1]);
    assert.deepEqual(db.prepare('SELECT * FROM enrollments WHERE id=1').get(),enrollment);
    runMigrations(db);
    assert.deepEqual(db.prepare('SELECT * FROM enrollment_completions WHERE enrollment_id=1').get(),closure);
  } finally { db.close(); }
});

test('020旧库及main扩展库补评价要点，重复迁移保留原题和作答',()=>{
 const db=legacyFixture();runMigrations(db);
 try {
  db.exec('ALTER TABLE card_exercises DROP COLUMN rubric; DELETE FROM schema_migrations WHERE version=21');
  const attempts=db.prepare('SELECT * FROM card_exercise_attempts').all(),reports=db.prepare('SELECT * FROM lesson_learning_reports').all();
  runMigrations(db);runMigrations(db);
  assert.deepEqual(db.prepare('SELECT * FROM card_exercise_attempts').all(),attempts);
  assert.deepEqual(db.prepare('SELECT * FROM lesson_learning_reports').all(),reports);
  assert.ok(db.prepare('PRAGMA table_info(card_exercises)').all().some(c=>c.name==='rubric'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations WHERE version=21').get().n,1);
 } finally {db.close();}
});

test('xzx-2真实021评价要点迁移身份不被main徽章编号21覆盖，增量合并不改答案和成绩',()=>{
 const db=legacyFixture();
 try {
  const dir=path.join(__dirname,'../database/migrations');
  for(const file of fs.readdirSync(dir).filter(f=>parseInt(f)>=18&&parseInt(f)<=21).sort()) {
   const version=parseInt(file);db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
   if(version===18)require('../database/migrationBridge').snapshotLegacy(db);
   db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(version,file);
  }
  db.prepare("UPDATE card_exercises SET rubric='原评价要点' WHERE id=1").run();
  const attempts=db.prepare('SELECT * FROM card_exercise_attempts').all(),reports=db.prepare('SELECT * FROM lesson_learning_reports').all();
  const content=db.prepare('SELECT content_json FROM lesson_content_versions').all();
  runMigrations(db);runMigrations(db);
  assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=21').get().name,'021_short_answer_rubric.sql');
  assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=1021').get().name,'1021_badges_demo_exchange.sql');
  assert.equal(db.prepare('SELECT rubric FROM card_exercises WHERE id=1').get().rubric,'原评价要点');
  assert.deepEqual(db.prepare('SELECT * FROM card_exercise_attempts').all(),attempts);
  assert.deepEqual(db.prepare('SELECT * FROM lesson_learning_reports').all(),reports);
  assert.deepEqual(db.prepare('SELECT content_json FROM lesson_content_versions').all(),content);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 } finally {db.close();}
});
