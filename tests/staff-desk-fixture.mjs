import {prepareMentorFixture,Database} from './mentor-fixture.mjs';
export function prepareDeskFixture(api=3567,front=4597){
 const f=prepareMentorFixture(api,front),db=new Database(f.env.DB_PATH);
 for(let n=1;n<=12;n++){
  db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(?,?,'junior','basic','draft',10002)").run(92000+n,'合成课程文件夹 '+String(n).padStart(2,'0'));
  db.prepare("INSERT INTO lessons(id,course_id,title,content_state) VALUES(?,91001,?,'ready')").run(93000+n,'合成待评课时 '+n);
  db.prepare("INSERT INTO lesson_learning_reports(id,student_id,lesson_id,status,summary) VALUES(?,10004,?,'submitted','仅用于隔离验收的学习报告')").run(94000+n,93000+n);
 }
 db.prepare("INSERT INTO school_applications(id,applicant_id,name,normalized_name,region,explanation,status) VALUES(7201,10007,'合成新学校申请','desk-test-school','测试地区','仅用于验收原申请链接与统一会话','pending')").run();
 db.close();return f;
}
