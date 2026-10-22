const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.pragma('foreign_keys=ON');
require('../database/migrate').runMigrations(db);
require.cache[require.resolve('../config/database')] = { exports: db };
const learning = require('../services/learningService');
const reviews = require('../services/mentorReviewService');
const versions = require('../helpers/lessonVersions');
const coins = require('../services/studentCoins');
const admin = { id: 1, role: 'admin' };
const mentor = { id: 2, role: 'academic_mentor' };
for (const [id, role] of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'student']]) {
  db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,`merge-${id}`,'hash',`隔离用户${id}`,role);
}
after(() => db.close());
function fixture() {
  const course = Number(db.prepare("INSERT INTO courses(title,grade_level,difficulty,status,created_by) VALUES('隔离文章课程','junior','basic','published',2)").run().lastInsertRowid);
  const lesson = Number(db.prepare(`INSERT INTO lessons(course_id,title,status,instructor_id,presentation_type,content_state,
    article_blocks,review_content,report_guidance,location,duration) VALUES(?,'原课时','completed',2,'learning','ready',?,'原课堂回顾','原报告提示','原地点',45)`)
    .run(course,JSON.stringify([{id:'p1',type:'paragraph',text:'原人工教材'}])).lastInsertRowid);
  for (const id of [3,4]) db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(?,?,'active')").run(id,course);
  db.prepare("UPDATE lessons SET publication_state='draft' WHERE id=?").run(lesson);
  const card = learning.createCard(admin,lesson,{title:'原卡片',content:'原正文',status:'published'}).id;
  const exercise = learning.createExercise(admin,card,{question_type:'true_false',prompt:'原问题',answer:true,explanation:'原解析'}).id;
  // Historical fixture, not an application authoring bypass.
  db.prepare("UPDATE lessons SET publication_state='legacy' WHERE id=?").run(lesson);
  return { course, lesson, card, exercise };
}
const pub=require('./helpers/publicationFixture.cjs');
const close=f=>pub.edit(admin,f.course,f.lesson),publish=f=>pub.publish(admin,f.course,f.lesson);
function submit(f, student=3) {
  learning.lessonPackage(student,f.lesson);
  learning.completeReview(student,f.lesson);
  learning.submitExercise(student,f.exercise,true);
  learning.completeCard(student,f.card);
  return learning.submitReport(student,f.lesson,{report:{summary:'人工报告'},reflection:{reflection_version:2,entry_note:'开放反思'},base_report_id:null});
}

test('文章/课堂回顾课程保留真实阅读媒介，未配置传统课时仍执行视频/卡题就绪校验', () => {
  const f = fixture();
  assert.equal(versions.readiness(db,f.lesson).ready,true);
  const pkg = learning.lessonPackage(3,f.lesson);
  assert.equal(pkg.lesson.article_blocks[0].text,'原人工教材');
  assert.equal(pkg.lesson.report_guidance,'原报告提示');
  assert.equal(pkg.lesson.location,'原地点');
  db.prepare("UPDATE lessons SET review_content=NULL,article_blocks='[]' WHERE id=?").run(f.lesson);
  assert.throws(()=>learning.lessonPackage(4,f.lesson),e=>e.code==='LESSON_CONTENT_INCOMPLETE');
  assert.equal(versions.boundVersion(db,4,f.lesson),null);
});

test('人工改稿审批后才影响新学生，已绑定文章卡题、指导和安排信息全部冻结', () => {
  const f=fixture();
  learning.lessonPackage(3,f.lesson);
  db.prepare("UPDATE lessons SET article_blocks=?,report_guidance='新报告提示',location='新地点' WHERE id=?")
    .run(JSON.stringify([{id:'p1',type:'paragraph',text:'新人工教材'}]),f.lesson);
  close(f);learning.updateCard(admin,f.card,{content:'新正文'});
  learning.updateExercise(admin,f.exercise,{answer:false,explanation:'新解析'});
  publish(f);const old=learning.lessonPackage(3,f.lesson), fresh=learning.lessonPackage(4,f.lesson);
  assert.equal(old.lesson.article_blocks[0].text,'原人工教材');
  assert.equal(old.lesson.report_guidance,'原报告提示');
  assert.equal(old.cards[0].content,'原正文');
  assert.equal(old.lesson.location,'原地点');
  assert.equal(fresh.lesson.location,'新地点');
  assert.equal(fresh.lesson.article_blocks[0].text,'新人工教材');
  assert.equal(fresh.cards[0].content,'新正文');
  learning.completeReview(3,f.lesson);
  assert.equal(learning.submitExercise(3,f.exercise,true).correct,true);
  assert.throws(()=>learning.submitExercise(3,f.exercise,true),e=>e.code==='MAX_ATTEMPTS_REACHED');
});

