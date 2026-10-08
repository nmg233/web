const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-remediation-'));
process.env.UPLOAD_PATH = tmp;
const db = new Database(':memory:');
db.pragma('foreign_keys=ON');
require('../database/migrate').runMigrations(db);
require.cache[require.resolve('../config/database')] = { exports: db };
const learning = require('../services/learningService');
const review = require('../services/mentorReviewService');
const versions = require('../helpers/lessonVersions');
const gate = require('../helpers/learningGate');
const courses = require('../controllers/courseController');
const works = require('../controllers/workController');
const observer = require('../services/observerService');
const org = require('../services/organizationService');
const notifications = require('../services/notificationService');
const mentor = { id: 2, role: 'academic_mentor' };
const admin = { id: 1, role: 'admin' };
for (const [id, role] of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'student'],[5,'teacher'],[6,'academic_mentor']]) {
  db.prepare('INSERT INTO users (id,username,password_hash,real_name,role,teacher_id) VALUES (?,?,?,?,?,?)').run(id,`u${id}`,'hash',`用户${id}`,role,role === 'student' ? 5 : null);
}
after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
function fixture(type = 'single_choice', answer = 'A', options = ['A','B']) {
  const course = Number(db.prepare("INSERT INTO courses (title,grade_level,difficulty,status,created_by) VALUES ('闭环测试','primary','basic','published',2)").run().lastInsertRowid);
  const lesson = Number(db.prepare("INSERT INTO lessons (course_id,title,status,instructor_id) VALUES (?,'课时','completed',2)").run(course).lastInsertRowid);
  for (const student of [3,4]) db.prepare("INSERT INTO enrollments (student_id,course_id,status) VALUES (?,?,'active')").run(student,course);
  const file = path.join(tmp,`video-${course}.mp4`); fs.writeFileSync(file, '0000ftypisom0000');
  db.prepare("INSERT INTO course_replays (course_id,lesson_id,title,description,video_path,created_by) VALUES (?,?,'回放','视频简介',?,2)").run(course,lesson,file);
  const card = learning.createCard(mentor, lesson, { title:'卡片',content:'正文',status:'published' }).id;
  const exercise = learning.createExercise(mentor, card, { question_type:type,prompt:'问题',options,answer,explanation:'旧详解',points:2 }).id;
  return { course, lesson, card, exercise };
}
function runController(handler, req) {
  const res = { code:200, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } };
  handler({ user:admin,params:{},body:{},...req },res); return res;
}
function finish(f, student = 3, answer = 'A') {
  learning.lessonPackage(student,f.lesson); learning.completeReview(student,f.lesson);
  learning.submitExercise(student,f.exercise,answer); learning.completeCard(student,f.card);
  return learning.submitReport(student,f.lesson,{report:{summary:'总结'},reflection:{difficulty:'困难'}});
}
test('内容缺失禁止首次进入，失败不产生绑定；预览不会消耗答题机会', () => {
  const f=fixture(); db.prepare('DELETE FROM course_replays WHERE course_id=?').run(f.course);
  assert.throws(()=>learning.lessonPackage(3,f.lesson),e=>e.code==='LESSON_CONTENT_INCOMPLETE');
  assert.equal(versions.boundVersion(db,3,f.lesson),null);
  assert.equal(learning.listManagedCards(mentor,f.lesson)[0].exercises[0].answer,'A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM card_exercise_attempts').get().n,0);
});

