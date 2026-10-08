const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-release-closure-'));
process.env.UPLOAD_PATH=tmp;
const db=new Database(':memory:');db.pragma('foreign_keys=ON');
require('../database/migrate').runMigrations(db);
require.cache[require.resolve('../config/database')]={exports:db};
const learning=require('../services/learningService'),versions=require('../helpers/lessonVersions'),review=require('../services/mentorReviewService');
const courses=require('../controllers/courseController'),students=require('../controllers/studentController'),org=require('../services/organizationService');
const notify=require('../services/notificationService'),policy=require('../policies/studentPolicy'),readiness=require('../helpers/readiness');
const admin={id:1,role:'admin'},mentor={id:2,role:'academic_mentor'};
for(const [id,role] of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'teacher'],[5,'teacher'],[6,'teacher']])
  db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'fixture'+id,'unchanged-hash','测试姓名'+id,role);
db.exec("INSERT INTO schools(id,name) VALUES(1,'原校'),(2,'目标校'); INSERT INTO classes(id,name,school_id) VALUES(1,'原班',1),(2,'目标班',2)");
db.prepare('UPDATE users SET school_id=1,class_id=1 WHERE id IN (3,4)').run();
db.prepare('UPDATE users SET school_id=2,class_id=2 WHERE id=5').run();
after(()=>{db.close();fs.rmSync(tmp,{recursive:true,force:true});});
function call(fn,request){const res={code:200,status(v){this.code=v;return this;},json(v){this.body=v;return this;}};fn({user:admin,params:{},body:{},...request},res);return res;}
function fixture(withExercise=true){
  const course=Number(db.prepare("INSERT INTO courses(title,grade_level,difficulty,status,created_by) VALUES('闭环','primary','basic','published',2)").run().lastInsertRowid);
  const lesson=Number(db.prepare("INSERT INTO lessons(course_id,title,status,instructor_id) VALUES(?,'课时','completed',2)").run(course).lastInsertRowid);
  db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(3,?,'active')").run(course);
  const file=path.join(tmp,course+'.mp4');fs.writeFileSync(file,'0000ftypisom0000');
  const replay=Number(db.prepare("INSERT INTO course_replays(course_id,lesson_id,title,description,video_path,created_by) VALUES(?,?,'视频','简介',?,2)").run(course,lesson,file).lastInsertRowid);
  const card=learning.createCard(admin,lesson,{title:'卡片',content:'正文',status:'published'}).id;
  const exercise=withExercise ? learning.createExercise(admin,card,{question_type:'single_choice',prompt:'题干',options:['A','B'],answer:'A',explanation:'详解'}).id : null;
  return {course,lesson,replay,card,exercise,file};
}
function finish(f){learning.lessonPackage(3,f.lesson);learning.completeReview(3,f.lesson);learning.submitExercise(3,f.exercise,'A');learning.completeCard(3,f.card);return learning.submitReport(3,f.lesson,{report:{summary:'报告'},reflection:{difficulty:'反思'}});}

