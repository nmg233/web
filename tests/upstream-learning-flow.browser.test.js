import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
import {prepareSkeleton} from '../scripts/teaching.mjs';

const base='http://127.0.0.1:4282',api='http://127.0.0.1:3252';
const out=path.join(root,'docs/upstream-integration/evidence/learning');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8pAAAAAASUVORK5CYII=','base64');
const ready=async url=>{for(let i=0;i<200;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Not ready: '+url);};

test('上游合并后真实教材、学习报告、评审与金币闭环（合成隔离库）',{timeout:360000},async t=>{
 fs.mkdirSync(out,{recursive:true});
 const f=fixture(3252,4282),db=new Database(f.env.DB_PATH),plan=prepareSkeleton(db);
 const course=plan.courseId,[visit,theory]=plan.lessonIds;
 // Observer authorization requires an explicit assignment; sharing a class
 // alone never grants access. Set this relation only in the synthetic fixture.
 db.prepare('UPDATE users SET teacher_id=3 WHERE id=4').run();
 db.prepare("UPDATE courses SET title='上游整合学习验收（合成课程）' WHERE id=?").run(course);
 db.prepare("UPDATE lessons SET content_state='ready',review_content='合成回顾原稿',report_guidance='记录条件与证据',status='completed' WHERE id IN (?,?)").run(visit,theory);
 const card=Number(db.prepare("INSERT INTO knowledge_cards(lesson_id,title,content,status,created_by) VALUES(?,'合成验收卡片','比较前需要记录相同条件。','published',1)").run(theory).lastInsertRowid);
 const exercise=Number(db.prepare("INSERT INTO card_exercises(card_id,question_type,prompt,answer_json,explanation,is_required) VALUES(?,'true_false','比较方案前应该记录条件。','true','相同条件支持公平比较。',1)").run(card).lastInsertRowid);
 const dist=path.resolve(root,process.env.PBL_REGRESSION_DIST||'build/teaching');
 assert.ok(fs.existsSync(path.join(dist,'index.html')),'Run frontend build before browser verification');
 let backend;
 const start=async()=>{backend=spawn(process.execPath,['backend/app.js'],{cwd:root,env:f.env,stdio:'ignore',windowsHide:true});await ready(api+'/api/health');};
 const stop=async()=>{if(backend?.exitCode===null){const exited=new Promise(r=>backend.once('exit',r));backend.kill();await exited;}};
 await start();
 const front=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){const proxy=http.request(api+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>{res.writeHead(502);res.end();});req.pipe(proxy);return;}
  const candidate=path.resolve(dist,'.'+new URL(req.url,base).pathname),file=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>front.listen(4282,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],records=[],errors=[];
 const login=async(name,password)=>{const c=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(c);const p=await c.newPage();p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(name);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return p;};
 const call=(p,url,method='GET',body)=>p.evaluate(async({url,method,body})=>{const r=await fetch('/api'+url,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};},{url,method,body});
 const shot=async(name,p)=>{await p.evaluate(()=>document.fonts.ready);const dismiss=p.getByRole('button',{name:'关闭并跳过',exact:true});if(await dismiss.isVisible())await dismiss.click();await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled',fullPage:true});};
 const scene=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){failure=e;records.push({name,status:'failed',error:e.message});for(const [name,p]of Object.entries(pages)){fs.writeFileSync(path.join(out,'failure-'+name+'.txt'),await p.locator('body').innerText());await shot('failure-'+name,p).catch(()=>{});}throw e;}});if(failure)throw failure;};
 const pages={};let firstReport,secondReport,bound;
 try{
  const a=pages.admin=await login('adminpbl','admin123'),s=pages.student=await login('student_wang','student123'),m=pages.mentor=await login('mentor_zhang','mentor123');
  const maintenance=`/courses/${course}/maintenance`;
  const open=async lesson=>{await a.goto(base+`/courses/${course}?tab=maintenance`);await a.getByRole('tab',{name:'可视化填写 / 学生效果预览',exact:true}).click();await a.locator('#preview-lesson').click();await a.locator('#preview-lesson').press('Home');for(let i=0;i<plan.lessonIds.indexOf(lesson);i++)await a.locator('#preview-lesson').press('ArrowDown');await a.locator('#preview-lesson').press('Enter');await a.locator('.teaching-preview .study-header h2').filter({hasText:db.prepare('SELECT title FROM lessons WHERE id=?').get(lesson).title}).waitFor();};
  const region=key=>a.locator(`[data-authoring-region="${key}"]`).getByRole('button',{name:/^编辑这里/}).first(),panel=()=>a.getByTestId('authoring-panel');
  const save=async()=>{await panel().getByRole('button',{name:'保存此处教材',exact:true}).click();await panel().getByText(/已保存教材/).waitFor();};
  await scene('管理员可视化段落和真实图片上传保存，学生读取同一教材文件',async()=>{
   await open(visit);await region('article').click();await panel().getByLabel('文章标题',{exact:true}).fill('上游整合合成参观文章');await panel().getByRole('button',{name:'添加段落',exact:true}).click();await panel().getByLabel('段落文字（最多10000字）').fill('合成验收文章：记录亲眼观察到的证据。');
   const queue=panel().getByTestId('upload-resource');await queue.locator('input[type=file]').setInputFiles({name:'整合教材图片.png',mimeType:'image/png',buffer:png});await queue.getByRole('button',{name:'上传待处理文件',exact:true}).click();await queue.getByText(/上传成功/).first().waitFor();await panel().getByLabel('图片说明（最多1000字）').fill('合成图片说明');await save();
   const blocks=JSON.parse(db.prepare('SELECT article_blocks FROM lessons WHERE id=?').get(visit).article_blocks),image=blocks.find(b=>b.type==='image');assert.ok(image?.resourceId);const resource=db.prepare('SELECT * FROM resources WHERE id=?').get(image.resourceId);assert.deepEqual(fs.readFileSync(resource.file_path),png);await shot('01-admin-article',a);await panel().getByRole('button',{name:'关闭编辑',exact:true}).click();
   await s.goto(base+`/courses/${course}/lessons/${visit}/learn`);await s.getByTestId('lesson-article').waitFor();await s.getByText('合成图片说明',{exact:true}).waitFor();await s.waitForFunction(()=>[...document.querySelectorAll('.lesson-article img')].every(i=>i.complete&&i.naturalWidth>0));await shot('02-student-article',s);
  });
  await scene('管理员真实回放上传、Markdown摘要与课时回顾保存，学生可播放',async()=>{
   await open(theory);await region('review_content').click();await panel().getByLabel('课堂回顾正文',{exact:true}).fill('合成回顾：先记录条件，再比较结果。');await save();await panel().getByRole('button',{name:'关闭编辑',exact:true}).click();
   await a.getByRole('tab',{name:'课程回放',exact:true}).click();await a.getByRole('button',{name:/上传回放$/}).click();const modal=a.getByRole('dialog');await modal.getByLabel('回放标题',{exact:true}).fill('合成验收视频');await modal.locator('input[type=file]').first().setInputFiles(path.join(root,'backend/testFixtures/teaching-replay.webm'));await modal.getByLabel('简介',{exact:true}).fill('真实可读视频的合成介绍');await modal.getByLabel('所属课时（留空为课程共享）').click();await a.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'滑翔机试飞理论课'}).click();await modal.getByLabel('课程纪要（Markdown）',{exact:true}).fill('## 合成回放摘要\n保留摘要原文与换行。');await modal.getByRole('tab',{name:'摘要预览',exact:true}).click();await modal.getByRole('heading',{name:'合成回放摘要',exact:true}).waitFor();await modal.getByRole('button',{name:/^确\s*定$/}).click();await modal.waitFor({state:'hidden'});
   const replay=db.prepare('SELECT * FROM course_replays WHERE course_id=?').get(course);assert.equal(replay.lesson_id,theory);assert.equal(replay.summary.replace(/\r\n/g,'\n'),'## 合成回放摘要\n保留摘要原文与换行。');assert.deepEqual(fs.readFileSync(replay.video_path),fs.readFileSync(path.join(root,'backend/testFixtures/teaching-replay.webm')));await shot('03-admin-replay',a);
   await s.goto(base+`/courses/${course}/lessons/${theory}/learn`);await s.getByText('合成回顾：先记录条件，再比较结果',{exact:true}).waitFor();await s.getByRole('button',{name:/合成验收视频$/}).click();await s.waitForFunction(()=>document.querySelector('.study-video')?.readyState>=1);await s.getByRole('heading',{name:'合成回放摘要',exact:true}).waitFor();await shot('04-student-review-video',s);
  });
  await scene('学生真实完成回顾、必做习题与卡片，提交包含开放反思的第一版报告',async()=>{
   await s.getByRole('button',{name:'我已完成课堂回顾',exact:true}).click();await s.locator('.study-stage').nth(1).click();await s.getByRole('radio',{name:'正确',exact:true}).check();await s.getByRole('button',{name:'提交答案',exact:true}).click();await s.getByRole('button',{name:'我已学完本卡片',exact:true}).click();await s.locator('.study-stage').nth(2).click();await s.getByLabel('学习总结',{exact:true}).fill('第一版合成报告：记录相同条件比较结果。');await s.getByText('学习反思（至少填写一框）',{exact:true}).click();await s.getByLabel('今天想记下什么',{exact:true}).fill('第一次比较遗漏了记录。');await s.getByLabel('和别人一起时的感受',{exact:true}).fill('同伴帮助我检查条件。');await s.getByLabel('还想说些什么',{exact:true}).fill('下次先做记录表。');await s.getByRole('button',{name:'提交学习报告与反思',exact:true}).click();await s.getByRole('dialog').getByRole('button',{name:/^确\s*定$/}).click();
   await s.waitForFunction(()=>!document.querySelector('textarea#summary'));firstReport=db.prepare('SELECT * FROM lesson_learning_reports WHERE lesson_id=? AND student_id=4 ORDER BY version DESC').get(theory);assert.equal(firstReport.status,'submitted');assert.equal(firstReport.version,1);bound=db.prepare('SELECT content_version_id FROM report_content_versions WHERE report_id=?').get(firstReport.id).content_version_id;assert.equal(db.prepare('SELECT is_correct FROM card_exercise_attempts WHERE student_id=4 AND exercise_id=?').get(exercise).is_correct,1);const reflection=db.prepare('SELECT * FROM reflections WHERE report_id=?').get(firstReport.id);assert.equal(reflection.reflection_version,2);assert.equal(reflection.extra_note,'下次先做记录表。');await shot('05-student-report-submitted',s);
  });
  await scene('导师退回、学生修改新版本、导师通过，旧报告与开放反思完整保留',async()=>{
   await m.goto(base+`/mentor/reviews/${firstReport.id}`);await m.getByText('第一次比较遗漏了记录',{exact:true}).waitFor();await m.getByLabel('总分',{exact:true}).fill('65');await m.getByLabel('评审意见',{exact:true}).fill('请补充比较依据，保留真实观察。');await m.getByRole('button',{name:'退回第三阶段修改',exact:true}).click();await m.getByRole('dialog').getByRole('button',{name:/^确\s*定$/}).click();await m.getByRole('button',{name:'退回第三阶段修改',exact:true}).waitFor({state:'hidden'});assert.equal(db.prepare('SELECT status FROM lesson_learning_reports WHERE id=?').get(firstReport.id).status,'rejected');assert.equal((await call(s,'/rewards/coins/reconcile','POST',{})).data.created.length,0);await shot('06-mentor-return',m);
   await s.goto(base+`/courses/${course}/lessons/${theory}/learn?stage=2`);await s.getByLabel('学习总结',{exact:true}).fill('第二版合成报告：补充相同条件下的记录与比较依据。');await s.getByText('学习反思（至少填写一框）',{exact:true}).click();await s.getByLabel('今天想记下什么',{exact:true}).fill('第二版补上了条件记录。');await s.getByRole('button',{name:'提交学习报告与反思',exact:true}).click();await s.getByRole('dialog').getByRole('button',{name:/^确\s*定$/}).click();await s.getByLabel('学习总结',{exact:true}).waitFor({state:'hidden'});secondReport=db.prepare('SELECT * FROM lesson_learning_reports WHERE lesson_id=? AND student_id=4 ORDER BY version DESC').get(theory);assert.equal(secondReport.version,2);assert.notEqual(secondReport.id,firstReport.id);assert.equal(db.prepare('SELECT content_version_id FROM report_content_versions WHERE report_id=?').get(secondReport.id).content_version_id,bound);
   await m.goto(base+`/mentor/reviews/${secondReport.id}`);await m.getByText('第二版补上了条件记录',{exact:true}).waitFor();await m.getByLabel('总分',{exact:true}).fill('88');await m.getByLabel('评审意见',{exact:true}).fill('依据清楚，继续保持记录。');await m.getByRole('button',{name:'通过报告',exact:true}).click();await m.getByRole('dialog').getByRole('button',{name:/^确\s*定$/}).click();await m.getByRole('button',{name:'通过报告',exact:true}).waitFor({state:'hidden'});assert.equal(db.prepare('SELECT score FROM lesson_learning_reports WHERE id=?').get(secondReport.id).score,88);assert.equal(db.prepare('SELECT status FROM lesson_learning_reports WHERE id=?').get(firstReport.id).status,'rejected');assert.equal(db.prepare('SELECT entry_note FROM reflections WHERE report_id=?').get(firstReport.id).entry_note,'第一次比较遗漏了记录。');await shot('07-mentor-approved-history',m);
  });
  await scene('按已绑定教材结算真实金币且不重复，重启和另一设备保留报告及奖励历史',async()=>{
   assert.equal(db.prepare("SELECT COUNT(*) n FROM student_coin_ledger WHERE student_id=4 AND lesson_id=? AND reward_type='lesson'").get(theory).n,0);const newCard=await call(a,`/learning/manage/lessons/${theory}/cards`,'POST',{title:'后加合成卡片',content:'后加内容不覆盖学生的已绑定版本。',status:'published'});assert.equal(newCard.status,201);assert.equal((await call(a,`/learning/manage/cards/${newCard.data.id}/exercises`,'POST',{question_type:'true_false',prompt:'后加必做题',answer:true,explanation:'后加题的说明',is_required:true})).status,201);
   const settled=await call(s,'/rewards/coins/reconcile','POST',{});assert.equal(settled.status,200);const entry=db.prepare("SELECT * FROM student_coin_ledger WHERE student_id=4 AND lesson_id=? AND reward_type='lesson'").get(theory);assert.equal(entry.amount,88);assert.equal(entry.report_id,secondReport.id);assert.equal(entry.report_version,2);assert.equal(db.prepare('SELECT content_version_id FROM student_lesson_versions WHERE student_id=4 AND lesson_id=?').get(theory).content_version_id,bound);assert.equal((await call(s,'/rewards/coins/reconcile','POST',{})).data.created.length,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM student_coin_ledger WHERE student_id=4 AND lesson_id=? AND reward_type='lesson'").get(theory).n,1);
   await stop();await start();const other=pages.otherStudent=await login('student_wang','student123');await other.goto(base+`/courses/${course}/lessons/${theory}/learn?stage=3`);await other.getByText('依据清楚，继续保持记录',{exact:true}).first().waitFor();assert.equal((await call(other,'/rewards/coins')).data.balance,entry.amount);await shot('08-student-approved-other-device',other);
   const teacher=pages.observer=await login('teacher_li','teacher123');await teacher.goto(base+'/observer/students/4');await teacher.getByText('第二版补上了条件记录',{exact:true}).waitFor();assert.equal(await teacher.getByRole('button',{name:'通过报告',exact:true}).count(),0);await shot('09-observer-open-reflection',teacher);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  });
  assert.deepEqual(errors,[]);
 }finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,browser:browser.version(),dist:path.relative(root,dist),scope:'Real Edge browser and real HTTP on an independent synthetic SQLite database. No teaching or student production data edited. No real concurrent-load claim for transaction-boundary unit tests.'},null,2));
  for(const c of contexts)await c.close();await browser.close();await new Promise(r=>front.close(r));await stop();db.close();
 }
});
