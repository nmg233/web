import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {setup,login,go,gate,base,api} from './helpers/step02.fixture.mjs';
import {root} from './v2-fixture.mjs';

const out=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-screenshots'),'step02-screenshots');
const sizes=[[1440,900],[768,1024],[390,844],[360,800],[844,390]];
const robot=p=>p.locator('.course-robot'),input=p=>p.locator('#assistant-question');
async function open(p){if(!await p.locator('#course-chat').isVisible())await robot(p).click();await input(p).waitFor();}
async function course(p,id=9001){await go(p,`/courses/${id}`);await p.locator(`.space-shell[data-course-space="${id}"]`).waitFor();await p.locator('.route-node').first().waitFor();await robot(p).waitFor();await p.locator('.course-chat-context').getByRole('status').waitFor({state:'hidden'});}
async function shot(p,name,fullPage=false){await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>[...document.images].filter(i=>i.loading!=='lazy').every(i=>i.complete));await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'横向溢出 '+name);await p.screenshot({path:path.join(out,name+'.png'),fullPage,animations:'disabled'});}
async function request(p,url,method='GET',data){return p.evaluate(async({url,method,data,api})=>{const r=await fetch('/api'+url,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return{status:r.status,data:await r.json()};},{url,method,data,api});}
async function send(p,text){await open(p);await input(p).fill(text);await p.locator('.assistant-composer').getByRole('button',{name:'发送问题',exact:true}).click();}

test('第二步：头像、课程浮窗、真实接口与响应式页面',{timeout:420000},async t=>{
 const f=await setup();mkdirSync(out,{recursive:true});const records=[],errors=[];
 const context=await f.browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
 const scenario=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;console.log('FAIL',name,e.message,'PAGE',p.url(),(await p.locator('body').innerText()).slice(0,2500));await p.screenshot({path:path.join(out,'failure.png')});throw e;}});if(failure)throw failure;};
 try{
  await login(p);await course(p);
  await scenario('头像未选中、六人真实保存、重新登录、账号与课程隔离',async()=>{
   const initial=await request(p,'/course-spaces/9001/preferences/avatar');assert.equal(initial.status,200,JSON.stringify(initial));assert.equal(initial.data.avatarId,null);
   await p.getByRole('button',{name:'选择角色头像',exact:true}).click();await p.locator('.course-avatar-grid>button').first().waitFor();assert.equal(await p.locator('.course-avatar-grid>button').count(),6);await shot(p,'avatars-1440');
   await p.locator('.course-avatar-grid>button').filter({hasText:'江予川'}).click();await p.getByRole('status').filter({hasText:'已保存'}).waitFor();assert.equal((await request(p,'/course-spaces/9001/preferences/avatar')).data.avatarId,'maker');await p.locator('.ant-modal-close').click();
   await course(p,9002);assert.equal(await p.locator('.course-avatar-button').count(),0);assert.equal((await request(p,'/course-spaces/9002/preferences/avatar')).status,403);
   assert.equal((await request(p,'/course-spaces/9001/preferences/avatar','PUT',{avatarId:'unknown'})).status,400);
   const another=await f.browser.newContext(),a=await another.newPage();await login(a,'step02_other');await course(a);assert.equal((await request(a,'/course-spaces/9001/preferences/avatar')).data.avatarId,null);await another.close();
   const relog=await f.browser.newContext(),b=await relog.newPage();await login(b);await course(b);await b.locator('.course-avatar-button').getByText('江予川').waitFor();await relog.close();await course(p);
  });
  await scenario('头像写失败与写成功回读失败分开，不自动重复写入',async()=>{
   await p.getByRole('button',{name:'选择角色头像',exact:true}).click();
   await p.route('**/preferences/avatar',async route=>{if(route.request().method()==='PUT')await route.fulfill({status:500,json:{error:'隔离测试：头像保存失败'}});else await route.continue();});
   await p.locator('.course-avatar-grid>button').filter({hasText:'许行舟'}).click();await p.getByRole('status').filter({hasText:'头像保存失败'}).waitFor();assert.equal(f.db.prepare('SELECT avatar_id FROM course_avatar_preferences WHERE student_id=4 AND course_id=9001').get().avatar_id,'maker');await shot(p,'avatars-error');await p.unroute('**/preferences/avatar');
   let writes=0,readFailure=false;await p.route('**/preferences/avatar',async route=>{if(route.request().method()==='PUT'){writes++;readFailure=true;await route.continue();}else if(readFailure)await route.fulfill({status:503,json:{error:'隔离测试：回读失败'}});else await route.continue();});
   await p.locator('.course-avatar-grid>button').filter({hasText:'南容'}).click();await p.getByRole('status').filter({hasText:'最新显示'}).waitFor();assert.equal(writes,1);assert.equal(f.db.prepare('SELECT avatar_id FROM course_avatar_preferences WHERE student_id=4 AND course_id=9001').get().avatar_id,'guardian');await shot(p,'avatars-readback-error');await p.unroute('**/preferences/avatar');await p.getByRole('button',{name:'重新读取头像',exact:true}).click();await p.locator('.course-avatar-grid>button[aria-pressed=true]').filter({hasText:'南容'}).waitFor();await p.locator('.ant-modal-close').click();
  });
  await scenario('同课程切页保留草稿、关窗继续请求、单次问答与不重复发送',async()=>{
   await open(p);await input(p).fill('暂未发送的观察记录');
   for(const url of ['/courses/9001/lessons/90011/learn?stage=0','/courses/9001/lab','/courses/9001/archives','/courses/9001/works','/courses/9001']){await go(p,url);await input(p).waitFor();assert.equal(await input(p).inputValue(),'暂未发送的观察记录');}
   const hold=gate(),entered=gate();f.provider.next={hold,entered};const before=f.provider.requests.length;await send(p,'如何比较实验中的观察条件？');await entered.promise;await input(p).fill('下一条草稿');await input(p).press('Enter');assert.equal(f.provider.requests.length,before+1);await p.getByRole('button',{name:'收起对话',exact:true}).click();hold.release();await p.locator('.course-chat-unread').waitFor();assert.equal(await p.locator('#course-chat').isVisible(),false);await open(p);await p.getByText('【本地测试服务回复】',{exact:false}).waitFor();assert.equal(await input(p).inputValue(),'下一条草稿');assert.equal(f.provider.requests.length,before+1);assert.equal(f.provider.requests.at(-1).messages.length,3);assert.ok(!f.provider.requests.at(-1).messages[2].content.includes('下一条草稿'));await shot(p,'chat-1440');
  });
  await scenario('服务错误保留原问题和新草稿，资料变更清旧引用',async()=>{
   const hold=gate(),entered=gate();f.provider.next={hold,entered,status:500};await send(p,'我想核对实验记录');await entered.promise;await input(p).fill('后续输入不能被覆盖');hold.release();await p.locator('.assistant-failure').last().waitFor();assert.equal(await input(p).inputValue(),'后续输入不能被覆盖');assert.ok(await p.locator('.assistant-failure').last().getByRole('button').isDisabled());await shot(p,'chat-service-error');
   await input(p).fill('');await p.locator('.assistant-failure').last().getByRole('button').click();assert.equal(await input(p).inputValue(),'我想核对实验记录');
   const h=gate(),e=gate();f.provider.next={hold:h,entered:e};await send(p,'怎样比较知识卡片的条件？');await e.promise;f.db.prepare("UPDATE courses SET description=description||'（隔离测试资料改版）' WHERE id=9001").run();h.release();await p.locator('.assistant-failure').last().waitFor();await p.getByText('课程资料已有变化',{exact:false}).waitFor();assert.equal(await p.locator('.assistant-answer .assistant-sources').count(),0);await shot(p,'chat-content-changed');
  });
  await scenario('中文输入法 Enter 不发送，Shift Enter 换行；真实 JWT 轮换保输入',async()=>{
   const before=f.provider.requests.length;await input(p).fill('中文输入尚未确认');await input(p).evaluate(e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true})));await input(p).press('Shift+Enter');assert.equal(f.provider.requests.length,before);assert.ok((await input(p).inputValue()).includes('\n'));
   const old=await p.evaluate(()=>localStorage.getItem('token'));const refresh=await p.evaluate(()=>localStorage.getItem('refresh_token'));
   const rotated=await fetch(api+'/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh})});assert.equal(rotated.status,200);const data=await rotated.json();
   const saved=await input(p).inputValue();await p.evaluate(async data=>{const m=await import('/src/utils/authSession.js');m.saveAuthSession(()=>localStorage,data,'rotation');},data);assert.equal(await input(p).inputValue(),saved);assert.notEqual(await p.evaluate(()=>localStorage.getItem('refresh_token')),refresh);await go(p,'/courses/9001/lab');assert.equal(await input(p).inputValue(),saved);assert.ok(old);
  });
  await scenario('旧消息滚动不抢位置，最新回复可定位',async()=>{
   f.provider.next={answer:'【本地测试服务回复】'+('观察自己的证据，记录条件。\n'.repeat(70))};await send(p,'查看较长的实验分析');await p.locator('.assistant-answer').last().getByText('观察自己的证据',{exact:false}).waitFor();await p.locator('.assistant-reader').evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});
   await p.getByRole('button',{name:'收起对话',exact:true}).click();f.provider.next={empty:true};const h=gate(),e=gate();f.provider.next={hold:h,entered:e};await open(p);await input(p).fill('最后一条观察');await p.locator('.assistant-composer button').click();await e.promise;await p.locator('.assistant-reader').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});h.release();await p.getByRole('button',{name:'查看最新回复'}).waitFor();assert.ok(await p.locator('.assistant-reader').evaluate(e=>e.scrollTop<5));await p.getByRole('button',{name:'查看最新回复'}).click();assert.ok(await p.locator('.assistant-reader').evaluate(e=>e.scrollTop>200));
  });
  await scenario('课程引用只生成当前课程站内动作，不执行回答 HTML',async()=>{
   f.provider.next={answer:'【本地测试服务回复】<img src=x onerror=alert(1)> 请核对自己的资料。'};await send(p,'测试课程有哪些实验任务？');await p.locator('.assistant-answer').last().getByText('<img src=x',{exact:false}).waitFor();assert.equal(await p.locator('.assistant-answer img').count(),0);
   for(const a of await p.locator('.assistant-answer').last().locator('a[href]').all()){const href=await a.getAttribute('href');assert.ok(href.startsWith('/courses/9001'),href);}
   await shot(p,'chat-sources');
  });
  await scenario('两课切换清会话，迟到旧响应不进入新课；平台不出现机器人',async()=>{
   const h=gate(),e=gate();f.provider.next={hold:h,entered:e,answer:'旧课程迟到回复不可见'};await send(p,'旧课待响应问题');await e.promise;await course(p,9002);h.release();await open(p);assert.equal(await p.locator('.assistant-turn').count(),0);assert.equal(await input(p).inputValue(),'');await go(p,'/me');await robot(p).waitFor({state:'detached'});await go(p,'/explore');assert.equal(await robot(p).count(),0);await course(p);
  });
  await scenario('真实课程撤回清会话，恢复重新检查不恢复旧回答',async()=>{
   await send(p,'撤回前的课程问题');await p.locator('.assistant-answer').waitFor();await input(p).fill('撤回前未发内容');f.db.prepare("UPDATE courses SET status='draft' WHERE id=9001").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByRole('button',{name:'重新检查',exact:true}).waitFor();assert.equal(await robot(p).count(),0);assert.equal(await p.locator('.assistant-turn').count(),0);await shot(p,'course-withdrawn');f.db.prepare("UPDATE courses SET status='published' WHERE id=9001").run();await p.getByRole('button',{name:'重新检查',exact:true}).click();await robot(p).waitFor();await open(p);assert.equal(await p.locator('.assistant-turn').count(),0);assert.equal(await input(p).inputValue(),'');
  });
  await scenario('未启用和目录错误展示真实状态，恢复后可提问',async()=>{
   // 沿用真实每账号每分钟 8 次限额，不放宽后端规则或改测试时钟。
   await p.waitForTimeout(30000);await p.waitForTimeout(31000);
   f.db.prepare('UPDATE ai_settings SET enabled=0 WHERE id=1').run();await go(p,'/explore');await course(p);await open(p);await p.getByText('暂未启用',{exact:false}).waitFor();await input(p).fill('未启用不能发送');assert.ok(await p.locator('.assistant-composer button').isDisabled());await shot(p,'chat-disabled');f.db.prepare('UPDATE ai_settings SET enabled=1 WHERE id=1').run();
   await go(p,'/explore');await p.route('**/course-spaces/9001/dashboard/ai/courses',r=>r.fulfill({status:503,json:{error:'隔离测试：目录读取失败'}}));await course(p);await open(p);await p.locator('#course-chat').getByText('目录读取失败',{exact:false}).waitFor();await shot(p,'chat-catalog-error');await p.unroute('**/course-spaces/9001/dashboard/ai/courses');await p.getByRole('button',{name:'重新读取课程',exact:true}).click();await p.locator('#course-chat').getByText('目录读取失败',{exact:false}).waitFor({state:'hidden'});await send(p,'恢复后读取资料');await p.locator('.assistant-answer').waitFor();
  });
  await scenario('旧助手链接 replace 打开一次，不回到中转页；后台入口保留',async()=>{
   await go(p,'/courses/9001/assistant');await p.waitForURL(u=>u.pathname==='/courses/9001'&&!u.search.includes('openAssistant'));await input(p).waitFor();await p.getByRole('button',{name:'收起对话',exact:true}).click();await go(p,'/courses/9001/lab');await p.goBack();await p.locator('[data-course-pathname="/courses/9001"]').waitFor();await p.locator('#course-chat').waitFor({state:'hidden'});assert.equal(await p.locator('#course-chat').isVisible(),false);
   await go(p,'/dashboard/ai?course_id=9001');await p.waitForURL(u=>u.pathname==='/courses/9001'&&!u.search.includes('openAssistant'));await input(p).waitFor();
   const c=await f.browser.newContext(),s=await c.newPage();await login(s,'mentor_zhang','mentor123');await go(s,'/dashboard/ai');await s.getByText('灵境小智',{exact:false}).first().waitFor();assert.equal(await robot(s).count(),0);await c.close();
  });
  await scenario('五尺寸课程页面、窗口遮罩、焦点、互斥和键盘高度',async()=>{
   await p.getByRole('button',{name:'收起对话',exact:true}).click();
   for(const [width,height] of sizes){await p.setViewportSize({width,height});for(const [name,url,selector] of [['learning','/courses/9001/lessons/90011/learn?stage=0','.study-section'],['works','/courses/9001/works','.study-header'],['work-detail','/courses/9001/works/9001','.study-header'],['work-upload','/courses/9001/works/upload?task_id=9002&parent_work_id=9001','.study-header'],['lab','/courses/9001/lab','.lab-experiment'],['flight','/courses/9001/glider','.study-header'],['archive','/courses/9001/archives','.archive-overview'],['reflection','/courses/9001/reflection','.study-header']]){await go(p,url);await p.locator(selector).first().waitFor();await shot(p,`${name}-${width}`,width===1440||width===390);assert.equal(await robot(p).count(),1);}
    await open(p);assert.equal(await input(p).evaluate(e=>e===document.activeElement),true);await p.locator('#course-chat h2').click();assert.ok(await p.locator('#course-chat').isVisible());await shot(p,`chat-${width}`);
    if(width<768||height<450){assert.equal(await p.locator('#course-chat').getAttribute('aria-modal'),'true');assert.equal(await p.evaluate(()=>document.body.style.overflow),'hidden');await p.locator('#course-chat header button').focus();await p.keyboard.press('Shift+Tab');assert.ok(await p.locator('#course-chat').evaluate(e=>e.contains(document.activeElement)));await p.locator('.course-chat-mask').click({position:{x:1,y:1}});assert.equal(await p.locator('#course-chat').isVisible(),false);assert.notEqual(await p.evaluate(()=>document.body.style.overflow),'hidden');await open(p);}
    await p.keyboard.press('Escape');assert.equal(await p.locator('#course-chat').isVisible(),false);assert.ok(await robot(p).evaluate(e=>e===document.activeElement));assert.ok(await p.locator('.course-avatar-button>.pixel-image,.course-avatar-button>.pixel-icon').isVisible());records.push({width,height,overflow:false,chatFocus:true,avatarThumbnailVisible:true});
   }
   await p.setViewportSize({width:390,height:440});await open(p);const b=await input(p).boundingBox();assert.ok(b.y+b.height<=440);await shot(p,'chat-keyboard-height');await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:900});await course(p);await open(p);await p.getByRole('button',{name:'选择角色头像',exact:true}).click();await p.locator('.course-avatar-grid').waitFor();assert.equal(await p.locator('#course-chat').isVisible(),false);await p.locator('.ant-modal-close').click();
  });
  await scenario('停用、强制改密、退出和换账号清机器人上下文',async()=>{
   await p.setViewportSize({width:1440,height:900});await open(p);await input(p).fill('强制改密前草稿');f.db.prepare('UPDATE users SET force_reset_password=1 WHERE id=4').run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForURL(/change-password/);assert.equal(await robot(p).count(),0);f.db.prepare('UPDATE users SET force_reset_password=0 WHERE id=4').run();await login(p);await course(p);await open(p);assert.equal(await input(p).inputValue(),'');
   f.db.prepare('UPDATE users SET is_active=0 WHERE id=4').run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForURL(/login/);assert.equal(await robot(p).count(),0);f.db.prepare('UPDATE users SET is_active=1 WHERE id=4').run();await login(p);await course(p);await open(p);await input(p).fill('退出前草稿');await p.keyboard.press('Escape');await go(p,'/me');await p.getByRole('button',{name:'退出登录',exact:true}).click();await p.waitForURL(/login/);await login(p,'step02_other');await course(p);await open(p);assert.equal(await input(p).inputValue(),'');assert.equal(await p.locator('.assistant-turn').count(),0);
  });
  assert.deepEqual(errors,[]);writeFileSync(path.join(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-evidence'),'step02-browser-details.json'),JSON.stringify({browser:await f.browser.version(),viewports:records,provider:'真实 AI 接口＋隔离 HTTPS 本地测试 provider；未验证外部模型质量',providerRequests:f.provider.requests.length,pageErrors:errors},null,2));
 }finally{await f.close();}
});
