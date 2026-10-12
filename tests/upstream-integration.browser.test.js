import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
import {prepareSkeleton} from '../scripts/teaching.mjs';

const out=path.join(root,'docs/upstream-integration/evidence/browser');
const base='http://127.0.0.1:4281',api='http://127.0.0.1:3251';
const accounts={admin:['adminpbl','admin123'],mentor:['mentor_zhang','mentor123'],student:['student_wang','student123']};
const ready=async()=>{for(let i=0;i<120;i++){try{if((await fetch(api+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Isolated API not ready');};

test('上游运行时与学生改版整合：真实页面验收（独立合成数据库）',{timeout:480000},async t=>{
 fs.mkdirSync(out,{recursive:true});
 const f=fixture(3251,4281),db=new Database(f.env.DB_PATH),plan=prepareSkeleton(db),course=plan.courseId,[visit,theory]=plan.lessonIds;
 db.prepare("UPDATE lessons SET review_content='冻结的课堂回顾（合成验收）',content_state='ready' WHERE id=?").run(theory);
 db.prepare("UPDATE lessons SET article_title='VR 文章（合成验收）',article_blocks=?,moments_note='保留人工教材的只读展示' WHERE id=?").run(JSON.stringify([{type:'paragraph',text:'真实接口返回的 VR 文章正文（合成验收）'}]),visit);
 const dist=path.resolve(process.env.PBL_REGRESSION_DIST||path.join(root,'build/teaching'));
 assert.ok(fs.existsSync(path.join(dist,'index.html')),'Build the merged frontend before browser verification');
 const records=[],errors=[],pages=[],tokens={};
 let backend;
 const start=async()=>{backend=spawn(process.execPath,['scripts/local-server.cjs'],{cwd:root,env:f.env,windowsHide:true,stdio:'ignore'});await ready();};
 await start();
 const front=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){const up=http.request(api+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);return;}
  const candidate=path.resolve(dist,'.'+new URL(req.url,base).pathname),file=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>front.listen(4281,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=async role=>{const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();pages.push(p);p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push({role,message:e.message}));await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(accounts[role][0]);await p.getByLabel('密码',{exact:true}).fill(accounts[role][1]);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return p;};
 const request=async(role,url,method='GET',body)=>{
  if(!tokens[role]){const r=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:accounts[role][0],password:accounts[role][1]})});tokens[role]=(await r.json()).token;}
  const r=await fetch(api+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[role],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};
 };
 const b=(p,name)=>p.getByRole('button',{name:new RegExp('(?:^|\\s)'+[...name].join('\\s*')+'$')});
 const dialog=p=>p.getByRole('dialog').filter({visible:true}).last();
 const go=(p,url)=>p.goto(base+url);
 const shot=async(name,p)=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});};
 const scene=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){failure=e;records.push({name,status:'failed',error:e.message});for(const [i,p]of pages.entries()){await shot('failure-'+records.length+'-'+i,p).catch(()=>{});fs.writeFileSync(path.join(out,'failure-'+i+'.txt'),await p.locator('body').innerText());}throw e;}});if(failure)throw failure;};
 let a,m,s,card,exercise,bound;
 try {
  a=await page('admin');m=await page('mentor');s=await page('student');
  await scene('管理员结构化双空题真实保存；二次保存仍更新同一题',async()=>{
   await go(a,`/courses/${course}/lessons/${theory}/content`);await b(a,'新增知识卡片').click();
   await dialog(a).getByLabel('标题',{exact:true}).fill('冻结的知识卡片（合成验收）');await dialog(a).getByLabel('正文',{exact:true}).fill('**冻结的正文**：比较设计前记录条件。');await b(dialog(a),'保存并发布').click();await dialog(a).getByText(/已保存/).waitFor();await a.keyboard.press('Escape');
   card=db.prepare('SELECT * FROM knowledge_cards WHERE lesson_id=? ORDER BY id DESC').get(theory);
   await b(a,'添加练习').click();await dialog(a).getByLabel('题型',{exact:true}).click();await a.keyboard.press('Home');await a.keyboard.press('ArrowDown');await a.keyboard.press('ArrowDown');await a.keyboard.press('ArrowDown');await a.keyboard.press('Enter');
   await dialog(a).getByLabel('题目',{exact:true}).fill('双空题（合成验收）：记录速度和角度');await dialog(a).getByLabel('第 1 空可接受答案（每行一个）',{exact:true}).fill('速度\nspeed');await b(dialog(a),'添加一个空').click();await dialog(a).getByLabel('第 2 空可接受答案（每行一个）',{exact:true}).fill('角度');await dialog(a).getByLabel('答案详解',{exact:true}).fill('只在作答之后展示的合成解析');await b(dialog(a),'确定').click();await dialog(a).getByText(/已保存/).waitFor();
   exercise=db.prepare('SELECT * FROM card_exercises WHERE card_id=?').get(card.id);assert.equal(exercise.question_type,'fill_blank');assert.equal(JSON.parse(exercise.answer_json).blanks.length,2);
   await dialog(a).getByLabel('题目',{exact:true}).fill('双空题（合成验收）：分别记录速度和角度');await b(dialog(a),'确定').click();await dialog(a).getByText(/已保存/).waitFor();assert.equal(db.prepare('SELECT COUNT(*) n FROM card_exercises WHERE card_id=?').get(card.id).n,1);await shot('admin-structured-exercise',a);await a.keyboard.press('Escape');
  });
  await scene('导师入口仅预览卡题且答案不泄露；旧编辑路径与真实写请求拒绝',async()=>{
   await go(m,`/courses/${course}/lessons/${theory}/preview`);await m.getByText('只读预览',{exact:true}).waitFor();await m.getByText('双空题（合成验收）：分别记录速度和角度',{exact:false}).waitFor();assert.equal(await m.getByText('只在作答之后展示的合成解析',{exact:true}).count(),0);assert.equal(await b(m,'添加练习').count(),0);
   assert.equal((await request('mentor',`/learning/manage/lessons/${theory}/cards`,'POST',{title:'拒绝的写入',content:'不得落库'})).status,403);await shot('mentor-safe-preview',m);
   await go(m,`/courses/${course}/lessons/${theory}/content`);await m.getByText('当前身份无法访问此页面',{exact:true}).waitFor();assert.equal(await b(m,'新增知识卡片').count(),0);
  });
  await scene('VR 原文章只读可见；不绑定教材、不制造学习进度且写入拒绝',async()=>{
   const before=db.prepare('SELECT COUNT(*) n FROM student_lesson_versions WHERE student_id=4 AND lesson_id=?').get(visit).n;
   await go(s,`/courses/${course}/lessons/${visit}/learn`);await s.getByTestId('lesson-template').waitFor();await s.getByText('真实接口返回的 VR 文章正文（合成验收）',{exact:true}).waitFor();assert.equal(await b(s,'我已完成课堂回顾').count(),0);assert.equal(db.prepare('SELECT COUNT(*) n FROM student_lesson_versions WHERE student_id=4 AND lesson_id=?').get(visit).n,before);assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_progress WHERE student_id=4 AND lesson_id=?').get(visit).n,0);assert.equal((await request('student',`/learning/lessons/${visit}/review-complete`,'POST',{})).status,409);await shot('student-vr-readonly',s);
  });
  await scene('正常学习绑定真实教材；维护新版后旧正文保持冻结；双空题真实提交',async()=>{
   await go(s,`/courses/${course}/lessons/${theory}/learn?stage=0`);await s.getByText('冻结的课堂回顾（合成验收）',{exact:true}).waitFor();bound=db.prepare('SELECT content_version_id FROM student_lesson_versions WHERE student_id=4 AND lesson_id=?').get(theory).content_version_id;
   const result=await request('admin',`/learning/manage/cards/${card.id}`,'PUT',{content:'新发布的正文，不覆盖已绑定学生',expected_revision:card.content_revision});assert.equal(result.status,200);
   await b(s,'我已完成课堂回顾').click();await s.getByText('冻结的正文',{exact:true}).waitFor();assert.equal(await s.getByText('新发布的正文，不覆盖已绑定学生',{exact:true}).count(),0);await s.getByPlaceholder('第 1 空',{exact:true}).fill('speed');await s.getByPlaceholder('第 2 空',{exact:true}).fill('角度');await b(s,'提交答案').click();await s.getByText('只在作答之后展示的合成解析',{exact:false}).waitFor();assert.equal(db.prepare('SELECT content_version_id FROM student_lesson_versions WHERE student_id=4 AND lesson_id=?').get(theory).content_version_id,bound);const attempt=db.prepare('SELECT answer_json,is_correct FROM card_exercise_attempts WHERE student_id=4 AND exercise_id=?').get(exercise.id);assert.deepEqual(JSON.parse(attempt.answer_json),['speed','角度']);assert.equal(attempt.is_correct,1);await shot('student-frozen-multi-blank',s);
  });
  await scene('账号批次真实创建与恢复；关闭刷新后凭据可导出并确认交付',async()=>{
   await go(a,'/students');await b(a,'批量导入').click();await a.getByRole('dialog',{name:'批量创建账号与交付'}).waitFor();const csv='登录账号,姓名,身份,学校名称,年级,班级名称,邮箱,手机号,备注\r\nintegration_browser_mentor,验收导师,导师,,,,,,隔离合成数据\r\n';await dialog(a).locator('input[type=file]').setInputFiles({name:'合成账号验收.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv)});await dialog(a).getByText('已完成 · 成功 1 / 失败 0',{exact:true}).waitFor({timeout:30000});const batch=db.prepare("SELECT id FROM account_import_batches ORDER BY created_at DESC LIMIT 1").get();assert.ok(batch);assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE username='integration_browser_mentor'").get().n,1);await shot('account-batch',a);await a.reload();await b(a,'批量导入').click();await dialog(a).getByRole('combobox').click();await a.keyboard.press('Home');await a.keyboard.press('Enter');await dialog(a).getByText('已完成 · 成功 1 / 失败 0',{exact:true}).waitFor();const download=await Promise.all([a.waitForEvent('download'),b(dialog(a),'导出有效初始密码').click()]);assert.match(fs.readFileSync(await download[0].path(),'utf8'),/integration_browser_mentor/);await b(dialog(a),'我已完成交付').click();await b(dialog(a),'确定').click();await b(dialog(a),'已确认交付').waitFor();await shot('account-batch-restored',a);await a.keyboard.press('Escape');
  });
  await scene('管理员通知 outbox 可重放隔离事件；学生和导师无运维入口',async()=>{
   const key='integration-browser:outbox',payload={eventKey:'integration_browser',title:'恢复的隔离通知',content:'真实投递验收，不是教学消息',category:'system',dedupeKey:key};db.prepare('INSERT INTO notification_outbox(event_key,payload_json,recipients_json,attempts,quarantined_at,last_error) VALUES(?,?,?,8,CURRENT_TIMESTAMP,?)').run(key,JSON.stringify(payload),'[4]','合成失败，等待人工恢复');await go(a,'/notifications');await a.getByText('通知投递监控（仅管理员）',{exact:true}).waitFor();await a.getByText(key,{exact:true}).waitFor();await shot('admin-notification-outbox',a);await b(a,'重放事件').click();await a.getByText(key,{exact:true}).waitFor({state:'hidden'});assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(key).n,1);assert.ok(db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(key).delivered_at);assert.equal((await request('mentor','/notifications/outbox')).status,403);await go(s,'/notifications');await s.getByText('恢复的隔离通知',{exact:true}).waitFor();assert.equal(await s.getByText('通知投递监控（仅管理员）',{exact:true}).count(),0);await shot('student-recovered-notification',s);
  });
  await scene('独立真实试飞成功，3D canvas 实例化并切换机位；原数值结果和图片保留',async()=>{
   await go(s,'/glider');await s.locator('.flight-engine--ready').waitFor();await b(s,'开始试飞').click();await s.getByText('计算成功',{exact:true}).waitFor({timeout:150000});await s.getByText('✈️ 飞行过程回放（3D 实时渲染）',{exact:true}).waitFor();await s.getByText('正在加载逐帧轨迹数据…',{exact:true}).waitFor({state:'hidden',timeout:30000});const canvas=s.locator('canvas');await canvas.waitFor();assert.ok(await canvas.evaluate(c=>c.width>0&&c.height>0&&Boolean(c.getContext('webgl2')||c.getContext('webgl'))));await s.getByText('追逐',{exact:true}).click();assert.equal(await s.getByRole('radio',{name:'追逐',exact:true}).isChecked(),true);await s.getByRole('slider',{name:'回放进度'}).click({position:{x:100,y:4}});assert.ok(await s.locator('.flight-metrics dd').count());for(const label of ['三维航迹','飞行遥测'])await s.getByRole('img',{name:label,exact:true}).evaluate(img=>img.complete&&img.naturalWidth>0?true:new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;}));const flight=db.prepare('SELECT * FROM glider_simulations WHERE student_id=4 ORDER BY id DESC').get();assert.equal(flight.status,'success');assert.equal(flight.course_id,null);assert.equal(flight.lesson_id,null);await shot('student-real-flight-3d',s);
  });
  assert.deepEqual(errors,[]);
 } finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,browser:browser.version(),courseId:course,lessonIds:plan.lessonIds,scope:'Disposable synthetic SQLite and uploads, ports 3251/4281. Native browser controls for all scenes; direct HTTP assists setup and verifies backend permissions. No real teaching data or public service touched.'},null,2));await browser.close();await new Promise(r=>front.close(r));if(backend?.exitCode===null){const stopped=new Promise(r=>backend.once('exit',r));backend.kill();await stopped;}db.close();
 }
});
