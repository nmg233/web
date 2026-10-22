import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';

// Real UI, real upload and isolated synthetic accounts/database. No production traffic.
test('不停课修订浏览器闭环：正式课时直接改稿上传、管理员审批、新旧学生版本隔离',{timeout:180000},async t=>{
 const apiPort=3598,frontPort=4628,f=prepareMentorFixture(apiPort,frontPort),db=new Database(f.env.DB_PATH);
 db.prepare("UPDATE lessons SET publication_state='draft',content_state='ready',presentation_type='learning',cards_required=0,review_content='原正式回顾 · 合成' WHERE id=91001").run();
 db.prepare("UPDATE courses SET description='合成验收课程简介' WHERE id=91001").run();
 db.prepare("INSERT INTO users(id,username,real_name,role,password_hash,school_id,class_id) SELECT 10008,'mentor_review_fresh','合成新学生','student',password_hash,school_id,class_id FROM users WHERE id=10004").run();
 db.prepare('INSERT INTO enrollments(student_id,course_id,enrolled_by) VALUES(10008,91001,10001)').run();
 db.prepare('INSERT INTO student_guide_dismissals(student_id) VALUES(10008)').run();
 process.env.PBL_REGRESSION_DIST='frontend/dist';
 const runtime=await serveFixture(f,apiPort,frontPort);
 let browser;const errors=[];
 const request=async(p,url,body,method=body===undefined?'GET':'POST')=>p.evaluate(async({url,body,method})=>{
  const r=await fetch('/api'+url,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 },{url,body,method});
 const confirm=async p=>{await p.getByLabel('发布审批操作说明',{exact:true}).fill('合成验收：核对教材和视频');await p.getByRole('dialog').locator('.ant-modal-footer .ant-btn-primary').click();await p.getByRole('dialog').waitFor({state:'hidden'});};
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const login=async role=>{const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.goto(runtime.base+'/login');await p.getByLabel('账号',{exact:true}).fill('mentor_review_'+role);await p.getByLabel('密码',{exact:true}).fill(f.password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return p;};
  const mentor=await login('mentor'),admin=await login('admin'),student=await login('student');
  const original=await request(mentor,'/courses/91001/publication',{lesson_id:91001,reason:'原正式教材'});assert.equal(original.status,200);
  assert.equal((await request(admin,`/courses/91001/publication/${original.body.id}/decision`,{decision:'approved',reason:'原版批准'})).status,200);
  const old=await request(student,'/learning/lessons/91001');assert.equal(old.status,200);const oldVersion=old.body.content_version.id;
  await t.test('正式课时无需关闭，导师可保存草稿并真实上传视频',async()=>{
   await mentor.goto(runtime.base+'/courses/91001?tab=maintenance&lesson=91001');
   await mentor.getByLabel('课堂回顾正文',{exact:true}).fill('未审批的新回顾 · 合成');
   assert.equal(await mentor.getByRole('button',{name:'关闭并编辑本课时',exact:true}).count(),0);
   const video=mentor.locator('#lesson-videos');assert.equal(await video.getByRole('button',{name:'选择文件',exact:true}).isEnabled(),true);
   await mentor.locator('.authoring-save-bar').getByRole('button',{name:'保存当前课时草稿',exact:true}).click();
   await mentor.getByText('课时草稿已保存；文件须分别上传，管理员审批后才对学生生效',{exact:true}).waitFor();
   await video.locator('input[type=file]').setInputFiles(path.join(root,'backend/testFixtures/teaching-replay.webm'));
   await video.getByRole('textbox',{name:'资料说明 teaching-replay.webm',exact:true}).fill('真实合成视频简介');
   await video.getByRole('button',{name:'上传待处理文件',exact:true}).click();
   await video.getByText('上传成功',{exact:true}).waitFor();
   assert.equal(db.prepare('SELECT publication_state FROM lessons WHERE id=91001').get().publication_state,'published');
   assert.equal(db.prepare('SELECT COUNT(*) n FROM course_replays WHERE lesson_id=91001').get().n,1);
  });
  await t.test('草稿和审批期间学生原版继续学习、提交；新增内容不可提前访问',async()=>{
   const before=await request(student,'/learning/lessons/91001');assert.equal(before.body.lesson.review_content,'原正式回顾 · 合成');assert.equal(before.body.replays.length,0);
   assert.equal((await request(student,'/learning/lessons/91001/review-complete',{})).status,200);
   const panel=mentor.getByTestId('publication-panel').last();await panel.getByRole('button',{name:'提交管理员审批',exact:true}).click();await confirm(mentor);
   const pending=db.prepare("SELECT id FROM publication_requests WHERE lesson_id=91001 AND status='pending'").get();assert.ok(pending);
   const still=await request(student,'/learning/lessons/91001');assert.equal(still.status,200);assert.equal(still.body.lesson.review_content,'原正式回顾 · 合成');assert.equal(still.body.content_version.id,oldVersion);
   const submit=await request(student,'/learning/lessons/91001/report',{report:{summary:'审批期间仍能提交的原版报告'},reflection:{reflection_version:2,entry_note:'原版反思保留'}});assert.equal(submit.status,201);
   const fresh=await login('fresh');const course=await request(fresh,'/courses/91001');assert.equal(course.body.lessons.find(l=>l.id===91001).review_content,'原正式回顾 · 合成');
   // This fresh student has not entered/bound the learning package yet.
   assert.equal(db.prepare('SELECT COUNT(*) n FROM student_lesson_versions WHERE student_id=10008 AND lesson_id=91001').get().n,0);
  });
  await t.test('管理员在前端批准，已开始学生保持原版，新学生使用新版；权限未放宽',async()=>{
   await admin.goto(runtime.base+'/courses/91001?tab=maintenance&lesson=91001');
   assert.equal(await admin.locator('#lesson-videos').getByRole('button',{name:'选择文件',exact:true}).isEnabled(),true);
   await admin.getByTestId('publication-panel').last().getByRole('button',{name:'批准并正式发布',exact:true}).click();await confirm(admin);
   const old=await request(student,'/learning/lessons/91001');assert.equal(old.body.lesson.review_content,'原正式回顾 · 合成');assert.equal(old.body.content_version.id,oldVersion);assert.equal(old.body.replays.length,0);assert.equal(old.body.report.status,'submitted');
   const fresh=await login('fresh'),next=await request(fresh,'/learning/lessons/91001');assert.equal(next.status,200);assert.equal(next.body.lesson.review_content,'未审批的新回顾 · 合成');assert.notEqual(next.body.content_version.id,oldVersion);assert.equal(next.body.replays.length,1);
   await fresh.goto(runtime.base+'/courses/91001/lessons/91001/learn');await fresh.getByText('未审批的新回顾 · 合成',{exact:true}).waitFor();
   const other=await login('mentorB'),teacher=await login('teacher');
   assert.equal((await request(other,'/courses/91001/maintenance/lessons/91001',{review_content:'越权稿'},'PUT')).status,404);
   assert.equal((await request(teacher,'/courses/91001/maintenance/lessons/91001',{review_content:'越权稿'},'PUT')).status,403);
   assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
   assert.deepEqual(errors,[]);
  });
 }finally{if(browser)await browser.close();await runtime.close();db.close();}
});