test('课程共享视频不能替代指定课时必需视频，完成绑定后才允许首次进入', () => {
  const f=fixture();db.prepare('UPDATE course_replays SET lesson_id=NULL WHERE course_id=?').run(f.course);
  assert.throws(()=>learning.lessonPackage(3,f.lesson),e=>e.code==='LESSON_CONTENT_INCOMPLETE');
  assert.equal(versions.boundVersion(db,3,f.lesson),null);
  db.prepare('UPDATE course_replays SET lesson_id=? WHERE course_id=?').run(f.lesson,f.course);
  assert.ok(learning.lessonPackage(3,f.lesson).content_version.id);
});
test('无效选项、重复多选、非布尔判断和空参考答案被拒绝', () => {
  const f=fixture();
  for (const data of [
    {question_type:'single_choice',options:['A','B'],answer:'C'},
    {question_type:'multiple_choice',options:['A','B'],answer:['A','A']},
    {question_type:'true_false',answer:'false'},
    {question_type:'fill_blank',answer:{blanks:[[]]}},
    {question_type:'short_answer',answer:' '},
  ]) assert.throws(()=>learning.createExercise(mentor,f.card,{prompt:'问题',explanation:'详解',...data}));
  learning.lessonPackage(3,f.lesson); learning.completeReview(3,f.lesson);
  assert.throws(()=>learning.submitExercise(3,f.exercise,'C'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM card_exercise_attempts WHERE exercise_id=?').get(f.exercise).n,0);
  assert.equal(learning.submitExercise(3,f.exercise,'B').correct,false);
  learning.completeCard(3,f.card);
  assert.equal(learning.lessonPackage(3,f.lesson).cards[0].best_score,0,'完成不等于满分');
  assert.throws(()=>learning.submitExercise(3,f.exercise,'A'),e=>e.code==='MAX_ATTEMPTS_REACHED');
});
test('填空题多空多答案，只忽略首尾空格；简答提交即完成且不判错', () => {
  const f=fixture('fill_blank',{blanks:[['ABC','Abc'],['句号。']]},[]);
  learning.lessonPackage(3,f.lesson); learning.completeReview(3,f.lesson);
  assert.equal(learning.submitExercise(3,f.exercise,[' abc ','句号。']).correct,false);
  learning.lessonPackage(4,f.lesson); learning.completeReview(4,f.lesson);
  assert.equal(learning.submitExercise(4,f.exercise,[' ABC ','句号。 ']).correct,true);
  const short=fixture('short_answer','参考表达',[]);
  learning.lessonPackage(3,short.lesson); learning.completeReview(3,short.lesson);
  const result=learning.submitExercise(3,short.exercise,'不同表达');
  assert.equal(result.correct,null);
  assert.equal(db.prepare('SELECT is_correct FROM card_exercise_attempts WHERE exercise_id=?').get(short.exercise).is_correct,null);
  learning.completeCard(3,short.card);
  assert.equal(learning.lessonPackage(3,short.lesson).cards[0].best_score,null);
});
test('服务端强制卡片顺序，不能先答第二张卡或直接完成空卡片', () => {
  const f=fixture();
  const card=learning.createCard(mentor,f.lesson,{title:'第二张',content:'内容',status:'published'}).id;
  const exercise=learning.createExercise(mentor,card,{question_type:'true_false',prompt:'判断',answer:true,explanation:'详解'}).id;
  learning.lessonPackage(3,f.lesson); learning.completeReview(3,f.lesson);
  assert.throws(()=>learning.submitExercise(3,exercise,true),e=>e.code==='CARD_ORDER_REQUIRED');
  assert.throws(()=>learning.completeCard(3,card),e=>e.code==='CARD_ORDER_REQUIRED');
});
test('开始后改题、新增卡片及删除题库不改变旧版本；新学生使用新版本', () => {
  const f=fixture(); const old=learning.lessonPackage(3,f.lesson);
  learning.updateExercise(mentor,f.exercise,{answer:'B',explanation:'新详解',prompt:'新题目'});
  const fresh=learning.lessonPackage(4,f.lesson);
  assert.notEqual(old.content_version.id,fresh.content_version.id);
  learning.completeReview(3,f.lesson);
  const answer=learning.submitExercise(3,f.exercise,'A');
  assert.equal(answer.correct,true); assert.equal(answer.explanation,'旧详解');
  learning.deleteExercise(mentor,f.exercise);
  learning.completeCard(3,f.card);
  assert.equal(learning.lessonPackage(3,f.lesson).cards[0].exercises[0].student_answer,'A');
  assert.equal(learning.listManagedCards(mentor,f.lesson)[0].exercises.length,0);
  assert.equal(learning.lessonPackage(4,f.lesson).cards[0].exercises.length,1);
});
test('逐题查看与反馈按课程授权，反馈学生可见且不增加答题机会', () => {
  const f=fixture(); const r=finish(f);
  const detail=review.detail(mentor,r.id);
  assert.equal(detail.cards[0].exercises[0].student_answer,'A');
  assert.equal(detail.cards[0].exercises[0].reference_answer,'A');
  assert.throws(()=>review.feedback({id:6,role:'academic_mentor'},r.id,f.exercise,{content:'越权'}),e=>e.status===403);
  review.feedback(mentor,r.id,f.exercise,{content:'注意应用条件'});
  assert.equal(learning.lessonPackage(3,f.lesson).cards[0].exercises[0].feedback.content,'注意应用条件');
});
test('队列只显示最新版本，待评与待修改阻止关闭，全部通过持久化结课', () => {
  const f=fixture(); const first=finish(f);
  assert.equal(runController(courses.update,{params:{id:f.course},body:{status:'archived'}}).code,409);
  review.review(mentor,first.id,{status:'rejected',score:60,comment:'请修改'});
  assert.equal(runController(courses.cancelLesson,{params:{lessonId:f.lesson},body:{reason:'取消'}}).code,409);
  const latest=learning.submitReport(3,f.lesson,{report:{summary:'修正版'},reflection:{difficulty:'补充'},base_report_id:first.id});
  assert.equal(review.list(mentor,{student_id:3,lesson_id:f.lesson,status:'rejected'}).items.length,0);
  review.review(mentor,latest.id,{status:'approved',score:95});
  const teacherDashboard = observer.dashboard({id:5,role:'teacher'});
  assert.deepEqual(teacherDashboard.recent_reports.filter((r)=>r.lesson_title==='课时' && r.id===first.id),[],'旧退回报告不再作为当前待处理项');
  assert.equal(observer.students({id:5,role:'teacher'}).items.find((s)=>s.id===3).latest_report_status,'approved');
  const closed=versions.courseState(db,3,f.course);
  assert.equal(closed.completed,true); assert.ok(closed.completed_at);
  const added=runController(courses.addLesson,{params:{id:f.course},body:{title:'新增课时'}});
  assert.equal(added.code,200);
  assert.deepEqual(versions.courseState(db,3,f.course),closed,'已结课结果及原课时范围不变');
  assert.equal(versions.courseState(db,4,f.course).completed,false);
  assert.ok(versions.courseState(db,4,f.course).lesson_ids.includes(added.body.id));
});
test('任何学习痕迹均阻止移除报名，作品与成长事件同事务回滚', () => {
  const f=fixture(); learning.lessonPackage(3,f.lesson);
  const enrollment=db.prepare('SELECT id FROM enrollments WHERE student_id=3 AND course_id=?').get(f.course);
  assert.equal(runController(courses.removeEnrollment,{params:{courseId:f.course,enrollmentId:enrollment.id},body:{reason:'异常修正'}}).code,400);
  const task=Number(db.prepare("INSERT INTO tasks (lesson_id,title,status) VALUES (?,'独立成果','active')").run(f.lesson).lastInsertRowid);
  db.exec("CREATE TRIGGER fail_growth BEFORE INSERT ON growth_records BEGIN SELECT RAISE(ABORT,'growth failed'); END");
  try {
    const result=runController(works.upload,{user:{id:4,role:'student'},body:{title:'成果',description:'文字',task_id:task}});
    assert.equal(result.code,500);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM works WHERE task_id=?').get(task).n,0);
  } finally { db.exec('DROP TRIGGER fail_growth'); }
  assert.equal(runController(works.upload,{user:{id:4,role:'student'},body:{title:'成果',description:'文字',task_id:task}}).code,200);
});
test('归档课程和取消课时的独立成果只能查看，不允许删除或批改', () => {
  const f=fixture();
  const task=Number(db.prepare("INSERT INTO tasks (lesson_id,title,status) VALUES (?,'成果','active')").run(f.lesson).lastInsertRowid);
  const id=Number(db.prepare("INSERT INTO works (student_id,enrollment_id,task_id,title,description) VALUES (3,? ,?,'成果','内容')").run(db.prepare('SELECT id FROM enrollments WHERE student_id=3 AND course_id=?').get(f.course).id,task).lastInsertRowid);
  for (const target of ['course','lesson']) {
    db.prepare("UPDATE courses SET status=? WHERE id=?").run(target==='course'?'archived':'published',f.course);
    db.prepare("UPDATE lessons SET status=? WHERE id=?").run(target==='lesson'?'cancelled':'completed',f.lesson);
    assert.equal(runController(works.review,{params:{id},body:{status:'rejected'}}).code,409);
    assert.equal(runController(works.reject,{params:{id},body:{reason:'退回'}}).code,409);
    assert.equal(runController(works.delete,{user:{id:3,role:'student'},params:{id}}).code,409);
    assert.equal(db.prepare('SELECT review_status FROM works WHERE id=?').get(id).review_status,'pending');
    assert.equal(runController(works.detail,{params:{id}}).code,200);
  }
});

test('教师包含未开始课时及超过100名学生的统计；学校停用仅阻止新增', () => {
  const f=fixture();
  const detail=observer.studentDetail({id:5,role:'teacher'},3);
  assert.ok(detail.lessons.some(l=>l.lesson_id===f.lesson && l.progress===0));
  const before=observer.dashboard({id:5,role:'teacher'}).stats.weekly_completed;
  for(let i=100;i<205;i++) {
    db.prepare("INSERT INTO users (id,username,password_hash,real_name,role,teacher_id) VALUES (?,?,'hash','测试学生','student',5)").run(i,`u${i}`);
    db.prepare('INSERT INTO lesson_progress (student_id,lesson_id,progress,completed_at) VALUES (?,?,100,CURRENT_TIMESTAMP)').run(i,f.lesson);
  }
  assert.equal(observer.dashboard({id:5,role:'teacher'}).stats.weekly_completed,before+105);
  const school=org.createSchool({name:'组织测试'}).id;
  org.createClass({name:'班级',school_id:school});
  assert.throws(()=>org.deleteSchool(school),e=>e.status===409);
  org.setSchoolActive(school,false);
  assert.equal(org.createClass({name:'新班级',school_id:school}),null);
});
test('通知投递失败持久化，修复后重试只投递一次', () => {
  db.exec("CREATE TRIGGER fail_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'notification failed'); END");
  const payload={eventKey:'system.test',dedupeKey:'test:outbox',title:'测试',content:'正文',category:'system'};
  assert.equal(notifications.safeCreateForUsers(payload,[3]),null);
  db.exec('DROP TRIGGER fail_notification');
  notifications.retryOutbox(); notifications.retryOutbox();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe_key='test:outbox'").get().n,1);
  assert.ok(db.prepare("SELECT delivered_at FROM notification_outbox WHERE event_key='test:outbox'").get().delivered_at);
});
test('数据库完整性与外键检查通过', () => {
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
});

test('历史缺题定向修复只影响指定学生，不重置已有作答、分数或报告快照', () => {
  const f=fixture();
  const second=learning.createCard(mentor,f.lesson,{title:'旧缺题卡',content:'内容',status:'published'}).id;
  const old=versions.saveVersion(db,f.lesson,true);
  for(const student of [3,4]) db.prepare('INSERT INTO student_lesson_versions (student_id,lesson_id,content_version_id) VALUES (?,?,?)').run(student,f.lesson,old.id);
  learning.completeReview(3,f.lesson);
  learning.submitExercise(3,f.exercise,'B'); learning.completeCard(3,f.card);
  const attempt=db.prepare('SELECT * FROM card_exercise_attempts WHERE student_id=3 AND exercise_id=?').get(f.exercise);
  const report=Number(db.prepare("INSERT INTO lesson_learning_reports (student_id,lesson_id,enrollment_id,summary,status,version) VALUES (3,?,?, '历史报告','rejected',1)").run(f.lesson,db.prepare('SELECT id FROM enrollments WHERE student_id=3 AND course_id=?').get(f.course).id).lastInsertRowid);
  db.prepare('INSERT INTO report_content_versions (report_id,content_version_id) VALUES (?,?)').run(report,old.id);
  const added=learning.createExercise(mentor,second,{question_type:'true_false',prompt:'补齐题',answer:true,explanation:'详解'}).id;
  assert.throws(()=>learning.repairLegacy(mentor,f.lesson,3,'补齐'),e=>e.status===403);
  const repaired=learning.repairLegacy(admin,f.lesson,3,'历史缺题修复');
  assert.notEqual(repaired.new_version_id,old.id);
  assert.equal(versions.boundVersion(db,4,f.lesson).id,old.id);
  assert.deepEqual(db.prepare('SELECT * FROM card_exercise_attempts WHERE student_id=3 AND exercise_id=?').get(f.exercise),attempt);
  assert.throws(()=>learning.submitExercise(3,f.exercise,'A'),e=>e.code==='MAX_ATTEMPTS_REACHED');
  assert.equal(review.detail(mentor,report).content_version,old.id);
  assert.equal(review.detail(mentor,report).cards[1].exercises.length,0);
  learning.submitExercise(3,added,true); learning.completeCard(3,second);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_version_repairs WHERE student_id=3 AND lesson_id=?').get(f.lesson).n,1);
});

test('通知事件入队失败时报告业务一起回滚，而投递失败时保留可重试事件', () => {
  const f=fixture(); learning.lessonPackage(3,f.lesson); learning.completeReview(3,f.lesson);
  learning.submitExercise(3,f.exercise,'A'); learning.completeCard(3,f.card);
  db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'outbox failed'); END");
  try {
    assert.throws(()=>learning.submitReport(3,f.lesson,{report:{summary:'总结'},reflection:{difficulty:'困难'}}));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_learning_reports WHERE lesson_id=?').get(f.lesson).n,0);
  } finally { db.exec('DROP TRIGGER fail_outbox'); }
  db.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'delivery failed'); END");
  let report;
  try { report=learning.submitReport(3,f.lesson,{report:{summary:'总结'},reflection:{difficulty:'困难'}}); }
  finally { db.exec('DROP TRIGGER fail_delivery'); }
  notifications.retryOutbox();
  assert.ok(db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(`lesson.report_submitted:${report.id}`).delivered_at);
});