test('旧快照升级补充不改原文，资源只补快照既有ID，后续编辑不污染补充教材', () => {
  const f=fixture();
  learning.lessonPackage(3,f.lesson);
  const old=versions.boundVersion(db,3,f.lesson), content=JSON.parse(old.content_json);
  content.lesson={id:f.lesson,title:'旧快照标题',description:null};
  content.resources=[{id:991,title:'旧资源',file_path:'/isolated/old.png'}];
  const encoded=JSON.stringify(content);
  db.prepare('UPDATE lesson_content_versions SET content_json=? WHERE id=?').run(encoded,old.id);
  const supplemental=db.prepare('SELECT * FROM lessons WHERE id=?').get(f.lesson);
  db.prepare('INSERT INTO lesson_version_supplements(content_version_id,lesson_json,resources_json) VALUES(?,?,?)')
    .run(old.id,JSON.stringify(supplemental),JSON.stringify([{id:991,title:'不能覆盖旧标题',file_type:'png',display_order:2},{id:992,title:'不能加入新版资料'}]));
  db.prepare("UPDATE lessons SET report_guidance='后续提示',article_blocks='[]' WHERE id=?").run(f.lesson);
  const pkg=learning.lessonPackage(3,f.lesson);
  assert.equal(pkg.lesson.title,'旧快照标题');
  assert.equal(pkg.lesson.report_guidance,'原报告提示');
  assert.equal(pkg.content_version.legacy_lesson_fields,true);
  assert.equal(pkg.content_version.supplement_source,'upgrade');
  assert.equal(pkg.resources.length,1);
  assert.equal(pkg.resources[0].title,'旧资源');
  assert.equal(pkg.resources[0].file_type,'png');
  assert.equal(pkg.resources[0].file_path,undefined);
  assert.equal(pkg.resources[0].upload_token,undefined);
  assert.equal(pkg.resources[0].upload_digest,undefined);
  assert.equal(db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=?').get(old.id).content_json,encoded);
});

test('负责导师与管理员可编排卡题，独立教学预览不泄漏答案或产生作答', () => {
  const f=fixture();
  close(f);learning.updateCard(mentor,f.card,{content:'负责导师正文'});
  learning.updateExercise(mentor,f.exercise,{explanation:'负责导师解析'});
  const cards=learning.listManagedCards(mentor,f.lesson);
  assert.equal(cards[0].exercises[0].explanation,'负责导师解析');
  assert.notEqual(cards[0].exercises[0].answer_json,undefined);
  const preview=learning.previewLesson(mentor,f.lesson);
  assert.equal(preview.cards[0].exercises[0].answer_json,undefined);
  assert.equal(learning.managedContext(mentor,f.lesson).read_only,false);
  assert.equal(learning.managedContext(admin,f.lesson).read_only,false);
});

test('开放反思、历史报告与习题反馈保留，原首次评分金币只结算一次', () => {
  const f=fixture(), report=submit(f);
  const reflection=db.prepare('SELECT * FROM reflections WHERE report_id=?').get(report.id);
  assert.equal(reflection.reflection_version,2);
  assert.equal(reflection.entry_note,'开放反思');
  reviews.feedback(mentor,report.id,f.exercise,{content:'导师引导反馈'});
  reviews.review(mentor,report.id,{status:'rejected',score:70,comment:'请补充依据'});
  assert.equal(coins.reconcile(3).created.some(row=>row.lessonId===f.lesson),false);
  const replacement=learning.submitReport(3,f.lesson,{report:{summary:'修订报告'},reflection:{reflection_version:2,entry_note:'修订反思'},base_report_id:report.id});
  assert.equal(replacement.parent_report_id,report.id);
  reviews.review(mentor,replacement.id,{status:'approved',score:82});
  const settled=coins.reconcile(3).created.find(row=>row.lessonId===f.lesson);
  assert.equal(settled.amount,82);
  assert.equal(coins.reconcile(3).created.some(row=>row.lessonId===f.lesson),false);
  const detail=reviews.detail(mentor,report.id);
  assert.equal(detail.report.summary,'人工报告');
  assert.equal(detail.history.length,2);
  assert.equal(detail.cards[0].exercises[0].feedback.content,'导师引导反馈');
  assert.equal(learning.lessonPackage(3,f.lesson).course_completion.completed,true);
});

test('版本绑定不绕过报名权限，准备中草稿不影响旧正式版继续回顾，未完成卡题仍不能交报告', () => {
  const f=fixture();learning.lessonPackage(3,f.lesson);
  close(f);db.prepare("UPDATE lessons SET content_state='preparing' WHERE id=?").run(f.lesson);
  learning.completeReview(3,f.lesson);
  assert.equal(learning.lessonPackage(3,f.lesson).progress.review_completed,true);
  assert.throws(()=>learning.submitReport(3,f.lesson,{}),e=>e.status===409);
  db.prepare("UPDATE enrollments SET status='removed' WHERE course_id=? AND student_id=3").run(f.course);
  assert.throws(()=>learning.lessonPackage(3,f.lesson),e=>e.status===404);
});


test('奖励按已绑定教材判定：新卡题不追溯阻断，需补学报告也不能提前发币或徽章', () => {
  const f=fixture(), report=submit(f);
  reviews.review(mentor,report.id,{status:'approved',score:77});
  db.prepare("INSERT INTO lesson_badge_definitions(lesson_id,name,art_id,description) VALUES(?,'隔离徽章','theory','隔离说明')").run(f.lesson);
  db.prepare('UPDATE courses SET lesson_badges_enabled=1 WHERE id=(SELECT course_id FROM lessons WHERE id=?)').run(f.lesson);
  close(f);learning.updateCard(admin,f.card,{status:'archived'});
  const added=learning.createCard(admin,f.lesson,{title:'后来新增卡',content:'新教材',status:'published'}).id;
  learning.createExercise(admin,added,{question_type:'true_false',prompt:'新增题',answer:true,explanation:'新解析'});
  assert.equal(require('../helpers/rewardEligibility').taskEligibility(3,f.lesson).eligible,true);
  db.prepare('INSERT INTO report_replacements(report_id,content_version_id,actor_id,reason) VALUES(?,?,1,?)')
    .run(report.id,versions.boundVersion(db,3,f.lesson).id,'隔离模拟已确认的补学要求');
  assert.equal(require('../helpers/rewardEligibility').taskEligibility(3,f.lesson).eligible,false);
  assert.equal(coins.reconcile(3).created.some(row=>row.lessonId===f.lesson),false);
  assert.equal(require('../services/studentRewards').reconcile(3).created.length,0);
  db.prepare('DELETE FROM report_replacements WHERE report_id=?').run(report.id);
  assert.equal(coins.reconcile(3).created.find(row=>row.lessonId===f.lesson).amount,77);
  assert.equal(require('../services/studentRewards').reconcile(3).created.length,1);
  assert.ok(require('../services/studentRewards').profile(3).grants.some(row=>row.lesson_id===f.lesson));
});


test('参观/准备中教材可只读浏览但不绑定或记进度，全部写入口拒绝且撤回实时失效',()=>{
  for(const config of [{presentation_type:'visit',content_state:'ready'},{presentation_type:'learning',content_state:'preparing'}]) {
    const f=fixture();
    db.prepare('UPDATE lessons SET presentation_type=?,content_state=? WHERE id=?').run(config.presentation_type,config.content_state,f.lesson);
    const pkg=learning.lessonPackage(3,f.lesson);
    assert.equal(pkg.read_only,true);assert.equal(pkg.learning_available,false);
    assert.equal(pkg.content_version.id,null);assert.equal(pkg.lesson.article_blocks[0].text,'原人工教材');
    assert.equal(versions.boundVersion(db,3,f.lesson),null);
    assert.equal(db.prepare('SELECT * FROM lesson_progress WHERE student_id=3 AND lesson_id=?').get(f.lesson),undefined);
    for(const mutate of [()=>learning.completeReview(3,f.lesson),()=>learning.submitExercise(3,f.exercise,true),()=>learning.completeCard(3,f.card),()=>learning.submitReport(3,f.lesson,{})]) {
      assert.throws(mutate,error=>error.status===409 && ['CONTENT_PREPARING','LESSON_READ_ONLY'].includes(error.code));
    }
    assert.equal(require('../helpers/rewardEligibility').taskEligibility(3,f.lesson).eligible,false);
    db.prepare("UPDATE courses SET status='draft' WHERE id=?").run(f.course);
    assert.throws(()=>learning.lessonPackage(3,f.lesson),error=>error.status===404);
  }
});


test('完整文章旧快照不会因无视频被误修复，真正缺少回顾的旧版只补真实新媒介一次',()=>{
  const complete=fixture();
  const original=versions.saveVersion(db,complete.lesson,true);
  db.prepare('INSERT INTO student_lesson_versions(student_id,lesson_id,content_version_id) VALUES(3,?,?)').run(complete.lesson,original.id);
  assert.throws(()=>learning.repairLegacy(admin,complete.lesson,3,'完整文章不需补学'),error=>error.status===409);
  assert.equal(versions.boundVersion(db,3,complete.lesson).id,original.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_version_repairs WHERE student_id=3 AND lesson_id=?').get(complete.lesson).n,0);
  const missing=fixture();
  db.prepare("UPDATE lessons SET review_content=NULL,article_blocks='[]' WHERE id=?").run(missing.lesson);
  const broken=versions.saveVersion(db,missing.lesson,true);
  db.prepare('INSERT INTO student_lesson_versions(student_id,lesson_id,content_version_id) VALUES(3,?,?)').run(missing.lesson,broken.id);
  const originalJson=broken.content_json;
  db.prepare("UPDATE lessons SET review_content='管理员补齐的真实回顾',article_blocks=? WHERE id=?")
    .run(JSON.stringify([{id:'new-paragraph',type:'paragraph',text:'补齐教材'}]),missing.lesson);
  close(missing);const fixed=learning.repairLegacy(admin,missing.lesson,3,'补齐历史缺少的真实回顾');
  assert.notEqual(fixed.new_version_id,broken.id);
  assert.equal(versions.boundVersion(db,3,missing.lesson).content.lesson.review_content,'管理员补齐的真实回顾');
  assert.equal(db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=?').get(broken.id).content_json,originalJson);
  assert.throws(()=>learning.repairLegacy(admin,missing.lesson,3,'不能重复补学'),error=>error.status===409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_version_repairs WHERE student_id=3 AND lesson_id=?').get(missing.lesson).n,1);
});


test('真实缺失的视频旧快照仍可定向补齐，原快照保留且完成修复后不能再次制造补学',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-repair-video-'));
  try {
    const f=fixture();db.prepare("UPDATE lessons SET review_content=NULL,article_blocks='[]' WHERE id=?").run(f.lesson);
    const old=versions.saveVersion(db,f.lesson,true);
    db.prepare('INSERT INTO student_lesson_versions(student_id,lesson_id,content_version_id) VALUES(3,?,?)').run(f.lesson,old.id);
    const video=path.join(dir,'actual.mp4');fs.writeFileSync(video,'0000ftypisom0000');
    db.prepare("INSERT INTO course_replays(course_id,lesson_id,title,description,video_path,created_by) VALUES(?,?,'真实新视频','真实视频介绍',?,1)").run(f.course,f.lesson,video);
    close(f);const repaired=learning.repairLegacy(admin,f.lesson,3,'补齐历史缺失的视频');
    assert.notEqual(repaired.new_version_id,old.id);
    assert.equal(versions.boundVersion(db,3,f.lesson).content.replays[0].file_path,video);
    assert.deepEqual(JSON.parse(db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=?').get(old.id).content_json).replays,[]);
    assert.throws(()=>learning.repairLegacy(admin,f.lesson,3,'已补齐不能重复'),error=>error.status===409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_version_repairs WHERE student_id=3 AND lesson_id=?').get(f.lesson).n,1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