test('N01/N02：旧入口拒绝不完整迁校，完整迁移保留账号密码导师及学习记录，重试只有一份审计',()=>{
  db.prepare('UPDATE users SET school_id=1,class_id=1,teacher_id=4,mentor_id=2 WHERE id=3').run();
  const before=db.prepare('SELECT * FROM users WHERE id=3').get(),f=fixture();finish(f);
  const attempts=db.prepare('SELECT * FROM card_exercise_attempts').all();
  assert.equal(call(students.updateStudent,{params:{id:3},body:{school_id:2,class_id:2}}).code,400);
  assert.equal(call(students.updateUser,{params:{id:3},body:{real_name:'测试姓名3',role:'student',school_id:2,class_id:2}}).code,409);
  const data={school_id:2,class_id:2,teacher_id:5,reason:'跨校安排',source_school_id:1,request_key:'single_transfer_key'};
  const first=org.assignStudent(admin,3,data);assert.deepEqual(org.assignStudent(admin,3,data),first);
  const afterUser=db.prepare('SELECT * FROM users WHERE id=3').get();
  for(const key of ['username','password_hash','mentor_id','auth_version','is_active']) assert.equal(afterUser[key],before[key]);
  assert.deepEqual(db.prepare('SELECT * FROM card_exercise_attempts').all(),attempts);
  assert.equal(policy.canViewStudent({id:4,role:'teacher'},afterUser),false);assert.equal(policy.canViewStudent({id:5,role:'teacher'},afterUser),true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_school_transfers WHERE student_id=3').get().n,1);
  assert.equal(call(students.detail,{params:{id:3}}).body.schoolTransfers.length,1);
  assert.equal(call(students.detail,{params:{id:3},user:{id:5,role:'teacher'}}).body.schoolTransfers,undefined,'迁移管理记录不暴露给教师');
  assert.notEqual(call(students.deleteUser,{params:{id:5}}).code,200,'新负责教师的迁移历史不能因删除账号丢失');
  org.assignStudent(admin,3,{school_id:2});assert.equal(db.prepare('SELECT mentor_id FROM users WHERE id=3').get().mentor_id,2);
  org.assignStudent(admin,3,{teacher_id:null});assert.equal(db.prepare('SELECT class_id FROM users WHERE id=3').get().class_id,2);
});

test('N01：教师仍负责学生时，通用资料编辑不能把教师迁到另一学校',()=>{
  db.prepare('UPDATE users SET teacher_id=4 WHERE id=3').run();
  assert.equal(call(students.updateUser,{params:{id:4},body:{real_name:'测试姓名4',role:'teacher',school_id:2,class_id:2}}).code,409);
});

test('N01：目标停用、教师错误、无原因或试图改导师均不得留下部分更新',()=>{
  db.prepare('UPDATE users SET school_id=1,class_id=1,teacher_id=4,mentor_id=2 WHERE id=3').run();
  const prior=db.prepare('SELECT * FROM users WHERE id=3').get();
  for(const data of [{school_id:2,class_id:2,teacher_id:4,reason:'原因'},{school_id:2,class_id:2,teacher_id:5},{school_id:2,class_id:2,teacher_id:5,mentor_id:null,reason:'原因'}]) assert.throws(()=>org.assignStudent(admin,3,data));
  db.prepare('UPDATE schools SET is_active=0 WHERE id=2').run();assert.throws(()=>org.assignStudent(admin,3,{school_id:2,class_id:2,teacher_id:5,reason:'原因'}));db.prepare('UPDATE schools SET is_active=1 WHERE id=2').run();
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=3').get(),prior);
});

test('N01：迁校审计失败时关系与幂等结果一起回滚',()=>{
  db.exec("CREATE TRIGGER fail_transfer BEFORE INSERT ON student_school_transfers BEGIN SELECT RAISE(ABORT,'audit failed'); END");
  const prior=db.prepare('SELECT * FROM users WHERE id=3').get();
  try{assert.throws(()=>org.assignStudent(admin,3,{school_id:2,class_id:2,teacher_id:5,reason:'原因',request_key:'transfer_rollback'}));}
  finally{db.exec('DROP TRIGGER fail_transfer');}
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=3').get(),prior);
});

test('N03：补题后旧待评报告只读，补学重提新版通过才持久结课，原报告和答案保留',()=>{
  const f=fixture(false),old=versions.saveVersion(db,f.lesson,true);
  db.prepare('INSERT INTO student_lesson_versions(student_id,lesson_id,content_version_id) VALUES(3,?,?)').run(f.lesson,old.id);
  db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(3,?)').run(f.lesson);
  db.prepare('INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(3,?,CURRENT_TIMESTAMP)').run(f.card);
  const report=Number(db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,summary,status) VALUES(3,?,'旧报告','submitted')").run(f.lesson).lastInsertRowid);
  db.prepare('INSERT INTO report_content_versions(report_id,content_version_id) VALUES(?,?)').run(report,old.id);
  const original=db.prepare('SELECT * FROM lesson_learning_reports WHERE id=?').get(report);
  const exercise=learning.createExercise(admin,f.card,{question_type:'true_false',prompt:'补齐题',answer:true,explanation:'详解'}).id;
  learning.repairLegacy(admin,f.lesson,3,'缺题补齐');
  assert.equal(versions.courseState(db,3,f.course).completed,false);
  assert.throws(()=>review.review(mentor,report,{status:'approved',score:90}),e=>e.code==='REPORT_REPLACEMENT_REQUIRED');
  assert.equal(review.list(mentor,{lesson_id:f.lesson,status:'submitted'}).items.length,0);
  assert.equal(review.detail(mentor,report).read_only,true);
  assert.equal(learning.lessonPackage(3,f.lesson).report.resubmission_required,true);
  const observer=require('../services/observerService');
  assert.equal(observer.students(admin,{learning_status:'revision'}).items.some(s=>s.id===3),true);
  assert.equal(observer.studentDetail(admin,3).lessons.find(l=>l.lesson_id===f.lesson).report_status,'rejected');
  assert.throws(()=>learning.submitReport(3,f.lesson,{report:{summary:'新版'},reflection:{difficulty:'反思'}}),e=>e.code==='REPORT_LOCKED');
  learning.submitExercise(3,exercise,true);learning.completeCard(3,f.card);
  const next=learning.submitReport(3,f.lesson,{report:{summary:'新版'},reflection:{difficulty:'反思'},base_report_id:report});
  assert.notEqual(next.id,report);review.review(mentor,next.id,{status:'approved',score:95});
  assert.equal(versions.courseState(db,3,f.course).completed,true);assert.ok(versions.courseState(db,3,f.course).completed_at);
  assert.deepEqual(db.prepare('SELECT * FROM lesson_learning_reports WHERE id=?').get(report),original);
  assert.throws(()=>learning.submitExercise(3,exercise,false),e=>e.code==='MAX_ATTEMPTS_REACHED');
});

test('N04：取消未完成课时即落库结课时间，新增课时及重复查询不改原结果',()=>{
  const f=fixture(),other=Number(db.prepare("INSERT INTO lessons(course_id,title,status) VALUES(?,'取消课时','completed')").run(f.course).lastInsertRowid);
  review.review(mentor,finish(f).id,{status:'approved',score:90});assert.equal(versions.courseState(db,3,f.course).completed,false);
  assert.equal(call(courses.cancelLesson,{params:{lessonId:other},body:{reason:'不再开展'}}).code,200);
  const closure=versions.courseState(db,3,f.course);assert.ok(closure.completed_at);assert.equal(closure.completed,true);
  assert.equal(call(courses.addLesson,{params:{id:f.course},body:{title:'新课时'}}).code,200);assert.deepEqual(versions.courseState(db,3,f.course),closure);
});

for(const action of ['archive','cancel']) test(`N05：${action} 阻断最新待评及退回作品，旧退回新版通过不阻断`,()=>{
  const f=fixture(),task=Number(db.prepare("INSERT INTO tasks(lesson_id,title,status) VALUES(?,'独立任务','active')").run(f.lesson).lastInsertRowid);
  const enrollment=db.prepare('SELECT id FROM enrollments WHERE student_id=3 AND course_id=?').get(f.course).id;
  const work=Number(db.prepare("INSERT INTO works(student_id,enrollment_id,task_id,title,review_status) VALUES(3,?,?,'成果','pending')").run(enrollment,task).lastInsertRowid);
  const close=()=>action==='archive'?call(courses.update,{params:{id:f.course},body:{status:'archived'}}):call(courses.cancelLesson,{params:{lessonId:f.lesson},body:{reason:'取消'}});
  assert.equal(close().code,409);db.prepare("UPDATE works SET review_status='rejected' WHERE id=?").run(work);assert.equal(close().code,409);
  db.prepare("INSERT INTO works(student_id,enrollment_id,task_id,title,review_status,parent_work_id,version) VALUES(3,?,?,'新版','approved',?,2)").run(enrollment,task,work);
  assert.equal(close().code,200);
});

test('N06：仅首次进入的学习版本记录也禁止撤回，无历史课程允许撤回',()=>{
  const f=fixture();assert.equal(call(courses.update,{params:{id:f.course},body:{status:'draft'}}).code,200);
  call(courses.update,{params:{id:f.course},body:{status:'published'}});learning.lessonPackage(3,f.lesson);
  assert.equal(call(courses.update,{params:{id:f.course},body:{status:'draft'}}).code,409);
});

test('N07：取消且没有快照的课时视频仍只读，文件与记录保持',()=>{
  const f=fixture();assert.equal(call(courses.cancelLesson,{params:{lessonId:f.lesson},body:{reason:'取消'}}).code,200);
  assert.equal(call(courses.deleteReplay,{params:{replayId:f.replay}}).code,409);assert.ok(fs.existsSync(f.file));
  assert.ok(db.prepare('SELECT 1 FROM course_replays WHERE id=?').get(f.replay));
});

test('N09/N10：退役题不计入当前题数，含题卡保留归档，空卡可删除且无外键异常',()=>{
  const f=fixture();learning.deleteExercise(admin,f.exercise);
  assert.equal(learning.listManagedLessons(mentor).find(x=>x.id===f.lesson).exercise_count,0);
  assert.equal(learning.deleteCard(admin,f.card).archived,true);
  assert.equal(db.prepare('SELECT status FROM knowledge_cards WHERE id=?').get(f.card).status,'archived');
  assert.ok(db.prepare('SELECT 1 FROM retired_exercises WHERE exercise_id=?').get(f.exercise));
  const empty=learning.createCard(admin,f.lesson,{title:'空卡片',content:'正文',status:'draft'}).id;
  assert.equal(learning.deleteCard(admin,empty).deleted,true);assert.deepEqual(db.pragma('foreign_key_check'),[]);
});

test('N11：标签型选项创建成功后完整性检查一致，可完成一次作答',()=>{
  const f=fixture(false),exercise=learning.createExercise(admin,f.card,{question_type:'single_choice',prompt:'题',options:[{label:'一'},{label:'二'}],answer:'0',explanation:'详解'}).id;
  assert.equal(versions.readiness(db,f.lesson).ready,true);learning.lessonPackage(3,f.lesson);learning.completeReview(3,f.lesson);
  assert.equal(learning.submitExercise(3,exercise,'0').correct,true);
});

test('N12：只有幂等缓存的无职责用户可以删除，缓存原子清理不造成500',()=>{
  db.prepare("INSERT INTO request_results(actor_id,scope,request_key,fingerprint,result_json) VALUES(6,'feedback','fixturekey','hash','{}')").run();
  assert.equal(call(students.deleteUser,{params:{id:6}}).code,200);
  assert.equal(db.prepare('SELECT 1 FROM request_results WHERE actor_id=6').get(),undefined);
});

test('N13：100个坏JSON不阻塞后续合法通知，退避隔离和人工重放保持去重',()=>{
  for(let i=0;i<100;i++) db.prepare("INSERT INTO notification_outbox(event_key,payload_json,recipients_json,created_at) VALUES(?,'bad','[3]','2000-01-01')").run('bad'+i);
  const payload={eventKey:'system.test',title:'合法通知',category:'course',content:'内容',level:'normal'};
  db.prepare("INSERT INTO notification_outbox(event_key,payload_json,recipients_json,created_at) VALUES('valid',?,'[3]','2100-01-01')").run(JSON.stringify(payload));
  const log=console.error;console.error=()=>{};
  try{notify.retryOutbox();notify.retryOutbox();} finally{console.error=log;}
  assert.ok(db.prepare("SELECT delivered_at FROM notification_outbox WHERE event_key='valid'").get().delivered_at);
  db.prepare("UPDATE notification_outbox SET attempts=7,next_retry_at=NULL WHERE event_key='bad0'").run();
  console.error=()=>{};try{notify.retryOutbox();} finally{console.error=log;}
  assert.ok(db.prepare("SELECT quarantined_at FROM notification_outbox WHERE event_key='bad0'").get().quarantined_at);
  db.prepare("UPDATE notification_outbox SET payload_json=? WHERE event_key='bad0'").run(JSON.stringify(payload));
  notify.replayOutbox(admin,'bad0');notify.replayOutbox(admin,'bad0');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe_key='bad0'").get().n,1);
  assert.throws(()=>notify.outbox({role:'teacher'}),e=>e.status===403);
});

test('N14：缺关键表/列及只读模式均拒绝就绪，不因迁移号正确而放行',()=>{
  assert.equal(readiness.assertReady(db),20);
  db.exec('ALTER TABLE notification_outbox RENAME TO outbox_missing');
  try{assert.throws(()=>readiness.assertReady(db));}finally{db.exec('ALTER TABLE outbox_missing RENAME TO notification_outbox');}
  db.exec('ALTER TABLE notification_outbox RENAME COLUMN next_retry_at TO missing_retry');
  try{assert.throws(()=>readiness.assertReady(db));}finally{db.exec('ALTER TABLE notification_outbox RENAME COLUMN missing_retry TO next_retry_at');}
  db.pragma('query_only=ON');try{assert.throws(()=>readiness.assertReady(db));}finally{db.pragma('query_only=OFF');}
  assert.equal(readiness.assertReady(db),20);
});
