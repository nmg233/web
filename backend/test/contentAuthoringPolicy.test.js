const {test}=require('node:test'), assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const versions=require('../helpers/lessonVersions');
function fixture(){const db=new Database(':memory:');require('../database/migrate').runMigrations(db);db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'authoring','x','合成维护者','admin'),(2,'learner','x','合成学生','student')").run();db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(1,'测试课程','junior','basic','published',1)").run();db.prepare("INSERT INTO lessons(id,course_id,title,review_content,content_state,publication_state) VALUES(1,1,'测试课时','真实回顾内容','ready','legacy')").run();db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(2,1,'active')").run();return db;}
test('旧课时仍要求卡片；新显式非卡片模板仍须真实内容和报告评审',()=>{const db=fixture();try{assert.equal(versions.readiness(db,1).ready,false);db.prepare('UPDATE lessons SET cards_required=0 WHERE id=1').run();assert.equal(versions.readiness(db,1).ready,true);versions.bind(db,2,1);assert.equal(versions.completionEvidence(db,2,1).report_unlocked,false);db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(2,1)').run();assert.equal(versions.completionEvidence(db,2,1).report_unlocked,true);assert.equal(versions.completionEvidence(db,2,1).completed,false);db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,status,summary,score) VALUES(2,1,'approved','经导师评审的报告',80)").run();assert.equal(versions.completionEvidence(db,2,1).completed,true);db.prepare("UPDATE lessons SET review_content=NULL WHERE id=1").run();assert.equal(versions.readiness(db,1).ready,false);}finally{db.close();}});
test('卡片要求随教材版本冻结；重复命名升级不修改数字迁移和既有字段',()=>{const db=fixture();try{db.prepare('UPDATE lessons SET cards_required=0 WHERE id=1').run();versions.bind(db,2,1);db.prepare('UPDATE lessons SET cards_required=1,location=\'旧地点\' WHERE id=1').run();assert.equal(versions.boundVersion(db,2,1).content.lesson.cards_required,0);const before=db.prepare('SELECT * FROM schema_migrations').all();require('../database/contentAuthoringExtension').apply(db);require('../database/contentAuthoringExtension').apply(db);assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(),before);assert.equal(db.prepare('SELECT location FROM lessons WHERE id=1').get().location,'旧地点');}finally{db.close();}});

test('历史缺卡快照仍可显式补学修复，不改变原卡片前置或销毁旧版本',()=>{
 const db=fixture();try{
  const old=versions.saveVersion(db,1,true);versions.bind(db,2,1);
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,status,created_by) VALUES(1,1,'补齐的原卡片','合成内容','published',1)").run();
  db.prepare("INSERT INTO card_exercises(card_id,question_type,prompt,answer_json,explanation) VALUES(1,'true_false','需记录条件吗','true','应记录条件')").run();
  const result=versions.repairLegacy(db,1,2,1,'管理员补齐教材，保留旧记录');
  assert.equal(result.old_version_id,old.id);assert.notEqual(result.new_version_id,old.id);
  assert.equal(versions.boundVersion(db,2,1).content.cards.length,1);
  assert.equal(versions.completionEvidence(db,2,1).cards_required,true);
  assert.ok(db.prepare('SELECT 1 FROM lesson_content_versions WHERE id=?').get(old.id));
 }finally{db.close();}
});
