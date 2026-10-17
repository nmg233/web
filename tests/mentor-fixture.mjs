import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fixture,root,Database} from './v2-fixture.mjs';
export {root,Database};
const require=createRequire(import.meta.url);
export function prepareMentorFixture(api=3527,front=4557){
 const f=fixture(api,front),db=new Database(f.env.DB_PATH),password=crypto.randomBytes(20).toString('hex'),hash=require('../backend/node_modules/bcryptjs').hashSync(password,4);
 for(const id of[7001,7002]){db.prepare('INSERT INTO schools(id,name,region) VALUES(?,?,?)').run(id,'合成验收学校'+id,'隔离测试地区');db.prepare('INSERT INTO classes(id,school_id,name,grade) VALUES(?,?,?,?)').run(id,id,'合成七一班','七年级');}
 const accounts={admin:[10001,'admin'],mentor:[10002,'academic_mentor'],mentorB:[10003,'academic_mentor'],student:[10004,'student'],teacher:[10005,'teacher'],noSchool:[10007,'academic_mentor']};
 for(const[name,[id,role]]of Object.entries(accounts))db.prepare('INSERT INTO users(id,username,real_name,role,password_hash,school_id,class_id) VALUES(?,?,?,?,?,?,?)').run(id,'mentor_review_'+name,'合成验收'+name,role,hash,['student','teacher'].includes(role)?7001:null,['student','teacher'].includes(role)?7001:null);
 for(const[id,mentor,school]of[[7101,10002,7001],[7102,10003,7002],[7103,10003,7001]]){db.prepare("INSERT INTO school_applications(id,applicant_id,name,normalized_name,region,explanation,status,school_id) VALUES(?,?,?,?,?,'合成验收学校授权','approved',?)").run(id,mentor,'合成验收学校'+school,'fixture-'+school,'测试地区',school);db.prepare('INSERT INTO school_managers(school_id,mentor_id,application_id,granted_by) VALUES(?,?,?,10001)').run(school,mentor,id);}
 for(const[id,mentor,title]of[[91001,10002,'导师课程A · 隔离验收'],[91002,10003,'导师课程B · 隔离验收']]){
  db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by,automatic_map) VALUES(?,?,'junior','basic','published',?,1)").run(id,title,mentor);
  db.prepare('INSERT INTO course_school_scopes(course_id,school_id,created_by) VALUES(?,7001,?)').run(id,mentor);
  db.prepare('INSERT INTO enrollments(student_id,course_id,enrolled_by) VALUES(10004,?,?)').run(id,mentor);
  db.prepare("INSERT INTO lessons(id,course_id,title,description,duration,content_state,presentation_type) VALUES(?,?,?,'仅用于操作验收，不是正式教学材料',45,'preparing','learning')").run(id,id,'基础观察 · 合成课时');
 }
 db.prepare("INSERT INTO school_created_accounts(student_id,actor_id,school_id,class_id,request_key,fingerprint) VALUES(10004,10002,7001,7001,'fixture-student','fixture')").run();
 db.prepare("INSERT INTO school_created_teachers(teacher_id,actor_id,school_id,request_key,fingerprint) VALUES(10005,10002,7001,'fixture-teacher','fixture')").run();
 db.prepare("INSERT INTO teacher_observation_grants(teacher_id,student_id,course_id,school_id,actor_id,source) VALUES(10005,10004,91001,7001,10002,'mentor')").run();
 db.prepare('INSERT INTO student_guide_dismissals(student_id) VALUES(10004)').run();db.close();return{...f,password,accounts};
}
export async function serveFixture(f,api=3527,frontPort=4557){
 const backend=spawn(process.execPath,['scripts/local-server.cjs'],{cwd:root,env:f.env,windowsHide:true,stdio:'ignore'});
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${api}/api/health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready){backend.kill();throw Error('隔离API启动失败');}
 const dist=path.join(root,'build/mentor-teaching'),base=`http://127.0.0.1:${frontPort}`;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){const upstream=http.request(`http://127.0.0.1:${api}`+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;}
  const candidate=path.resolve(dist,'.'+new URL(req.url,base).pathname),file=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(frontPort,'127.0.0.1',r));
 return{base,close:async()=>{await new Promise(r=>server.close(r));if(backend.exitCode===null){const stopped=new Promise(r=>backend.once('exit',r));backend.kill();await stopped;}}};
}
