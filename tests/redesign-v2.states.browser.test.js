import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
const base='http://127.0.0.1:5197';
const sizes=[[1440,900],[768,1024],[390,844]];
const out=path.join(root,'test-results/redesign-v2/states');
async function ready(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('启动失败 '+url);}
async function login(p,password='student123'){await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');}
async function shot(p,name,fullPage=false){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'无溢出 '+name);await p.screenshot({path:path.join(out,name+'.png'),fullPage,animations:'disabled'});}
async function three(p,name){for(const[width,height]of sizes){await p.setViewportSize({width,height});await shot(p,name+'-'+width);await shot(p,name+'-'+width+'-full',true);}}
const gate=()=>{let release;return{promise:new Promise(r=>release=r),release:()=>release()};};

test('新版平台边界、迟到响应与三尺寸状态验收',{timeout:180000},async t=>{
 const {env}=fixture(3146,5197),db=new Database(env.DB_PATH),children=[];let browser;
 mkdirSync(out,{recursive:true});
 const start=(args,cwd=root)=>{const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'pipe'});child.stdout.resume();child.stderr.resume();children.push(child);};
 try{
  start(['scripts/local-server.cjs']);start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5197','--strictPort'],path.join(root,'frontend'));
  await Promise.all([ready(base),ready('http://127.0.0.1:3146/api/health')]);
  browser=await chromium.launch({channel:'msedge',headless:true});console.log('Edge:',browser.version());
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(12000);
  const scenario=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;console.log('失败页面',p.url(),(await p.locator('body').innerText()).slice(0,1400));await p.screenshot({path:path.join(out,'failure.png')});throw e;}});if(failure)throw failure;};
  await scenario('登录三尺寸及真实强制改密完成后进入选择页',async()=>{
   await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).waitFor();await three(p,'login');
   db.prepare('UPDATE users SET force_reset_password=1 WHERE id=4').run();await login(p);await p.waitForURL('**/change-password');await p.getByRole('heading',{name:'先设置你的新密码',exact:true}).waitFor();await shot(p,'forced-password');assert.equal(await p.locator('.space-sidebar').count(),0);
   await p.getByLabel('原密码',{exact:true}).fill('student123');await p.getByLabel('新密码',{exact:true}).fill('V2student#123');await p.getByLabel('确认新密码',{exact:true}).fill('V2student#123');await p.getByRole('button',{name:'确认修改',exact:true}).click();await p.waitForURL('**/explore');await p.getByTestId('home-course-card').first().waitFor();assert.equal(db.prepare('SELECT force_reset_password v FROM users WHERE id=4').get().v,0);
  });
  await scenario('无分配课程真实空状态、恢复分配、键盘进入与手机点击',async()=>{
   db.prepare("UPDATE enrollments SET status='removed' WHERE id IN (9001,9002)").run();await p.reload();await p.getByText('老师还没有为你分配已发布的课程，请联系老师',{exact:true}).waitFor();await three(p,'empty');
   db.prepare("UPDATE enrollments SET status='active' WHERE id IN (9001,9002)").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByTestId('home-course-card').first().waitFor();assert.equal(await p.getByTestId('home-course-card').count(),2);
   await p.getByTestId('home-course-card').first().focus();await p.keyboard.press('Enter');await p.waitForURL('**/courses/9001');await p.locator('.route-node').first().waitFor();await p.goto(base+'/explore');await p.getByTestId('home-course-card').nth(1).click();await p.waitForURL('**/courses/9002');await p.locator('.route-node').first().waitFor();await three(p,'default-map');
  });
  await scenario('地图与我的全页三尺寸、手机菜单关闭、刷新与新标签、返回滚动可见',async()=>{
   await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();await three(p,'voyage-map');
   await p.getByRole('button',{name:'打开课程导航',exact:true}).click();await p.locator('.space-navigation-drawer .space-course-navigation').waitFor();await shot(p,'mobile-sidebar');await p.locator('.space-navigation-drawer').getByRole('link',{name:/实验室/}).click();await p.waitForURL('**/courses/9001/lab');await p.waitForFunction(()=>document.querySelector('.space-menu-button')?.getAttribute('aria-expanded')==='false'&&!document.querySelector('.space-navigation-drawer.ant-drawer-open'));
   await p.goto(base+'/courses/9001/lessons/90011/learn');await p.getByRole('button',{name:'我已完成课堂回顾',exact:true}).waitFor();await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));const box=await p.getByRole('link',{name:'返回课程地图',exact:true}).boundingBox();assert.ok(box.y>=65&&box.y+box.height<200);await shot(p,'sticky-return');await p.getByRole('link',{name:'返回课程地图',exact:true}).click();await p.waitForURL('**/courses/9001');
   const q=await context.newPage();await q.goto(base+'/courses/9002/archives');await q.getByRole('heading',{name:'我的成长档案',exact:true}).waitFor();await q.reload();await q.getByRole('heading',{name:'我的成长档案',exact:true}).waitFor();assert.equal(await q.locator('[data-space-theme]').getAttribute('data-space-theme'),'campus');await q.close();
   await p.goto(base+'/me?returnTo=%2Fcourses%2F9001');await p.getByTestId('reward-balance').waitFor();await three(p,'personal');assert.equal(await p.locator('.space-sidebar').count(),0);
  });
  await scenario('A 课程迟到响应不能覆盖已切换到 B 的主题与课时',async()=>{
   await p.setViewportSize({width:1440,height:900});const hold=gate(),entered=gate();
   await p.route('**/api/course-spaces/9001/courses/9001',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
   try{await p.goto(base+'/courses/9001');await entered.promise;await p.getByRole('link',{name:'返回课程选择',exact:true}).click();await p.getByTestId('home-course-card').nth(1).click();await p.waitForURL('**/courses/9002');await p.locator('[data-lesson-id="90021"]').waitFor();hold.release();await p.waitForTimeout(300);assert.equal(await p.locator('[data-lesson-id="90011"]').count(),0);assert.equal(await p.locator('.space-map').getAttribute('data-map-theme'),'campus');}
   finally{hold.release();await p.unroute('**/api/course-spaces/9001/courses/9001');}
  });
  await scenario('课程读取失败可重试、卡片失效返回地图、图片失败不影响可操作节点',async()=>{
   await p.route('**/api/course-spaces/9001/courses/9001',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'隔离验收：课程接口暂时不可用'})}));await p.goto(base+'/courses/9001');await p.getByRole('heading',{name:'暂时无法读取课程显示',exact:true}).waitFor();await three(p,'network-error');await p.unroute('**/api/course-spaces/9001/courses/9001');await p.getByRole('button',{name:'重新读取',exact:true}).click();await p.locator('.route-node').first().waitFor();
   await p.goto(base+'/courses/9001/lessons/90011/learn?stage=1&cardId=999999');await p.waitForURL('**/courses/9001');await p.getByText(/原知识卡片已不可访问/).waitFor();
   await p.route('**/assets/redesign-v2/web/**',r=>r.abort());await p.reload();await p.locator('.route-node').first().waitFor();await p.locator('.space-map [data-art-failed]').waitFor();assert.equal(await p.locator('.route-node').count(),6);await shot(p,'image-fallback');await p.unroute('**/assets/redesign-v2/web/**');
  });
  await scenario('账号停用清除已有课程内容并回到登录',async()=>{
   db.prepare('UPDATE users SET is_active=0 WHERE id=4').run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForURL('**/login');assert.equal(await p.locator('.route-node').count(),0);assert.equal(await p.evaluate(()=>localStorage.getItem('token')),null);await shot(p,'account-disabled');
  });
  writeFileSync(path.join(out,'capture.json'),JSON.stringify({browser:browser.version(),date:new Date().toISOString(),base,sizes,data:'全新临时数据库中的合成测试课程；错误场景使用明确的 503/图片请求失败注入，其余为真实 API'},null,2));await context.close();
 }finally{if(browser)await browser.close();db.close();for(const child of children)if(child.exitCode===null)child.kill();}
});
