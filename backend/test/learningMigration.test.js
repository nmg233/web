const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../database/migrate');

const newTables = ['report_replacements','student_school_transfers','class_school_transfers','request_results','notification_outbox','enrollment_completions','lesson_version_repairs','report_content_versions','exercise_feedback','retired_exercises','student_lesson_versions','lesson_content_versions'];
function legacyFixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db);
  for (const table of newTables) db.exec(`DROP TABLE ${table}`);
  db.exec('ALTER TABLE schools DROP COLUMN is_active; DELETE FROM schema_migrations WHERE version>=18');
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
    const closed=db.prepare('SELECT * FROM enrollment_completions').get(); assert.ok(closed.completed_at);
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
    assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,20);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM card_exercise_attempts').get().n,1);
  } finally {db.prepare=prepare;db.close();}
});
