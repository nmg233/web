import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4174',dir='docs/redesign-v2/step-01';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
 const response=await p.goto(base+'/login');const html=await response.text();const dist=readFileSync('frontend/dist/index.html','utf8');
 await p.getByLabel('账号',{exact:true}).waitFor();assert.equal(await p.title(),'PBL 科创平台');
 const bundles=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(m=>m[1]);
 for(const bundle of bundles)assert.ok(dist.includes(bundle));
 await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL('**/explore');await p.getByTestId('home-course-card').first().waitFor();
 await p.getByTestId('home-course-card').first().click();await p.waitForURL('**/courses/9001');await p.locator('.route-node').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:dir+'/screenshots/preview-4174.png'});
 const images=await p.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/redesign-v2/')).map(e=>new URL(e.name).pathname));assert.equal(images.some(v=>v.includes('/masters/')),false);assert.equal(await p.locator('.route-node').count(),6);
 assert.deepEqual(pageErrors,[]);
 writeFileSync(dir+'/evidence/preview-4174.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),url:p.url(),matchedBuiltBundles:bundles,requestedArt:images,routeNodeCount:6,pageErrors},null,2));
 const staff=await browser.newPage();await staff.goto(base+'/login');await staff.getByLabel('账号',{exact:true}).fill('mentor_zhang');await staff.getByLabel('密码',{exact:true}).fill('mentor123');await staff.getByRole('button',{name:'登录',exact:true}).click();await staff.waitForURL('**/dashboard');await staff.locator('.space-staff-shell').waitFor();await staff.getByText('PBL 科创平台',{exact:true}).waitFor();assert.equal(await staff.title(),'PBL 科创平台');await staff.close();
 console.log('4174 与当前 dist JS/CSS 哈希一致；6 个真实节点；无 pageerror；无母版请求。');
} finally {await browser.close();}
