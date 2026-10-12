import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'docs/redesign-v2/step-03'),base='http://127.0.0.1:4174';
async function login(p,name,password){await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(name);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');}
test('第三步最终 4174 产物与交接入口',{timeout:60000},async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const records=[];
 try{const context=await browser.newContext(),p=await context.newPage();p.setDefaultTimeout(12000);
  await t.test('新生产构建：学生从真实 API 读取主题和章节，三尺寸节点可用',async()=>{
   await login(p,'student_wang','student123');await p.getByTestId('home-course-card').first().click();await p.waitForURL('**/courses/9001');await p.locator('.route-node').first().waitFor();assert.equal(await p.locator('[data-course-theme]').getAttribute('data-course-theme'),'voyage');assert.equal(await p.locator('.route-node').count(),6);assert.equal(await p.locator('.pixel-map-region').count(),2);
   for(const[width,height]of[[1440,900],[768,1024],[390,844]]){await p.setViewportSize({width,height});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(dir,'screenshots/preview-map-'+width+'.png'),animations:'disabled'});}records.push('student-preview-pass');
  });
  await t.test('导师维护入口为当前产物，章节/资料队列和字体真实读取，三尺寸可达',async()=>{
   await context.close();const mentor=await browser.newContext({viewport:{width:1440,height:900}}),q=await mentor.newPage();await login(q,'mentor_zhang','mentor123');await q.goto(base+'/courses/9001?tab=maintenance');await q.locator('[data-testid=content-maintenance][data-course-id="9001"]').waitFor();assert.ok((await q.getByLabel('界面主题',{exact:true}).locator('..').innerText()).includes('星海远航'));
   for(const[width,height]of[[1440,900],[768,1024],[390,844]]){await q.setViewportSize({width,height});await q.getByRole('tab',{name:'章节与课时',exact:true}).click();assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.match(await q.getByTestId('content-maintenance').evaluate(e=>getComputedStyle(e).fontFamily),/ChillReunion/);await q.screenshot({path:path.join(dir,'screenshots/preview-maintenance-'+width+'.png'),animations:'disabled'});}await q.getByRole('tab',{name:'教学资料与回放',exact:true}).click();await q.getByTestId('upload-resource').waitFor();records.push('mentor-preview-pass');await mentor.close();
  });
  await t.test('真实截图图集、946 项新版编辑页和基线文件可人工打开',async()=>{
   const q=await browser.newPage();await q.goto(pathToFileURL(path.join(dir,'index.html')).href);assert.equal(await q.locator('figure img').count(),49);await q.locator('figure img').first().evaluate(img=>img.decode());await q.goto(pathToFileURL(path.join(dir,'copy-review.html')).href);assert.equal(await q.locator('[data-copy-id]').count(),946);assert.equal(Object.keys(JSON.parse(readFileSync(path.join(dir,'copy-baseline.json'),'utf8'))).length,946);await q.screenshot({path:path.join(dir,'screenshots/copy-review-preview.png')});records.push('handoff-preview-pass');await q.close();
  });
  mkdirSync(path.join(dir,'evidence'),{recursive:true});writeFileSync(path.join(dir,'evidence/preview-browser.json'),JSON.stringify({url:base,browser:browser.version(),checkedAt:new Date().toISOString(),records,data:'fresh isolated preview only; no business DB'},null,2));
 }finally{await browser.close();}
});
