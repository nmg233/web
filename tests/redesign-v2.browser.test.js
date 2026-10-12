import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
const base='http://127.0.0.1:5196',api='http://127.0.0.1:3145';
const out=path.join(root,'test-results/redesign-v2/browser');
const sizes=[[1440,900],[768,1024],[390,844]];
const btn=(p,name)=>p.getByRole('button',{name,exact:true});
async function ready(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Service startup failed: '+url);}
async function login(p,username='student_wang',password='student123'){await p.goto(base+'/login');await p.getByPlaceholder('账号',{exact:true}).fill(username);await p.getByPlaceholder('密码',{exact:true}).fill(password);await p.getByRole('button',{name:/登\s*录/}).click();await p.waitForURL(u=>u.pathname!='/login');}
async function shot(p,name){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'无横向页面溢出 '+name);await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});}
async function expectValue(p,selector,value){await p.waitForFunction(({selector,value})=>document.querySelector(selector)?.value===value,{selector,value});}
test('新版第 1 步：真实课程空间、样板与学习回归',{timeout:360000},async t=>{
 const {env}=fixture(3145,5196);mkdirSync(out,{recursive:true});const children=[];
 const start=(args,cwd=root)=>{const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'pipe'});child.stdout.resume();child.stderr.on('data',s=>{if(String(s).includes('错误:'))console.log(String(s).slice(0,800));});children.push(child);};
 const db=new Database(env.DB_PATH);let browser;
 try{
  start(['scripts/local-server.cjs']);start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5196','--strictPort'],path.join(root,'frontend'));
  await Promise.all([ready(base),ready(api+'/api/health')]);browser=await chromium.launch({channel:'msedge',headless:true});console.log('Edge:',browser.version());
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const scenario=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;console.log('FAILED URL:',p.url(),(await p.locator('body').innerText()).slice(0,1600));await p.screenshot({path:path.join(out,'failure.png')});throw e;}});if(failure)throw failure;};
  await scenario('平台课程选择：真实分配、无全局待办、单课程不自动跳转、三尺寸字体',async()=>{
   const reads=[];p.on('request',r=>{if(r.url().includes('/api/'))reads.push(r.url());});await login(p);await p.getByTestId('home-course-card').first().waitFor();assert.equal(await p.getByTestId('home-course-card').count(),2);assert.equal(await p.locator('.student-partner').count(),0);assert.equal(await p.locator('.space-sidebar').count(),0);assert.equal(reads.some(u=>/\/api\/(tasks|learning)/.test(u)),false);
   for(const[width,height]of sizes){await p.setViewportSize({width,height});await shot(p,'selector-'+width);assert.match(await p.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/ChillReunion/);}
   db.prepare("UPDATE enrollments SET status='removed' WHERE id=9002").run();await p.reload();await p.getByTestId('home-course-card').first().waitFor();assert.equal(await p.getByTestId('home-course-card').count(),1);assert.equal(new URL(p.url()).pathname,'/explore');db.prepare("UPDATE enrollments SET status='active' WHERE id=9002").run();await p.setViewportSize({width:1440,height:900});
  });
  await scenario('地图真课时、多章节、键盘节点、课时安排与未分组默认主题',async()=>{
   await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();assert.equal(await p.locator('.route-node').count(),6);assert.equal(await p.locator('.route-group').count(),2);assert.equal(await p.locator('[aria-current="step"]').count(),1);
   await p.locator('[data-lesson-id="90011"] .route-node').focus();await p.keyboard.press('Enter');await p.getByTestId('lesson-details').getByText('观察与提问',{exact:true}).waitFor();await p.getByTestId('lesson-details').getByText('科创教室（测试地点）',{exact:true}).waitFor();await shot(p,'map-1440');await p.locator('.space-lesson-modal .ant-modal-close').click();
   for(const[width,height]of sizes.slice(1)){await p.setViewportSize({width,height});await shot(p,'map-'+width);await p.locator('[data-lesson-id="90011"] .route-node').click();await p.locator('.space-lesson-modal').getByTestId('lesson-details').waitFor();await shot(p,'lesson-details-'+width);await p.locator('.space-lesson-modal .ant-modal-close').click();}
   await p.setViewportSize({width:360,height:800});await shot(p,'map-360');await p.setViewportSize({width:844,height:390});await shot(p,'map-landscape');await p.setViewportSize({width:1440,height:900});await p.goto(base+'/courses/9002');await p.locator('.route-node').first().waitFor();assert.equal(await p.locator('.space-map').getAttribute('data-map-theme'),'campus');assert.equal(await p.getByRole('button',{name:'滑翔机实验（测试关联）',exact:true}).count(),0);await shot(p,'map-default');
  });
  await scenario('报告通过但作品退回仍有修改入口；无作品任务仍可继续学习',async()=>{
   await p.goto(base+'/courses/9001');await p.locator('.space-course-todos .ant-collapse-header').click();await p.getByTestId('home-primary-todo').waitFor();assert.match(await p.getByTestId('home-primary-todo').innerText(),/修改作品/);await p.getByTestId('home-primary-todo').getByRole('button').click();await p.waitForURL('**/courses/9001/works/9001');await btn(p,'修改后重新提交').click();await p.waitForURL(/courses\/9001\/works\/upload/);await p.getByLabel('作品名称',{exact:true}).fill('修改后的比较记录（测试作品）');await p.getByLabel('成果文字',{exact:true}).fill('补充后的测试比较依据');await btn(p,'提交作品').click();await p.waitForURL('**/courses/9001/lessons/90013/learn');assert.equal(db.prepare('SELECT max(version) v FROM works WHERE task_id=9002').get().v,2);await p.goto(base+'/courses/9001');await p.locator('.space-course-todos .ant-collapse-header').click();const todo=p.locator('.home-todo').filter({hasText:'记录实验条件'});await todo.getByRole('button',{name:'继续学习',exact:true}).click();await p.waitForURL(/lessons\/90012\/learn/);
  });
  await scenario('旧对象链接定位真实课程，旧全局实验不伪造课程；篡改课时被拒绝',async()=>{
   await p.goto(base+'/works/9001');await p.waitForURL('**/courses/9001/works/9001');await p.getByRole('heading',{name:'比较记录待修改（测试作品）',exact:true}).waitFor();await p.goto(base+'/tasks/9001');await p.waitForURL('**/courses/9001/lessons/90011/learn');
   await p.goto(base+'/glider');await p.waitForURL('**/explore');await p.getByText('请先选择课程，再进入对应的学习空间',{exact:true}).waitFor();
   await p.goto(base+'/courses/9001/lessons/90021/learn');await p.getByRole('heading',{name:'当前内容已不可访问',exact:true}).waitFor();assert.equal(await p.getByLabel('学习总结',{exact:true}).count(),0);
  });
  await scenario('附件 404 不隐藏地图；课程撤回清除内容，恢复后重新检查可访问',async()=>{
   await p.goto(base+'/courses/9001');await btn(p,'课程资源').click();await btn(p,'下载缺失附件（测试资源）').click();await p.getByText('这份附件暂不可用，请联系老师补充。你可以继续学习其他内容',{exact:true}).waitFor();assert.equal(await p.locator('.route-node').count(),6);
   db.prepare("UPDATE courses SET status='draft' WHERE id=9001").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByRole('heading',{name:'当前内容已不可访问',exact:true}).waitFor();assert.equal(await p.locator('.route-node').count(),0);await btn(p,'重新检查').click();await p.getByRole('heading',{name:'当前内容已不可访问',exact:true}).waitFor();db.prepare("UPDATE courses SET status='published' WHERE id=9001").run();await btn(p,'重新检查').click();await p.locator('.route-node').first().waitFor();
  });
  await scenario('课程试飞真闭环：指定卡片→参考引擎→原卡片，记录归属与不自动提交',async()=>{
   await p.goto(base+'/courses/9001/lessons/90011/learn');await btn(p,'我已完成课堂回顾').click();await p.getByRole('radio',{name:'正确',exact:true}).check();await btn(p,'提交答案').click();await btn(p,'我已学完本卡片').click();await p.getByRole('heading',{name:'调整与验证（测试卡片）',exact:true}).waitFor();await btn(p,'滑翔机实验（测试关联）').click();await p.waitForURL(/courses\/9001\/glider/);await p.getByText('实验环境就绪，可以开始试飞',{exact:true}).waitFor();assert.equal(await p.locator('.flight-history-entry').count(),0);
   let submitted;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/glider/simulate'))submitted=r.postDataJSON();});const initialWorks=db.prepare('SELECT count(*) n FROM works').get().n;await btn(p,'开始试飞').click();await p.getByText('计算成功',{exact:true}).waitFor({timeout:120000});assert.equal(submitted.course_id,9001);assert.equal(submitted.lesson_id,90011);assert.equal(db.prepare('SELECT count(*) n FROM works').get().n,initialWorks);
   const sim=db.prepare('SELECT * FROM glider_simulations WHERE course_id=9001 ORDER BY id DESC LIMIT 1').get();assert.equal(sim.status,'success');assert.equal(sim.student_id,4);assert.equal(db.prepare('SELECT count(*) n FROM lesson_learning_reports WHERE lesson_id=90011').get().n,0);
   writeFileSync(path.join(out,'reference-flight.json'),JSON.stringify({backend:'reference',course_id:sim.course_id,lesson_id:sim.lesson_id,status:sim.status,state:sim.state,parameters:submitted,result:JSON.parse(sim.summary_json)},null,2));
   await p.getByRole('img',{name:'三维航迹',exact:true}).waitFor();await shot(p,'course-flight');await btn(p,'返回来源课程').click();await p.waitForURL('**/learn?stage=1&cardId=900112');await p.getByRole('heading',{name:'调整与验证（测试卡片）',exact:true}).waitFor();await shot(p,'return-card');
  });
  await scenario('课程内自由实验固定课程、不造课时；切课不显示其他课程或未关联旧记录',async()=>{
   await p.goto(base+'/courses/9001/glider');await p.getByText('实验环境就绪，可以开始试飞',{exact:true}).waitFor();assert.equal(await p.locator('.flight-history-entry').count(),1);await p.getByText('查看固定课程关联',{exact:true}).click();assert.equal(await p.locator('#course_id').isDisabled(),true);assert.equal(await p.locator('#lesson_id').inputValue(),'');await btn(p,'返回来源课程').click();await p.waitForURL('**/courses/9001/lab');
   await p.goto(base+'/courses/9002/glider');await p.getByText('实验环境就绪，可以开始试飞',{exact:true}).waitFor();assert.equal(await p.locator('.flight-history-entry').count(),1);assert.match(await p.locator('.flight-history-entry').innerText(),/#9001/);assert.doesNotMatch(await p.locator('.flight-history-entry').innerText(),/#9002/);
   await p.reload();await p.getByText('实验环境就绪，可以开始试飞',{exact:true}).waitFor();assert.equal(await p.locator('.flight-history-entry').count(),1);
  });
  await scenario('报告草稿按原位置恢复；课时取消清除，再恢复不越权',async()=>{
   await p.goto(base+'/courses/9001/lessons/90011/learn?stage=1&cardId=900112');await btn(p,'我已学完本卡片').click();await p.getByLabel('学习总结',{exact:true}).fill('新版验收：保留当前账号课程课时草稿');await p.getByText('已保存到当前浏览器，仅当前账号可恢复。附件不会保存在草稿中',{exact:true}).waitFor();
   await p.goto(base+'/courses/9001/lessons/90011/learn?stage=2');await p.getByLabel('学习总结',{exact:true}).waitFor();db.prepare("UPDATE lessons SET status='cancelled' WHERE id=90011").run();await p.evaluate(()=>dispatchEvent(new Event('student-access-check')));await p.getByRole('heading',{name:'当前内容已不可访问',exact:true}).waitFor();const denied=p.waitForResponse(r=>r.url().endsWith('/learning/lessons/90011')&&r.status()===404);await btn(p,'重新检查').click();await denied;await p.getByRole('heading',{name:'当前内容已不可访问',exact:true}).waitFor();assert.equal(await p.getByLabel('学习总结',{exact:true}).count(),0);db.prepare("UPDATE lessons SET status='scheduled' WHERE id=90011").run();await btn(p,'重新检查').click();await p.getByLabel('学习总结',{exact:true}).waitFor();await expectValue(p,'#summary','新版验收：保留当前账号课程课时草稿');
  });
  await scenario('报告与作品各自提交；导师原角色评审，成长档案只显示当前课程',async()=>{
   await p.getByText('结构化反思（必填）',{exact:true}).click();await p.getByLabel('遇到的困难',{exact:true}).fill('测试：比较不同条件的依据');await btn(p,'提交学习报告与反思').click();await p.getByRole('button',{name:/确\s*定/,exact:true}).click();await p.getByText(/报告正在等待执行导师评审/).waitFor();await p.getByRole('link',{name:'提交作品',exact:true}).click();await p.waitForURL(/courses\/9001\/works\/upload/);await p.getByLabel('作品名称',{exact:true}).fill('本课程试飞记录（验收作品）');await p.getByLabel('成果文字',{exact:true}).fill('测试观察和证据。');await btn(p,'提交作品').click();await p.waitForURL('**/courses/9001/lessons/90011/learn');
   const auth=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'mentor_zhang',password:'mentor123'})}).then(r=>r.json());const report=db.prepare('SELECT id FROM lesson_learning_reports WHERE lesson_id=90011').get();const r=await fetch(api+'/api/mentor-reviews/'+report.id+'/review',{method:'POST',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:JSON.stringify({status:'approved',score:88,comment:'测试：记录完整'})});assert.equal(r.status,200);
   await p.goto(base+'/courses/9001/archives');await p.getByRole('heading',{name:'我的成长档案',exact:true}).waitFor();await p.getByRole('tab',{name:'作品与迭代',exact:true}).click();await p.getByText('本课程试飞记录（验收作品）',{exact:true}).waitFor();assert.equal(await p.getByText('另一课程作品（测试作品）',{exact:true}).count(),0);await p.goto(base+'/courses/9002/archives');await p.getByRole('tab',{name:'作品与迭代',exact:true}).click();await p.getByText('另一课程作品（测试作品）',{exact:true}).waitFor();assert.equal(await p.getByText('本课程试飞记录（验收作品）',{exact:true}).count(),0);
  });
  await scenario('我的保留同账号奖励、跨标签兑换同步、切课无重置、安全返回',async()=>{
   await p.goto(base+'/me?returnTo='+encodeURIComponent('/courses/9001'));await p.getByTestId('reward-balance').waitFor();const other=await context.newPage();await other.goto(base+'/courses/9002');await other.getByTestId('header-demo-points').getByText('120',{exact:true}).waitFor();
   await p.getByRole('button',{name:'查看礼品详情',exact:true}).first().click();await btn(p,'演示兑换').click();await btn(p,'确认演示兑换').click();await p.getByText('演示兑换成功',{exact:true}).waitFor();await other.getByTestId('header-demo-points').getByText('80',{exact:true}).waitFor();await btn(p,'返回礼品').click();await p.getByRole('link',{name:'返回来源课程 →',exact:true}).click();await p.waitForURL('**/courses/9001');await p.getByTestId('header-demo-points').getByText('80',{exact:true}).waitFor();await other.close();
   await p.goto(base+'/me?returnTo='+encodeURIComponent('https://example.com'));await p.getByTestId('reward-balance').waitFor();assert.equal(await p.getByRole('link',{name:'返回来源课程 →',exact:true}).count(),0);
  });
  await scenario('平台服务页、普通教师与导师原业务入口及字体保持可用',async()=>{
   for(const route of ['/notifications','/feedback','/change-password']){await p.goto(base+route);await p.locator('.service-page').waitFor();assert.equal(await p.locator('.space-sidebar').count(),0);assert.equal(await p.locator('.student-partner').count(),0);await shot(p,route.slice(1));}
   for(const [name,password,home]of [['mentor_zhang','mentor123','/dashboard'],['teacher_li','teacher123','/observer'],['adminpbl','admin123','/dashboard']]){const c=await browser.newContext({viewport:{width:1440,height:900}}),q=await c.newPage();try{await login(q,name,password);await q.waitForURL('**'+home);await q.locator('.space-staff-shell').waitFor();assert.match(await q.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/ChillReunion/);await shot(q,'role-'+name);}finally{await c.close();}}
   assert.deepEqual(errors,[]);
  });
  await context.close();console.log('新版业务场景全部通过。');
 }finally{if(browser)await browser.close();db.close();for(const child of children){if(child.exitCode===null)child.kill();}}
});
