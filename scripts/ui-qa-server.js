// 隔离 UI 验收夹具：绝不使用工作区或生产数据库；仅监听回环地址。
if (!process.argv.includes('--isolated')) throw new Error('必须显式传入 --isolated');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-ui-qa-'));
Object.assign(process.env, { DB_PATH:path.join(root,'qa.db'), UPLOAD_PATH:path.join(root,'uploads'),
  FEEDBACK_UPLOAD_PATH:path.join(root,'private'), NODE_ENV:'test', JWT_SECRET:'isolated-qa-only', LOGIN_RATE_LIMIT_IP:'1000' });
const app = require('../backend/app'); const db = require('../backend/config/database');
const bcrypt = require('../backend/node_modules/bcryptjs');
db.prepare("INSERT INTO schools (id,name,account_code) VALUES (1,'验收学校','QA'),(2,'迁移目标学校','QB')").run();
db.prepare("INSERT INTO classes (id,name,school_id) VALUES (1,'验收班级',1),(2,'原教师归属班级',1),(3,'目标教师归属班级',2)").run();
for (const [id,role] of [[1,'admin'],[2,'academic_mentor'],[3,'teacher'],[4,'student'],[5,'student'],[6,'teacher']]) {
  db.prepare('INSERT INTO users (id,username,password_hash,real_name,role,school_id,class_id,teacher_id) VALUES (?,?,?,?,?,1,1,?)')
    .run(id,`qa_${role}${[5,6].includes(id) ? '2' : ''}`,bcrypt.hashSync('QaPass!1234',4),`验收${role}${id}`,role,role === 'student' ? 3 : null);
}
db.prepare('UPDATE users SET school_id=NULL,class_id=NULL WHERE id IN (1,2)').run();
db.prepare('UPDATE users SET class_id=2 WHERE id=3').run();
db.prepare('UPDATE users SET school_id=2,class_id=3 WHERE id=6').run();
db.prepare('UPDATE users SET mentor_id=2 WHERE role=\'student\'').run();
db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (1,'隔离闭环验收课程','primary','basic','published',2)").run();
for (const id of [1,2]) db.prepare("INSERT INTO lessons (id,course_id,title,status,instructor_id,sort_order) VALUES (?,1,?,'completed',2,?)").run(id,`验收课时${id}`,id);
for (const id of [4,5]) db.prepare("INSERT INTO enrollments (student_id,course_id,status) VALUES (?,1,'active')").run(id);
fs.mkdirSync(process.env.UPLOAD_PATH,{recursive:true}); fs.mkdirSync(process.env.FEEDBACK_UPLOAD_PATH,{recursive:true});
const video=path.join(process.env.UPLOAD_PATH,'qa.mp4'); fs.writeFileSync(video,'0000ftypisom0000');
db.prepare("INSERT INTO course_replays (course_id,lesson_id,title,description,video_path,created_by) VALUES (1,1,'UI夹具，不验证真实播放','本轮课堂回顾简介',?,2)").run(video);
const resource=path.join(process.env.UPLOAD_PATH,'资料.txt'); fs.writeFileSync(resource,'课时配套下载资料');
db.prepare("INSERT INTO resources (course_id,lesson_id,title,resource_type,file_path,upload_by) VALUES (1,1,'配套资料','other',?,2)").run(resource);
const learning = require('../backend/services/learningService'); const mentor={id:2,role:'academic_mentor'};
const card=learning.createCard(mentor,1,{title:'五题型验收卡片',content:'## 学习目标\n\n- 查看卡片并逐题作答\n- 提交后查看详解',status:'published'}).id;
for (const [type,answer,options] of [ ['single_choice','A',['A','B']], ['multiple_choice',['A','B'],['A','B','C']], ['true_false',true,[]], ['fill_blank',{blanks:[['ABC','Abc'],['句号。']]},[]], ['short_answer','参考表达',[]] ]) {
  learning.createExercise(mentor,card,{question_type:type,prompt:`验收${type}`,answer,options,explanation:'导师提前设置的答案详解'});
}
db.prepare("INSERT INTO tasks (lesson_id,title,status) VALUES (1,'独立成果验收任务','active')").run();
const server=app.listen(Number(process.env.PBL_QA_PORT || 3091),'127.0.0.1',()=>console.log('隔离 UI API 就绪，账号 qa_admin / qa_academic_mentor / qa_teacher / qa_student / qa_student2；统一测试密码 QaPass!1234。视频仅为界面夹具，不用于播放验收。'));
function close() { server.close(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});process.exit(0);}); }
process.once('SIGINT',close); process.once('SIGTERM',close);
