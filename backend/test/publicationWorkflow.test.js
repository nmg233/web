const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const db=new Database(':memory:');db.pragma('foreign_keys=ON');
require('../database/migrate').runMigrations(db);
require.cache[require.resolve('../config/database')]={exports:db};
const publication=require('../services/publicationService'),learning=require('../services/learningService');
const versions=require('../helpers/lessonVersions'),reviews=require('../services/mentorReviewService');
const admin={id:1,role:'admin'},mentor={id:2,role:'academic_mentor'},other={id:5,role:'academic_mentor'};
for(const [id,role]of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'student'],[5,'academic_mentor']]){
 db.prepare('INSERT INTO users(id,username,real_name,password_hash,role) VALUES(?,?,?,?,?)').run(id,'publication-'+id,'合成用户'+id,'hash',role);
}
db.prepare("INSERT INTO schools(id,name) VALUES(1,'隔离测试学校')").run();
after(()=>db.close());
test('参观课时后台修订不阻断其他正式课时结课',()=>{
 const f=fixture();open(f);const visit=Number(db.prepare("INSERT INTO lessons(course_id,title,review_content,publication_state,presentation_type) VALUES(?,'参观课时','隔离参观的现场介绍','draft','visit')").run(f.course).lastInsertRowid);approve({...f,lesson:visit});
 db.prepare("UPDATE lessons SET review_content='尚未审批的参观修订' WHERE id=?").run(visit);
 const report=finish(f);reviews.review(mentor,report.id,{status:'approved',score:90,comment:'通过'});
 assert.equal(versions.courseState(db,3,f.course,true).completed,true);
});
test('正式课时改为参观模板后，旧学生仍可按原学习版本作答',()=>{
 const f=fixture();open(f);learning.lessonPackage(3,f.lesson);
 db.prepare("UPDATE lessons SET presentation_type='visit',content_state='preparing' WHERE id=?").run(f.lesson);approve(f);
 const oldPackage=learning.lessonPackage(3,f.lesson);
 assert.equal(oldPackage.read_only,false);assert.equal(oldPackage.lesson.content_state,'ready');assert.equal(oldPackage.lesson.publication_state,'published');
 learning.completeReview(3,f.lesson);assert.equal(learning.submitExercise(3,f.exercise,true).correct,true);
 assert.equal(learning.lessonPackage(4,f.lesson).read_only,true);
 assert.deepEqual(versions.courseState(db,3,f.course).lesson_ids,[f.lesson]);assert.deepEqual(versions.courseState(db,4,f.course).lesson_ids,[]);
 const events=publication.read(admin,f.course).events;assert.equal(events.filter(e=>e.action==='close').length,0);assert.equal(events.filter(e=>e.action==='publish').length,2);
});
function fixture({visit=false}={}){
 const course=Number(db.prepare("INSERT INTO courses(title,description,grade_level,difficulty,created_by) VALUES('审批隔离课程','隔离发布验收的真实课程说明','junior','basic',2)").run().lastInsertRowid);
 db.prepare('INSERT INTO course_school_scopes(course_id,school_id,created_by) VALUES(?,1,1)').run(course);
 const lesson=Number(db.prepare("INSERT INTO lessons(course_id,title,publication_state,presentation_type,review_content) VALUES(?,'审批课时','draft',?,'真实人工回顾')").run(course,visit?'visit':'learning').lastInsertRowid);
 const card=learning.createCard(mentor,lesson,{title:'原卡片',content:'原正文',status:'published'}).id;
 const exercise=learning.createExercise(mentor,card,{question_type:'true_false',prompt:'原题',answer:true,explanation:'原详解'}).id;
 for(const student of [3,4])db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(?,?,'active')").run(student,course);
 return{course,lesson,card,exercise};
}
function approve(f,lesson=true){
 const p=publication.submit(mentor,f.course,{lesson_id:lesson?f.lesson:null,reason:'提交合成教材'});
 publication.decide(admin,f.course,p.id,{decision:'approved',reason:'已核对提交快照'});return p;
}
function open(f){approve(f,false);approve(f);}
function finish(f,student=3){
 learning.lessonPackage(student,f.lesson);learning.completeReview(student,f.lesson);
 learning.submitExercise(student,f.exercise,true);learning.completeCard(student,f.card);
 return learning.submitReport(student,f.lesson,{report:{summary:'报告'},reflection:{reflection_version:2,entry_note:'反思'}});
}
test('总课题可先批准介绍；无正式课时不结课，草稿课时不允许学习',()=>{
 const f=fixture();approve(f,false);
 assert.equal(db.prepare('SELECT status FROM courses WHERE id=?').get(f.course).status,'published');
 assert.deepEqual(versions.courseState(db,3,f.course).lesson_ids,[]);
 assert.equal(versions.courseState(db,3,f.course,true).completed,false);
 assert.throws(()=>learning.lessonPackage(3,f.lesson),e=>e.status===409);
});
test('正式版发布前校验卡题；参观课时可无卡题正式发布且不计结课',()=>{
 const f=fixture();db.prepare('DELETE FROM card_exercises WHERE card_id=?').run(f.card);
 assert.throws(()=>approve(f),e=>e.status===409);
 const visit=fixture({visit:true});db.prepare('DELETE FROM card_exercises WHERE card_id=?').run(visit.card);open(visit);
 assert.equal(learning.lessonPackage(3,visit.lesson).read_only,true);
 assert.deepEqual(versions.courseState(db,3,visit.course).lesson_ids,[]);
 assert.equal(versions.courseState(db,3,visit.course,true).completed,false);
});
test('未授权导师无权查看或编辑，导师不能审批；授权管理者直接编辑正式课时草稿',()=>{
 const f=fixture();open(f);
 assert.throws(()=>publication.read(other,f.course),e=>e.status===404);
 assert.throws(()=>publication.close(other,f.course,f.lesson,{reason:'越权'}),e=>e.status===404);
 const p=publication.read(admin,f.course).requests[0];
 assert.throws(()=>publication.decide(mentor,f.course,p.id,{decision:'approved',reason:'越权'}),e=>e.status===403);
 assert.throws(()=>publication.close(mentor,f.course,f.lesson,{reason:'旧页面操作'}),e=>e.status===410);
 assert.throws(()=>learning.updateCard(other,f.card,{content:'越权修改'}),e=>e.status===403);
 learning.updateCard(mentor,f.card,{content:'直接修改草稿'});
 assert.equal(learning.managedContext(mentor,f.lesson).read_only,false);
 assert.equal(learning.lessonPackage(3,f.lesson).cards[0].content,'原正文');
});
test('提交后改稿不能批准未审内容；驳回保留草稿，再提批准才开放',()=>{
 const f=fixture(),p=publication.submit(mentor,f.course,{lesson_id:f.lesson,reason:'初次申请'});
 learning.updateCard(mentor,f.card,{content:'申请后改稿'});
 assert.throws(()=>publication.decide(admin,f.course,p.id,{decision:'approved',reason:'试图批准'}),e=>e.status===409);
 publication.decide(admin,f.course,p.id,{decision:'rejected',reason:'请按现稿重新申请'});
 assert.equal(db.prepare('SELECT publication_state FROM lessons WHERE id=?').get(f.lesson).publication_state,'draft');
 approve(f);assert.equal(db.prepare('SELECT publication_state FROM lessons WHERE id=?').get(f.lesson).publication_state,'published');
});
test('修改、待审批和驳回均不停课；保留旧版本旧答案及一次作答，新开始学生使用审批新版',()=>{
 const f=fixture();open(f);learning.lessonPackage(3,f.lesson);learning.completeReview(3,f.lesson);learning.submitExercise(3,f.exercise,true);
 const old=versions.boundVersion(db,3,f.lesson).id;
 learning.updateCard(mentor,f.card,{content:'新版正文'});learning.updateExercise(mentor,f.exercise,{answer:false,explanation:'新版详解'});
 const pending=publication.submit(mentor,f.course,{lesson_id:f.lesson,reason:'不停课提交新版'});
 assert.equal(learning.lessonPackage(3,f.lesson).cards[0].content,'原正文');
 learning.completeCard(3,f.card);
 assert.equal(publication.read(admin,f.course).lessons.find(l=>l.lesson_id===f.lesson).draft_changed,true);
 publication.decide(admin,f.course,pending.id,{decision:'rejected',reason:'继续核对'});
 assert.equal(learning.lessonPackage(3,f.lesson).cards[0].exercises[0].explanation,'原详解');
 approve(f);
 const oldPkg=learning.lessonPackage(3,f.lesson),fresh=learning.lessonPackage(4,f.lesson);
 assert.equal(oldPkg.content_version.id,old);assert.equal(oldPkg.cards[0].content,'原正文');
 assert.equal(oldPkg.cards[0].exercises[0].correct_answer,true);assert.equal(oldPkg.cards[0].exercises[0].explanation,'原详解');
 assert.equal(fresh.cards[0].content,'新版正文');assert.notEqual(fresh.content_version.id,old);
 assert.throws(()=>learning.submitExercise(3,f.exercise,true),e=>e.code==='MAX_ATTEMPTS_REACHED');
});
test('修改草稿期间可按旧报告评审、退回及重提，不改写旧报告历史',()=>{
 const f=fixture();open(f);const report=finish(f);
 learning.updateCard(mentor,f.card,{content:'尚未审批的后台修订'});
 reviews.review(mentor,report.id,{status:'rejected',score:60,comment:'补充反思'});
 assert.equal(reviews.detail(mentor,report.id).cards[0].exercises[0].reference_answer,true);
 const next=learning.submitReport(3,f.lesson,{report:{summary:'重提'},reflection:{reflection_version:2,entry_note:'补充'},base_report_id:report.id});
 assert.notEqual(next.id,report.id);assert.equal(reviews.detail(mentor,next.id).history.length,2);
});
test('申请人撤权后不能批准，重复提交和重复审批不生成重复正式版本',()=>{
 const f=fixture(),p=publication.submit(mentor,f.course,{lesson_id:f.lesson,reason:'申请'});
 assert.equal(publication.submit(mentor,f.course,{lesson_id:f.lesson,reason:'重复'}).id,p.id);
 db.prepare('UPDATE course_managers SET active=0 WHERE course_id=? AND mentor_id=2').run(f.course);
 assert.throws(()=>publication.decide(admin,f.course,p.id,{decision:'approved',reason:'审批'}),e=>e.status===409);
 db.prepare('UPDATE course_managers SET active=1 WHERE course_id=? AND mentor_id=2').run(f.course);
 publication.decide(admin,f.course,p.id,{decision:'approved',reason:'批准'});
 assert.equal(publication.decide(admin,f.course,p.id,{decision:'approved',reason:'重复批准'}).replayed,true);
});
test('已结课不回退；未结课学生新增草稿不计分母，正式发布后纳入要求',()=>{
 const f=fixture();open(f);const report=finish(f);reviews.review(mentor,report.id,{status:'approved',score:90,comment:'通过'});
 assert.equal(versions.courseState(db,3,f.course,true).completed,true);
 const added=Number(db.prepare("INSERT INTO lessons(course_id,title,review_content,publication_state,presentation_type) VALUES(?,'新增参观','补充的参观现场记录','draft','visit')").run(f.course).lastInsertRowid);
 assert.deepEqual(versions.courseState(db,4,f.course).lesson_ids,[f.lesson]);
 approve({...f,lesson:added});assert.deepEqual(versions.courseState(db,4,f.course).lesson_ids,[f.lesson]);
 learning.updateCard(mentor,f.card,{content:'已结课后修订草稿'});
 assert.equal(versions.courseState(db,3,f.course,true).completed,true);
 assert.equal(versions.courseState(db,4,f.course,true).completed,false);
});
