import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
import {prepareSkeleton} from '../scripts/teaching.mjs';
import {readCopy} from '../scripts/fortune-copy.mjs';
import {applyPageEdits} from '../scripts/page-copy.mjs';
import fortuneService from '../backend/services/dailyFortune.js';
const dir=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/experience-patch/browser')),run=process.env.PBL_FORTUNE_RUN||'first',shots=path.join(dir,'screenshots-'+run);
const base='http://127.0.0.1:4196',api='http://127.0.0.1:3166';
const signature=({level,art,good,avoid})=>({level,art,good,avoid});
const gate=()=>{let release;return{promise:new Promise(r=>release=r),release};};
const ready=async url=>{for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Service not ready');};
test('体验补修：地图、头像、文案、运势真实浏览器',{timeout:240000},async t=>{
 fs.mkdirSync(shots,{recursive:true});const f=fixture(3166,4196),db=new Database(f.env.DB_PATH),plan=prepareSkeleton(db),records=[],errors=[];
 // A future browser date must not continually rotate a real-clock 15-minute JWT.
 // Reuse the existing expiry setting in this disposable fixture only.
 f.env.JWT_ACCESS_EXPIRES_IN='1500000';
 db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(5,?,'active')").run(plan.courseId);
 let server;const start=async()=>{server=fork(path.join(root,'tests/helpers/fortune-clock-server.cjs'),[],{cwd:root,env:f.env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});await once(server,'message');};
 const stop=async()=>{const exited=once(server,'exit');server.send({type:'stop'});await exited;};
 const clock=async time=>{const reply=once(server,'message');server.send({type:'clock',time});assert.equal((await reply)[0].clock,time);};
 await start();const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4196','--strictPort'],{cwd:path.join(root,'frontend'),env:f.env,windowsHide:true,stdio:'ignore'});await ready(base);
 const browser=await chromium.launch({channel:'msedge',headless:true}),c=await browser.newContext({viewport:{width:1440,height:900}}),p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 const login=async(p,name='student_wang')=>{await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(name);await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');};
 const go=async url=>{await p.goto(base+url);};
 const result=async page=>{await page.locator('.fortune-result').waitFor();return page.getByTestId('daily-fortune').innerText();};
 const read=async page=>page.evaluate(async()=>{const r=await fetch('/api/account/daily-fortune',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}});return r.json();});
 const date=async d=>{await p.getByTestId('daily-fortune').getByText(d,{exact:true}).waitFor();await p.locator('.fortune-result').waitFor();};
 const shot=async name=>{await p.evaluate(()=>document.fonts.ready);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(shots,name+'.png'),animations:'disabled',fullPage:false});};
 const scene=async(name,fn)=>{if(process.env.PBL_TARGET_SCENE&&!name.includes(process.env.PBL_TARGET_SCENE))return;let failure;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){failure=e;records.push({name,status:'failed',error:e.message});await shot('failure').catch(()=>{});throw e;}});if(failure)throw failure;};
 try{
  await login(p);
  await scene('持续打开页面跨北京午夜，比较实际组合；同日刷新、独立浏览器及后端重启一致',async()=>{
   await p.clock.install({time:new Date('2026-12-06T15:59:59Z')});await go('/me');await date('2026-12-06');const before=await read(p);
   await clock('2026-12-06T16:00:00Z');await p.clock.runFor(1200);await p.clock.resume();await date('2026-12-07');const after=await read(p);assert.notDeepEqual(signature(before),signature(after));
   await p.reload();await date('2026-12-07');assert.deepEqual(await read(p),after);
   const c2=await browser.newContext(),q=await c2.newPage();await login(q);await q.goto(base+'/me');await q.locator('.fortune-result').waitFor();assert.deepEqual(await read(q),after);await c2.close();
   await stop();await start();await clock('2026-12-06T16:00:00Z');assert.deepEqual(await read(p),after);
  });
  await scene('后台休眠后 focus/visibility 重读，跳过多天、跨年与闰日恢复正确日期',async()=>{
   for(const [time,d,event]of [['2027-01-01T00:00:00Z','2027-01-01','focus'],['2028-02-29T00:00:00Z','2028-02-29','visibilitychange'],['2028-03-01T00:00:00Z','2028-03-01','focus']]){
    await clock(time);await p.clock.setSystemTime(new Date(time));await p.evaluate(event=>event==='focus'?window.dispatchEvent(new Event(event)):document.dispatchEvent(new Event(event)),event);await date(d);
   }
  });
  await scene('跨日网络失败隐藏旧结果、标出上次日期，手动重试读取当天且不写奖励',async()=>{
   const storage=await p.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes('reward')));await clock('2028-03-02T00:00:00Z');await p.clock.setSystemTime(new Date('2028-03-02T00:00:00Z'));
   await p.route('**/account/daily-fortune',r=>r.fulfill({status:503,json:{error:'隔离测试：跨日网络暂时失败'}}));await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.getByRole('alert').filter({hasText:'跨日网络暂时失败'}).waitFor();assert.equal(await p.locator('.fortune-result').count(),0);await p.getByText('上次读取日期 2028-03-01',{exact:true}).waitFor();await shot('cross-day-failure');await p.setViewportSize({width:390,height:844});await shot('cross-day-failure-mobile');await p.setViewportSize({width:1440,height:900});
   await p.unroute('**/account/daily-fortune');await p.getByRole('button',{name:'重新读取',exact:true}).click();await date('2028-03-02');assert.deepEqual(await p.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes('reward'))),storage);
  });
  await scene('旧请求迟到不覆盖新请求，切换账号后旧运势不能落入新账号',async()=>{
   const old=await read(p),entered=gate(),hold=gate();let first=true;
   await p.route('**/account/daily-fortune',async r=>{if(first){first=false;entered.release();await hold.promise;await r.fulfill({json:{...old,date:'旧请求迟到结果'}});}else await r.continue();});
   await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await entered.promise;await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await date('2028-03-02');hold.release();await p.waitForTimeout(150);assert.doesNotMatch(await result(p),/旧请求迟到结果/);await p.unroute('**/account/daily-fortune');
   const entered2=gate(),hold2=gate();first=true;await p.route('**/account/daily-fortune',async r=>{if(first){first=false;entered2.release();await hold2.promise;await r.fulfill({json:{...old,date:'旧账号迟到结果'}});}else await r.continue();});
   await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await entered2.promise;await p.getByRole('button',{name:'退出登录',exact:true}).click();await p.waitForURL('**/login');await login(p,'student_chen');await go('/me');await result(p);hold2.release();await p.waitForTimeout(150);assert.doesNotMatch(await result(p),/旧账号迟到结果/);await p.unroute('**/account/daily-fortune');assert.deepEqual(await read(p),fortuneService.dailyFortune(5,new Date('2028-03-02T00:00:00Z')));await login(p);
  });
  await scene('指定说明行消失，宜/忌、日期、图案保留，桌面平板手机文字无溢出',async()=>{
   await go('/me');await result(p);
   for(const [width,height]of [[1440,900],[768,1024],[390,844]]){await p.setViewportSize({width,height});assert.equal(await p.locator('.fortune-boundary').count(),0);assert.doesNotMatch(await result(p),/轻松看看就好|也不发放积分或奖励/);assert.equal(await p.locator('.fortune-hints span').count(),2);assert.ok(await p.locator('.fortune-hints').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await shot('fortune-'+width);}
  });
  await scene('原十关/空参观/独立实验入口、真实头像保存重读与机器人拖动聊天',async()=>{
   await p.setViewportSize({width:1440,height:900});await go('/courses/'+plan.courseId);await p.locator('.route-node').first().waitFor();assert.equal(await p.locator('.route-node').count(),10);await go(`/courses/${plan.courseId}/lessons/${plan.lessonIds[0]}/learn`);await p.getByText('文章链接待提供',{exact:true}).waitFor();assert.equal(await p.locator('iframe').count(),0);
   await go('/lab');await p.locator('.lab-start-link').click();await p.waitForURL('**/glider');await go('/me');await p.getByRole('button',{name:'选择账号头像',exact:true}).click();await p.getByRole('button',{name:'校园银杏',exact:true}).click();await p.getByText('账号头像已保存',{exact:true}).first().waitFor();await p.keyboard.press('Escape');await p.reload();await p.locator('.account-avatar-trigger img[src*="ginkgo"]').waitFor();assert.equal(db.prepare('SELECT avatar_preset FROM users WHERE id=4').get().avatar_preset,'ginkgo');
   await go('/courses/'+plan.courseId);const robot=p.locator('.course-robot');await robot.waitFor();const box=await robot.boundingBox();await p.mouse.move(box.x+30,box.y+30);await p.mouse.down();await p.mouse.move(400,260,{steps:8});await p.mouse.up();assert.equal(await p.locator('#course-chat').isVisible(),false);const dragged=await robot.boundingBox();await p.evaluate(()=>scrollTo(0,600));assert.ok(Math.abs((await robot.boundingBox()).y-dragged.y)<1);await robot.click();await p.locator('#course-chat').waitFor({state:'visible'});await p.keyboard.press('Escape');
  });
  await scene('全部运势文案可编辑，下载 HTML 保留改稿，JSON 只导出改动且导入不覆盖其他文案',async()=>{
   const review=await browser.newPage();await review.goto('file:///'+path.join(root,'docs/experience-patch/copy-review/今日运势全部词库.html').replaceAll('\\','/'));assert.equal(await review.locator('[data-copy-id]').count(),72);
   await review.locator('[data-copy-id="fortune.good.ask"]').fill('审阅测试：友好提问。');let download=review.waitForEvent('download');await review.locator('#export').click();const json=await download;await json.saveAs(path.join(f.scratch,'copy.json'));const payload=JSON.parse(fs.readFileSync(path.join(f.scratch,'copy.json')));assert.deepEqual(payload.edits.map(e=>e.id),['fortune.good.ask']);const copy=readCopy(path.join(root,'frontend/src/content/uiCopy.jsx')),next=applyPageEdits(copy,payload).next;assert.equal(next['fortune.good.ask'].text,'审阅测试：友好提问。');assert.deepEqual(next['next.map.count'],copy['next.map.count']);
   download=review.waitForEvent('download');await review.locator('#save').click();await(await download).saveAs(path.join(f.scratch,'edited.html'));await review.goto('file:///'+path.join(f.scratch,'edited.html').replaceAll('\\','/'));assert.equal(await review.locator('[data-copy-id="fortune.good.ask"]').innerText(),'审阅测试：友好提问。');await review.screenshot({path:path.join(shots,'copy-review.png'),fullPage:false});await review.close();
  });
  await scene('五尺寸九条相邻路线不进入按钮、图像、文字牌；路径互不相交，前三关主题独立',async()=>{
   for(const [width,height]of [[1440,900],[768,1024],[390,844],[360,800],[844,390]]){
    await p.setViewportSize({width,height});await go('/courses/'+plan.courseId);await p.locator('.route-node').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>[...document.querySelectorAll('.space-place-art')].every(i=>i.complete&&i.naturalWidth>0));await p.waitForTimeout(200);
    const geometry=await p.evaluate(()=>{
     const canvas=document.querySelector('.pixel-map-route-canvas'),bounds=canvas.getBoundingClientRect(),rects=[...canvas.querySelectorAll('.route-node')].map(n=>{const r=n.getBoundingClientRect();return{left:r.left-bounds.left,right:r.right-bounds.left,top:r.top-bounds.top,bottom:r.bottom-bounds.top};});
     const segments=JSON.parse(canvas.querySelector('metadata').textContent),polylines=segments.map(s=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',s.d);const length=path.getTotalLength();return Array.from({length:Math.ceil(length/2)+1},(_,i)=>{const p=path.getPointAtLength(Math.min(i*2,length));return{x:p.x,y:p.y};});});
     const overlaps=[];polylines.forEach((points,i)=>points.forEach(point=>rects.forEach((r,j)=>{if(point.x>r.left-2&&point.x<r.right+2&&point.y>r.top-2&&point.y<r.bottom+2)overlaps.push({segment:i,node:j,point});})));
     const crossings=[];for(let i=0;i<polylines.length;i++)for(let j=i+1;j<polylines.length;j++)if(polylines[i].some(a=>polylines[j].some(b=>Math.hypot(a.x-b.x,a.y-b.y)<3)))crossings.push([i,j]);
     return {segments,rects,overlaps,crossings,width:bounds.width,overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...canvas.querySelectorAll('.space-place-art')].slice(0,3).map(i=>i.currentSrc)};
    });
    fs.writeFileSync(path.join(shots,`geometry-${width}x${height}.json`),JSON.stringify(geometry,null,2));assert.equal(geometry.segments.length,9);assert.deepEqual(geometry.segments.map(s=>[s.from,s.to]),Array.from({length:9},(_,i)=>[String(i+1),String(i+2)]));assert.deepEqual(geometry.overlaps,[]);assert.deepEqual(geometry.crossings,[]);assert.equal(geometry.overflow,false);for(const [i,type]of['vr','theory','experiment'].entries())assert.ok(geometry.images[i].includes('/experience-patch/'+type+'-'));
    await shot(`map-${width}x${height}`);await p.locator('.pixel-map-route-canvas').screenshot({path:path.join(shots,`route-full-${width}x${height}.png`)});
   }
   await p.setViewportSize({width:1440,height:900});const first=p.locator('[data-plan-position="1"] .route-node');await first.focus();await p.keyboard.press('Enter');await p.locator('.space-lesson-modal .ant-modal').waitFor({state:'visible'});await p.keyboard.press('Escape');await p.locator('.space-lesson-modal .ant-modal').waitFor({state:'hidden'});assert.ok(await first.evaluate(n=>n===document.activeElement));await p.locator('[data-plan-position="10"] .route-node').click();assert.equal(await p.locator('.space-lesson-modal a[href*="/learn"]').count(),0);await shot('unknown-node');await p.keyboard.press('Escape');
  });
  await scene('姓名旁原头像入口、头部同步、重登持久；写入失败及回读失败仍可重试',async()=>{
   await go('/me');await p.locator('.space-personal-header h1 .account-avatar-trigger').waitFor();assert.equal(await p.getByRole('button',{name:'更换头像',exact:true}).count(),0);await p.locator('.space-personal-header h1 .account-avatar-trigger').focus();await p.keyboard.press('Enter');await p.getByRole('button',{name:'纸飞机',exact:true}).click();await p.getByText('账号头像已保存',{exact:true}).first().waitFor();await p.keyboard.press('Escape');await p.locator('.space-account img[src*="account-glider"]').waitFor();await p.reload();await p.locator('.account-avatar-trigger img[src*="account-glider"]').waitFor();await p.getByRole('button',{name:'退出登录',exact:true}).click();await login(p);await go('/me');await p.locator('.space-account img[src*="account-glider"]').waitFor();
   const roleBefore=db.prepare('SELECT * FROM course_avatar_preferences WHERE student_id=4').all();
   await p.locator('.account-avatar-trigger').click();await p.route('**/api/account/avatar',r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{error:'隔离头像保存失败'}}):r.continue());await p.getByRole('button',{name:'小机器人',exact:true}).click();await p.getByText('隔离头像保存失败',{exact:true}).first().waitFor();assert.equal(db.prepare('SELECT avatar_preset FROM users WHERE id=4').get().avatar_preset,'glider');await p.unroute('**/api/account/avatar');
   await p.route('**/api/auth/me',r=>r.fulfill({status:503,json:{error:'隔离回读失败'}}));await p.getByRole('button',{name:'小机器人',exact:true}).click();await p.getByText('头像已写入服务器，重新读取失败；请重新检查或重新登录',{exact:true}).first().waitFor();assert.equal(db.prepare('SELECT avatar_preset FROM users WHERE id=4').get().avatar_preset,'robot');await p.unroute('**/api/auth/me');await p.getByRole('button',{name:'重新检查',exact:true}).click();await p.locator('.space-account img[src*="account-robot"]').waitFor();assert.deepEqual(db.prepare('SELECT * FROM course_avatar_preferences WHERE student_id=4').all(),roleBefore);await shot('avatar-inline-and-modal');await p.keyboard.press('Escape');
   await p.route('**/assets/next-version/step-01/web/account-robot-96.webp',r=>r.abort());await p.reload();await p.locator('.account-avatar-trigger img[src*="account-pilot"]').waitFor();await p.locator('.space-account img[src*="account-pilot"]').waitFor();await p.unroute('**/assets/next-version/step-01/web/account-robot-96.webp');await p.reload();await p.locator('.space-account img[src*="account-robot"]').waitFor();
   const beforeOther=db.prepare('SELECT avatar_preset FROM users WHERE id=5').get().avatar_preset,enteredAvatar=gate(),holdAvatar=gate();await p.route('**/api/account/avatar',async r=>{if(r.request().method()==='PUT'){const response=await r.fetch();enteredAvatar.release();await holdAvatar.promise;await r.fulfill({response});}else await r.continue();});await p.locator('.account-avatar-trigger').click();await p.getByRole('button',{name:'小火箭',exact:true}).click();await enteredAvatar.promise;await p.keyboard.press('Escape');await p.getByRole('button',{name:'退出登录',exact:true}).click();await login(p,'student_chen');await go('/me');holdAvatar.release();await p.waitForTimeout(200);assert.equal(db.prepare('SELECT avatar_preset FROM users WHERE id=4').get().avatar_preset,'rocket');assert.equal(db.prepare('SELECT avatar_preset FROM users WHERE id=5').get().avatar_preset,beforeOther);await p.locator('.account-avatar-trigger img[src*="account-'+(beforeOther||'pilot')+'"]').waitFor();assert.equal(await p.locator('.space-account img[src*="account-rocket"]').count(),0);await p.unroute('**/api/account/avatar');
  });
  await scene('多账号连续30日比较真实宜/忌展示文字，同日稳定且候选来自各30条',async()=>{
   const copy=readCopy(path.join(root,'frontend/src/content/uiCopy.jsx')),days=[];
   for(const name of['student_wang','student_chen']){await login(p,name);await go('/me');let previous;for(let i=0;i<30;i++){const time=new Date(Date.UTC(2028,4,1+i)).toISOString();await clock(time);await p.clock.setSystemTime(new Date(time));await p.evaluate(()=>dispatchEvent(new Event('focus')));await date(time.slice(0,10));const dto=await read(p),good=dto.good.map(id=>copy['fortune.good.'+id].text).sort(),avoid=dto.avoid.map(id=>copy['fortune.avoid.'+id].text).sort();const displayed=await result(p);for(const text of[...good,...avoid])assert.ok(displayed.includes(text));if(previous){assert.notDeepEqual(good,previous.good);assert.notDeepEqual(avoid,previous.avoid);assert.ok(good.every(s=>!previous.good.includes(s)));}days.push({name,date:dto.date,good,avoid});previous={good,avoid};}}fs.writeFileSync(path.join(dir,'30-days-displayed.json'),JSON.stringify(days,null,2));
  });
  assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(dir,'browser-'+run+'.json'),JSON.stringify({records,browser:browser.version(),pageErrors:errors,clock:'isolated child IPC + Playwright browser clock; host/production clock unchanged',fixture:'fresh synthetic DB; existing .local/teaching untouched'},null,2));await browser.close();vite.kill();db.close();await stop().catch(()=>server.kill());}
});
