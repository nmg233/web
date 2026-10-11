import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'backend/package.json'));export const Database=require('better-sqlite3');
export function fixture(port=3144,front=4174){
 const scratch=mkdtempSync(path.join(tmpdir(),'pbl-redesign-v2-'));
 const env={...process.env,NODE_ENV:'test',DB_PATH:path.join(scratch,'v2.db'),PORT:String(port),JWT_SECRET:randomBytes(32).toString('hex'),UPLOAD_PATH:path.join(scratch,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(scratch,'feedback'),CORS_ORIGIN:'http://127.0.0.1:'+front,API_PROXY_TARGET:'http://127.0.0.1:'+port,GLIDER_BACKEND:'reference',GLIDER_PYTHON:path.join(root,'.venv/Scripts/python.exe'),GLIDER_RENDERER:'mpl',LOGIN_RATE_LIMIT_IP:'500',LOGIN_RATE_LIMIT_USER:'500'};
 mkdirSync(env.UPLOAD_PATH,{recursive:true});
 execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
 const db=new Database(env.DB_PATH);
 // 保留初始化课程本身，只在这个全新隔离数据库调整测试账号分配。
 db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4").run();
 for(const[id,title,description]of [[9001,'星海远航 · 视觉测试课程','用于课程空间和像素地图验收，以下课时与材料均为合成测试内容。'],[9002,'工程观察 · 测试课程','用于验证第二门课程的独立记录与默认校园主题，不是正式教学内容。']]){
 db.prepare("INSERT INTO courses(id,title,theme,description,grade_level,difficulty,status,created_by,driving_question,materials_needed) VALUES(?,?,'工程设计',?,'junior','basic','published',2,'测试问题：如何用证据比较设计？','测试记录本')").run(id,title,description);
 db.prepare("INSERT INTO enrollments(id,student_id,course_id,status,enrolled_by) VALUES(?,4,?,'active',2)").run(id,id);
 }
 db.prepare("UPDATE courses SET presentation_theme='voyage' WHERE id=9001").run();
 db.prepare("INSERT INTO course_chapters(id,course_id,title,sort_order) VALUES(90011,9001,'测试章节 A · 观察与记录',1),(90012,9001,'测试章节 B · 实践与复盘',2)").run();
 const titles=['观察与提问','记录实验条件','比较设计方案','实践与验证','整理过程证据','分享与复盘'];
 for(let i=1;i<=6;i++)db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration,start_at,end_at,location,instructor_id) VALUES(?,9001,?,'本课时仅用于验收学习流程，不是正式教材。',?,45,'2026-10-12T14:00','2026-10-12T14:45','科创教室（测试地点）',2)").run(90010+i,titles[i-1],i);
 db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration,instructor_id) VALUES(90021,9002,'基础观察（测试课时）','独立课程测试内容',1,40,2)").run();
 db.prepare('UPDATE lessons SET chapter_id=CASE WHEN sort_order<=3 THEN 90011 ELSE 90012 END WHERE course_id=9001').run();
 for(const[id,lesson,title]of [[9001,90011,'试飞观察作品（测试任务）'],[9002,90013,'比较记录（测试任务）'],[9003,90021,'第二课程作品（测试任务）']])db.prepare("INSERT INTO tasks(id,lesson_id,title,description) VALUES(?,?,?,'整理自己的观察记录，文字或附件至少一项。')").run(id,lesson,title);
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES(900111,90011,'观察条件（测试卡片）','合成测试内容：明确比较条件。',1,'published',2),(900112,90011,'调整与验证（测试卡片）','合成测试内容：试飞后记录自己的观察。',2,'published',2)").run();
 db.prepare("INSERT INTO card_exercises(id,card_id,question_type,prompt,answer_json,explanation) VALUES(900111,900111,'true_false','比较前需要记录条件吗（测试题）','true','合成验收测试解释')").run();
 db.prepare("INSERT INTO course_experiments(course_id,experiment_id,lesson_id,stage,card_id,label) VALUES(9001,'glider',90011,1,900112,'滑翔机实验（测试关联）')").run();
 db.prepare("INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(4,90012,35),(4,90013,100)").run();
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,status,summary) VALUES(4,90013,'approved','测试报告已通过')").run();
 db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,reject_reason) VALUES(9001,4,9001,9002,'比较记录待修改（测试作品）','合成测试结果','rejected','请补充比较依据（测试反馈）'),(9002,4,9002,9003,'另一课程作品（测试作品）','只属于另一课程','pending',NULL)").run();
 db.prepare("INSERT INTO reflections(student_id,enrollment_id,lesson_id,difficulty) VALUES(4,9002,90021,'另一课程反思（测试记录）')").run();
 db.prepare("INSERT INTO glider_simulations(id,student_id,course_id,status,state) VALUES(9001,4,9002,'success','landed'),(9002,4,NULL,'success','landed')").run();
 db.prepare("INSERT INTO resources(id,course_id,resource_type,title,file_path,upload_by) VALUES(9001,9001,'other','缺失附件（测试资源）',?,2)").run(path.join(scratch,'missing.txt'));
 db.close();return {env,scratch};
}
