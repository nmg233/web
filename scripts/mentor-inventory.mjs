// Read-only pre-migration inventory. Does not import the auto-migrating app DB.
import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url)),Database=require('better-sqlite3');
const index=process.argv.indexOf('--db');if(index<0||!process.argv[index+1])throw Error('使用 --db 指定已有数据库；本工具只读，不创建数据库');
const db=new Database(path.resolve(process.argv[index+1]),{readonly:true,fileMustExist:true});
try{
 const courses=db.prepare(`SELECT c.id,c.title,c.status,
  (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) enrollments,
  (SELECT COUNT(DISTINCT u.school_id) FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.course_id=c.id) school_count
  FROM courses c ORDER BY c.id`).all().map(c=>({...c,managers:db.prepare('SELECT mentor_id,active,source FROM course_managers WHERE course_id=?').all(c.id)}));
 console.log(JSON.stringify({readOnly:true,schema:db.prepare('SELECT max(version) version FROM schema_migrations').get().version,courses,legacyTeacherStudents:db.prepare("SELECT count(*) n FROM users s JOIN users t ON t.id=s.teacher_id AND t.role='teacher' WHERE s.role='student'").get().n,crossSchoolCourses:courses.filter(c=>c.school_count>1).map(c=>c.id),warning:'历史报名不等于整校招生授权；旧教师关系不自动扩展到未来课程。'},null,2));
}finally{db.close();}
