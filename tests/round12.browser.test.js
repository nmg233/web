import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),base='http://127.0.0.1:5194',preview='http://127.0.0.1:5195',api='http://127.0.0.1:3132';
const require=createRequire(path.join(root,'backend/package.json')),Database=require('better-sqlite3');
const scratch=mkdtempSync(path.join(tmpdir(),'star-voyage-round12-'));
const env={...process.env,NODE_ENV:'test',DB_PATH:path.join(scratch,'acceptance.db'),PORT:'3132',JWT_SECRET:randomBytes(32).toString('hex'),UPLOAD_PATH:path.join(scratch,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(scratch,'feedback'),CORS_ORIGIN:base,API_PROXY_TARGET:api,GLIDER_BACKEND:'reference',GLIDER_PYTHON:path.join(root,'.venv/Scripts/python.exe'),GLIDER_RENDERER:'mpl',VITE_STUDENT_TEST_CONFIG:'1',LOGIN_RATE_LIMIT_IP:'500',LOGIN_RATE_LIMIT_USER:'500'};
const delivery=process.env.ROUND12_CAPTURE_DELIVERY==='1',out=path.join(root,delivery?'docs/round-12/screenshots':'test-results/round12');
const sizes=[[1440,900],[768,1024],[390,844]];
const children=[];
function start(args,cwd= root,overrides={}) {const child=spawn(process.execPath,args,{cwd,env:{...env,...overrides},windowsHide:true,stdio:'pipe'});child.stdout.resume();child.stderr.resume();children.push(child);return child;}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function ready(url){for(let i=0;i<150;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Local service did not start');}
async function login(p,username='student_wang',password='student123',origin=base){await p.goto(origin+'/login');await p.getByPlaceholder('账号',{exact:true}).fill(username);await p.getByPlaceholder('密码',{exact:true}).fill(password);await p.getByRole('button',{name:/登\s*录/}).click();await p.waitForURL(u=>u.pathname!='/login');}
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function shot(p,name){await p.locator('.ant-message-notice').last().waitFor({state:'hidden',timeout:10000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(160);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'无页面横向溢出');await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});}
async function gateRoute(p,pattern){let release;const hold=new Promise(r=>release=r);await p.route(pattern,async r=>{await hold;try{await r.continue();}catch(e){if(!/already handled|closed/.test(e.message))throw e;}});return async()=>{release();await p.unroute(pattern);};}
async function select(p,id,text){await p.locator('#'+id).click();await p.locator('.ant-select-dropdown:visible').getByText(text,{exact:false}).first().click();}

test('第十二轮：公共状态、连续学生旅程与正式产物',{timeout:420000},async t=>{
 mkdirSync(out,{recursive:true});mkdirSync(path.join(root,'test-results'),{recursive:true});
 // 使用已有 db:init 实现，在空目录初始化；不读取用户配置、数据库或附件。
 execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
 const db=new Database(env.DB_PATH);let browser,server;
 try{
  server=start(['scripts/local-server.cjs']);await ready(api+'/api/health');
  assert.ok(db.prepare('SELECT COUNT(*) n FROM users').get().n>0);console.log('Isolated empty-directory init + local-server: ready; existing dependencies reused.');
  db.prepare("INSERT INTO users(username,password_hash,real_name,role) SELECT 'round12_media',password_hash,'新媒体（验收测试）','media' FROM users WHERE id=4").run();
  db.prepare("UPDATE courses SET title='连续旅程（测试课程）' WHERE id=1").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES(1,1,'观察条件（验收测试）','合成测试内容，不是正式教材。',1,'published',2),(2,1,'调整与验证（验收测试）','比较一次真实试飞结果，记录观察。',2,'published',2)").run();
  db.prepare("INSERT INTO card_exercises(id,card_id,question_type,prompt,answer_json,explanation) VALUES(1,1,'true_false','需要记录观察条件吗（测试题）','true','验收测试解释')").run();
  start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5194','--strictPort'],path.join(root,'frontend'));
  start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5195','--strictPort'],path.join(root,'frontend'));
  await Promise.all([ready(base),ready(preview)]);browser=await chromium.launch({channel:'msedge',headless:true});console.log('Browser:',browser.version());
  const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await c.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const scenario=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();}catch(e){error=e;console.error(p.url(),(await p.locator('body').innerText()).slice(0,4000));await shot(p,'failure');throw e;}});if(error)throw error;};
  await scenario('公共加载：身份未知保持中性、课程检查可读、路由加载无假进度',async()=>{
   await login(p);await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   let release=await gateRoute(p,'**/api/auth/me');await p.reload();await p.getByRole('status').filter({hasText:'正在确认登录状态'}).waitFor();assert.equal(await p.locator('.student-shell').count(),0);await shot(p,'01-auth-loading');await release();await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   release=await gateRoute(p,'**/api/courses');await p.reload();await p.getByRole('status').filter({hasText:'正在确认可进入的课程'}).waitFor();await shot(p,'02-scope-loading');await release();await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   release=await gateRoute(p,'**/student/Rewards.jsx*');await p.goto(base+'/archives/rewards');await p.getByRole('status').filter({hasText:'正在加载页面'}).waitFor();await release();await p.getByTestId('reward-balance').waitFor();
  });
  await scenario('学生未知地址与 403：三尺寸、错误焦点、Tab 和真实恢复',async()=>{
   for(const[width,height]of sizes){await p.setViewportSize({width,height});for(const[url,title,code]of[['/missing/long-address','页面未找到','404'],['/students','当前身份无法访问此页面','403']]){
    await p.goto(base+url);const h=p.getByRole('heading',{name:title,exact:true});await h.waitFor();assert.ok(await h.evaluate(el=>el===document.activeElement));assert.equal(new URL(p.url()).pathname,url);await shot(p,`03-${code}-${width}`);await p.keyboard.press('Tab');assert.equal(await p.locator(':focus').innerText(),'返回探索地图');await p.keyboard.press('Enter');await p.waitForURL('**/explore');await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   }}await p.setViewportSize({width:1440,height:900});
  });
  await scenario('其他角色未知地址恢复到原首页且没有学生样式',async()=>{
   for(const[u,pwd,home]of[['adminpbl','admin123','/dashboard'],['mentor_zhang','mentor123','/dashboard'],['teacher_li','teacher123','/observer'],['round12_media','student123','/dashboard']]){const cc=await browser.newContext(),pp=await cc.newPage();try{await login(pp,u,pwd);await pp.goto(base+'/missing');await pp.getByText('页面未找到',{exact:true}).waitFor();assert.equal(await pp.locator('.student-pixel').count(),0);await button(pp,'返回工作台').click();await pp.waitForURL('**'+home);}finally{await cc.close();}}
  });
  await scenario('暂时检查失败可重试；明确对象/课程失效清内容并返回有效入口',async()=>{
   await p.route('**/api/courses',r=>r.fulfill({status:503,json:{error:'隔离网络故障'}}));await p.goto(base+'/explore');await p.getByRole('heading',{name:'暂时无法确认账号与课程'}).waitFor();await shot(p,'04-check-failed');await p.unroute('**/api/courses');await button(p,'重新检查').click();await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   await p.goto(base+'/courses/1');await p.locator('.route-node').first().waitFor();db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByRole('heading',{name:'当前内容已不可访问'}).waitFor();assert.equal(await p.locator('.route-node').count(),0);const denied=p.waitForResponse(r=>r.url()===base+'/api/courses/1'&&r.status()===404);await button(p,'重新检查').click();await(await denied).finished();assert.equal(await p.locator('.route-node').count(),0);await p.getByRole('heading',{name:'当前内容已不可访问'}).waitFor();await p.setViewportSize({width:390,height:844});await shot(p,'05-withdrawn-390');await p.getByRole('link',{name:'返回探索地图',exact:true}).click();await p.waitForURL('**/explore');await p.getByText('老师还没有为你分配已发布的课程，请联系老师。').waitFor();db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
   await p.route('**/api/learning/lessons/1',r=>r.fulfill({status:403,json:{error:'对象权限校验失败（测试长文案）：'+ '当前课时权限发生变化，请返回仍可进入的课程。'.repeat(10)}}));await p.goto(base+'/courses/1/lessons/1/learn');await p.getByRole('heading',{name:'当前内容已不可访问'}).waitFor();await shot(p,'05-object-long-message-390');await p.unroute('**/api/learning/lessons/1');await p.getByRole('link',{name:'返回探索地图',exact:true}).click();await p.waitForURL('**/explore');await p.setViewportSize({width:1440,height:900});
  });
  await scenario('连续真实旅程：待办→地图→卡片→参考引擎→原卡片→报告作品→导师评审→档案',async()=>{
   await login(p);await p.getByTestId('home-primary-todo').waitFor();await shot(p,'06-journey-home');await p.getByTestId('home-primary-todo').getByRole('button').click();await p.waitForURL(/lessons\/1\/learn/);
   await p.getByRole('button',{name:'返回课程地图',exact:true}).click();await p.waitForURL(u=>u.pathname==='/courses/1');await p.locator('[data-lesson-id="1"] .route-node').click();await p.getByTestId('lesson-details').getByRole('button',{name:'进入课时',exact:true}).click();
   await button(p,'我已完成课堂回顾').click();await p.getByRole('radio',{name:'正确',exact:true}).check();await button(p,'提交答案').click();await button(p,'我已学完本卡片').click();await p.getByRole('heading',{name:'调整与验证（验收测试）',exact:true}).waitFor();await button(p,'滑翔机实验（测试关联）').click();
   await p.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();let payload;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/glider/simulate'))payload=r.postDataJSON();});await button(p,'开始试飞').click();await p.getByText('计算成功',{exact:true}).waitFor({timeout:90000});const flight=db.prepare('SELECT * FROM glider_simulations WHERE student_id=4 ORDER BY id DESC LIMIT 1').get();assert.equal(flight.status,'success');assert.equal(flight.course_id,1);assert.equal(flight.lesson_id,1);for(const name of['三维航迹','飞行遥测'])await p.getByRole('img',{name,exact:true}).evaluate(img=>img.complete&&img.naturalWidth>0?true:new Promise((res,rej)=>{img.onload=res;img.onerror=rej;}));
   await p.locator('.flight-result-anchor').scrollIntoViewIfNeeded();await shot(p,'07-journey-real-flight');const evidence={engine:'reference',parameters:payload,state:flight.state,status:flight.status,result:JSON.parse(flight.summary_json),course_id:1,lesson_id:1};writeFileSync(path.join(root,delivery?'docs/round-12/evidence/journey-flight.json':'test-results/round12-flight.json'),JSON.stringify(evidence,null,2)+'\n');console.log('Journey reference flight:',JSON.stringify(evidence));assert.equal(db.prepare('SELECT COUNT(*) n FROM works WHERE student_id=4').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM lesson_learning_reports WHERE student_id=4').get().n,0);
   await button(p,'返回来源课程').click();await p.waitForURL('**/learn?stage=1&cardId=2');await p.getByRole('heading',{name:'调整与验证（验收测试）',exact:true}).waitFor();await p.setViewportSize({width:768,height:1024});await shot(p,'08-journey-return-card-768');await button(p,'我已学完本卡片').click();await p.setViewportSize({width:1440,height:900});
   await p.getByLabel('学习总结',{exact:true}).fill('验收测试：先记录观察条件，再比较参考引擎结果。');await p.getByText('结构化反思（必填）',{exact:true}).click();await p.getByLabel('遇到的困难',{exact:true}).fill('验收测试：如何区分计算成功与飞行结局。');await button(p,'提交学习报告与反思').click();await p.getByRole('button',{name:/确\s*定/,exact:true}).click();await p.getByText(/报告正在等待执行导师评审/).waitFor();
   await button(p,'提交作品').click();await p.getByLabel('作品名称',{exact:true}).fill('观察记录（连续验收测试作品）');await p.getByLabel('成果文字',{exact:true}).fill('测试成果文字：保留参数、比较结果、说明判断依据。');await button(p,'提交作品').click();await p.waitForURL('**/courses/1/lessons/1/learn');
   const report=db.prepare('SELECT id FROM lesson_learning_reports WHERE student_id=4').get(),work=db.prepare('SELECT id FROM works WHERE student_id=4').get();const auth=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'mentor_zhang',password:'mentor123'})}).then(r=>r.json());
   for(const[url,data]of[[`/mentor-reviews/${report.id}/review`,{status:'approved',score:88,comment:'测试导师报告意见：记录清楚。'}],[`/works/${work.id}/review`,{status:'approved',comment:'测试导师作品意见：证据完整。',suggestion:'测试建议：继续比较不同条件。',problem_discovery:4,solution_design:4,hands_on:4,data_analysis:4,presentation:4}]]){const r=await fetch(api+'/api'+url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify(data)});assert.equal(r.status,200,await r.text());}
   await p.goto(base+'/courses/1/lessons/1/learn?stage=3');await p.getByText('测试导师报告意见：记录清楚。',{exact:true}).waitFor();await p.goto(base+`/works/${work.id}`);await p.getByText('测试导师作品意见：证据完整。',{exact:true}).waitFor();await shot(p,'09-journey-feedback');await p.getByRole('navigation',{name:'学生主导航'}).getByRole('link',{name:/成长档案/}).click();await p.getByRole('heading',{name:'我的成长档案',exact:true}).waitFor();await select(p,'archive-course','#1');await select(p,'archive-lesson','认识月球');await p.getByText('报告评分：88 分',{exact:true}).waitFor();await shot(p,'10-journey-archive');assert.equal(db.prepare('SELECT review_status FROM works WHERE id=?').get(work.id).review_status,'approved');assert.deepEqual(errors,[]);
  });
  await scenario('正式 dist：登录、探索、真实课时深链刷新、全局入口、403、测试路由与映射关闭',async()=>{
   const cc=await browser.newContext({viewport:{width:390,height:844}}),pp=await cc.newPage();pp.setDefaultTimeout(12000);try{await login(pp,'student_wang','student123',preview);await pp.getByRole('heading',{name:'探索地图',exact:true}).waitFor();await pp.goto(preview+'/courses/1');await pp.locator('.route-node').first().waitFor();assert.equal(await pp.getByText(/测试章节 [AB]/).count(),0);assert.equal(await button(pp,'滑翔机实验（测试关联）').count(),0);
    await pp.goto(preview+'/courses/1/lessons/1/learn?stage=1&cardId=2');await pp.reload();await pp.getByRole('heading',{name:'调整与验证（验收测试）',exact:true}).waitFor();assert.equal(await button(pp,'滑翔机实验（测试关联）').count(),0);await shot(pp,'11-production-deep-link-390');
    await button(pp,'打开学习伙伴').click();await button(pp,'向灵境小智提问').click();await pp.getByText('灵境小智暂未启用',{exact:true}).waitFor();await pp.goto(preview+'/notifications');await pp.getByRole('heading',{name:'通知中心',exact:true}).waitFor();await pp.goto(preview+'/students');await pp.getByRole('heading',{name:'当前身份无法访问此页面'}).waitFor();await button(pp,'返回探索地图').click();await pp.waitForURL('**/explore');await pp.goto(preview+'/__pixel-preview');await pp.getByRole('heading',{name:'页面未找到'}).waitFor();assert.equal(await pp.locator('script[src*="/src/"]').count(),0);
   }finally{await cc.close();}
  });
  await scenario('实际 Python 路径缺失：禁止假试飞、参数保留并提供重新检查环境',async()=>{
   await stop(server);server=start(['scripts/local-server.cjs'],root,{GLIDER_PYTHON:path.join(scratch,'missing-python.exe')});await ready(api+'/api/health');await p.goto(base+'/glider');await p.getByText('模拟引擎暂不可用，请稍后再试或联系老师。',{exact:true}).waitFor();assert.ok(await button(p,'开始试飞').isDisabled());await p.locator('#speed').fill('41');await button(p,'重新检查环境').click();await p.getByText('模拟引擎暂不可用，请稍后再试或联系老师。',{exact:true}).waitFor();assert.equal(await p.locator('#speed').inputValue(),'41');await shot(p,'12-missing-python');
  });
 }finally{await browser?.close();for(const child of children)await stop(child);db.close();}
});
