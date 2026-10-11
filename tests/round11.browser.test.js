import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { setup, root, base, gate, jsonError, go, login, logout, choose, rotate } from './helpers/round11.fixture.js';
const shots=path.join(root,process.env.ROUND11_CAPTURE_DELIVERY==='1'?'docs/round-11/screenshots':'test-results/round11');
const sizes=[[1440,900,'desktop'],[768,1024,'tablet'],[390,844,'mobile']];
const question=p=>p.getByLabel('我想问',{exact:true});
const send=p=>p.getByRole('button',{name:'发送问题',exact:true});
const answer=p=>p.locator('.assistant-answer');
async function ask(p,text='比较月球环境证据，课程任务有什么要求？'){await question(p).fill(text);await send(p).click();}
async function ai(p,query='?course_id=1'){await go(p,'/dashboard/ai'+query);await p.locator('.assistant-context').waitFor();await p.getByText('正在读取可提问课程…',{exact:true}).waitFor({state:'hidden'});}
async function overflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');}
async function screenshot(p,name,fullPage=false){await p.locator('.ant-message-notice').last().waitFor({state:'hidden',timeout:10000});await p.evaluate(()=>document.fonts.ready);await overflow(p);await p.screenshot({path:path.join(shots,name+'.png'),animations:'disabled',fullPage});}
async function captureSizes(p,name){for(const[width,height,label]of sizes){await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));if(width<1000&&name==='01-ai')await p.locator('.assistant-workbench').evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-84));if(width<1000&&name==='04-course-review')await p.locator('.review-replays').evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-84));await screenshot(p,name+'-'+label,false);}await p.setViewportSize({width:1440,height:900});}
async function visible(p,locator){await locator.scrollIntoViewIfNeeded();assert.ok(await locator.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=60&&r.bottom<=innerHeight&&(hit===el||el.contains(hit));}),'action not covered by shell/partner');await overflow(p);}

test('第十一轮：小智、任务兼容、资料回看及真实双标签回归',{timeout:600000},async t=>{
 mkdirSync(shots,{recursive:true});const f=await setup();const{db,browser,provider}=f;
 console.log('Browser:',browser.version());
 const withStudent=async(fn,username)=>{const user=username?{username,id:4}:f.makeUser();const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true}),p=await c.newPage();p.setDefaultTimeout(8000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{await login(p,user.username);await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();await fn(p,c,user);assert.deepEqual(errors,[],'no page errors');}
  catch(error){console.error((await p.locator('body').innerText().catch(()=>'' )).slice(0,2200));await p.screenshot({path:path.join(shots,'failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally{await c.close();}
 };
 const scenario=async(name,fn)=>{if(process.env.ROUND11_CASE&&!name.includes(process.env.ROUND11_CASE))return;let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 try{
 await scenario('小智课程：加载、失败重读、明确停用、无课程、有效/无效参数',()=>withStudent(async(p,c,user)=>{
  const hold=gate(),entered=gate();await p.route('**/api/dashboard/ai/courses',async r=>{entered.release();await hold.promise;await r.continue().catch(()=>{});});
  try{await go(p,'/dashboard/ai?course_id=1');await entered.promise;await p.getByText('正在读取可提问课程…',{exact:true}).waitFor();assert.equal(await p.getByText('灵境小智暂未启用',{exact:true}).count(),0);hold.release();await p.getByRole('link',{name:'打开当前课程地图 →'}).waitFor();}finally{hold.release();await p.unroute('**/api/dashboard/ai/courses');}
  await p.route('**/api/dashboard/ai/courses',r=>jsonError(r,503,'【测试】可提问课程暂时无法读取'));await ai(p,'?course_id=999');await p.getByText('可提问课程读取失败',{exact:true}).waitFor();assert.equal(await p.getByText('灵境小智暂未启用',{exact:true}).count(),0);await screenshot(p,'05-ai-catalog-error');await p.unroute('**/api/dashboard/ai/courses');await p.getByRole('button',{name:'重新读取课程',exact:true}).click();await p.getByText(/链接中的课程不可用于提问/).waitFor();assert.equal(await p.getByRole('link',{name:'打开当前课程地图 →'}).count(),0);
  db.prepare('UPDATE ai_settings SET enabled=0').run();try{await ai(p,'?course_id=2');await p.getByText('灵境小智暂未启用',{exact:true}).waitFor();assert.equal(await send(p).isDisabled(),true);}finally{db.prepare('UPDATE ai_settings SET enabled=1').run();}
  db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=?").run(user.id);await ai(p,'');await p.getByText(/暂无可提问课程/).waitFor();assert.equal(await send(p).isDisabled(),true);
 }));
 await scenario('真实 HTTPS provider：安全长文本、真实五类来源、附件局部失败及三尺寸',()=>withStudent(async p=>{
  await ai(p);provider.next={answer:'【本地测试服务回复】\n先检查自己的观察条件，再比较证据。\n<script>window.round11Unsafe=true</script>\n'+('观察证据与边界条件。'.repeat(35))+'\n'+('LongUnbrokenWord'.repeat(40))};
  let body; p.on('request',r=>{if(r.url().endsWith('/dashboard/ai/ask'))body=r.postDataJSON();});await ask(p);await answer(p).waitFor();assert.deepEqual(Object.keys(body).sort(),['course_id','question']);assert.equal(await p.evaluate(()=>window.round11Unsafe),undefined);
  assert.match(await answer(p).innerText(),/课程相关/);assert.equal(await p.getByRole('link',{name:/查看任务：任务：月球环境调研/}).getAttribute('href'),'/tasks/1');assert.equal(await p.getByRole('link',{name:/查看课程地图：知识卡片/}).getAttribute('href'),'/courses/1');
  const download=p.getByRole('button',{name:/下载：月球环境证据记录/});await download.waitFor();await p.route('**/api/courses/resources/1/download',r=>jsonError(r,404,'【测试】附件文件不存在'));await download.click();await p.getByText('这份资料暂时无法下载',{exact:true}).waitFor();assert.equal(await answer(p).count(),1);await screenshot(p,'06-ai-attachment-error',true);
  await p.unroute('**/api/courses/resources/1/download');await p.evaluate(()=>{window.createdUrls=[];window.releasedUrls=[];const a=URL.createObjectURL.bind(URL),b=URL.revokeObjectURL.bind(URL);URL.createObjectURL=x=>{const u=a(x);createdUrls.push(u);return u;};URL.revokeObjectURL=u=>{releasedUrls.push(u);b(u);};});
  const saved=p.waitForEvent('download');await p.getByRole('button',{name:/重试下载：月球环境证据记录/}).click();await saved;assert.deepEqual(await p.evaluate(()=>[createdUrls.length,releasedUrls.length]),[1,1]);
  await choose(p,'当前课程','· 课程 2');await choose(p,'当前课程','· 课程 1');await ask(p);await answer(p).waitFor();await p.locator('.assistant-reader').evaluate(el=>el.scrollTop=0);await question(p).fill('【测试】如何判断记录中的证据是否充分？');await captureSizes(p,'01-ai');
  await p.setViewportSize({width:390,height:480});await visible(p,send(p));await screenshot(p,'07-ai-short-viewport');
  await p.setViewportSize({width:1440,height:900});const before=provider.requests.length;await go(p,'/explore');await ai(p);assert.equal(await answer(p).count(),0);assert.equal(provider.requests.length,before);assert.equal(await question(p).inputValue(),'');
 }));
 await scenario('小智输入：空白、1000 字、IME Enter、快速重复、非流式等待',()=>withStudent(async p=>{
  await ai(p);const initialRequests=provider.requests.length;await question(p).fill('   ');assert.equal(await send(p).isDisabled(),true);
  await question(p).fill('月'.repeat(1001));assert.equal((await question(p).inputValue()).length,1000);await question(p).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.equal(provider.requests.length,initialRequests);
  const hold=gate(),entered=gate();provider.next={hold,entered};const before=provider.requests.length;
  try{await send(p).evaluate(el=>{el.click();el.click();});await entered.promise;await p.getByText('正在等待服务回复，请稍候…',{exact:true}).waitFor();assert.equal(provider.requests.length,before+1);await question(p).fill('【测试】等待期间准备的新问题');hold.release();await answer(p).waitFor();assert.equal(await question(p).inputValue(),'【测试】等待期间准备的新问题');assert.equal(provider.requests.at(-1).messages.length,3);}finally{hold.release();}
 }));
 await scenario('小智服务错误：忙碌/额度/密钥、主动恢复与后输入不被覆盖',()=>withStudent(async p=>{
  await ai(p);
  for(const[status,text]of[[429,'AI 服务繁忙'],[402,'AI 服务额度不足'],[401,'AI 服务密钥无效']]){
   provider.next={status};await ask(p,'月球环境证据如何比较？');await p.locator('.assistant-failure').last().getByText(new RegExp(text)).waitFor();assert.equal(await answer(p).count(),0);const before=provider.requests.length;await p.getByRole('button',{name:'将原问题放回输入框',exact:true}).last().click();assert.equal(await question(p).inputValue(),'月球环境证据如何比较？');assert.equal(provider.requests.length,before);
  }
  const hold=gate(),entered=gate();provider.next={status:429,hold,entered};try{await send(p).click();await entered.promise;await question(p).fill('新草稿不得丢失');hold.release();await p.locator('.assistant-failure').nth(3).waitFor();assert.equal(await question(p).inputValue(),'新草稿不得丢失');await screenshot(p,'08-ai-retry-keeps-draft',true);}finally{hold.release();}
  await ask(p,'月球环境证据要求？');await answer(p).waitFor();assert.equal(await answer(p).count(),1);
 }));
 await scenario('真实 scope、无来源、资料变更返回 AI_CONTEXT_CHANGED',()=>withStudent(async p=>{
  await ai(p);provider.next={scope:'extension',empty:true};await ask(p);await answer(p).getByText('课程拓展',{exact:true}).waitFor();assert.equal(await p.locator('.assistant-sources').count(),0);
  provider.next={scope:'unrelated',empty:true};await ask(p,'与课程无关的问题');await p.getByText('问题范围说明',{exact:true}).waitFor();assert.match(await answer(p).last().innerText(),/我是课程 AI 助手/);
  const hold=gate(),entered=gate();provider.next={hold,entered};const original=db.prepare('SELECT description FROM courses WHERE id=1').get().description;
  try{await ask(p);await entered.promise;db.prepare('UPDATE courses SET description=? WHERE id=1').run(original+' 测试更新');hold.release();await p.locator('.assistant-failure').getByText('课程资料已更新或停用，请重新提问',{exact:true}).waitFor();assert.equal(await answer(p).count(),2);assert.equal(await p.locator('.assistant-sources').count(),0);}finally{hold.release();db.prepare('UPDATE courses SET description=? WHERE id=1').run(original);}
 }));
 await scenario('课程集合真实变化：新增、无关移除保留聊天，当前移除清引用并拒绝迟到回答',()=>withStudent(async(p,c,user)=>{
  await ai(p);await ask(p);await answer(p).waitFor();await question(p).fill('仍在编辑的文字');
  db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=? AND course_id=2").run(user.id);await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForResponse(r=>r.url().endsWith('/dashboard/ai/courses'));assert.equal(await answer(p).count(),1);assert.equal(await question(p).inputValue(),'仍在编辑的文字');
  db.prepare("UPDATE enrollments SET status='active' WHERE student_id=? AND course_id=2").run(user.id);const refreshed=p.waitForResponse(r=>r.url().endsWith('/dashboard/ai/courses'));await p.evaluate(()=>dispatchEvent(new Event('focus')));await refreshed;await p.getByRole('combobox',{name:'当前课程'}).click();await p.getByText('· 课程 2',{exact:true}).waitFor();await p.keyboard.press('Escape');
  const hold=gate(),entered=gate();provider.next={hold,entered};try{await ask(p);await entered.promise;await question(p).fill('保留未发送的新问题');db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=? AND course_id=1").run(user.id);await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByText(/当前课程已不可访问，已清除/).waitFor();assert.equal(await answer(p).count(),0);const completed=p.waitForResponse(r=>r.url().endsWith('/dashboard/ai/ask'));hold.release();await completed;assert.equal(await answer(p).count(),0);assert.equal(await question(p).inputValue(),'保留未发送的新问题');await screenshot(p,'09-ai-course-removed',true);}finally{hold.release();}
 }));
 await scenario('任务：四筛选、报告通过作品退回、同名课程、无任务课时、三尺寸',()=>withStudent(async p=>{
  await go(p,'/tasks');await p.locator('.compat-task-row').first().waitFor();assert.equal(await p.locator('.compat-task-group').count(),2);
  const row=p.locator('.compat-task-row').filter({hasText:'月球环境调研'});await row.getByText('报告：已通过',{exact:true}).waitFor();await row.getByRole('link',{name:'修改作品',exact:true}).waitFor();await row.getByText('学习已完成',{exact:true}).waitFor();assert.match(await row.innerText(),/2026-11-03 09:30/);
  assert.equal(await p.getByRole('link',{name:'修改报告',exact:true}).getAttribute('href'),'/courses/1/lessons/2/learn?stage=2');await captureSizes(p,'02-tasks');
  for(const label of['待完成','进行中','待导师评审','学习已完成']){await choose(p,'按学习状态筛选',label);await p.locator('.compat-task-row').first().waitFor();for(const tag of await p.locator('.compat-task-heading .pixel-tag').allTextContents())assert.equal(tag,label);}
  await choose(p,'按学习状态筛选','全部任务');await p.locator('.compat-task-row').first().waitFor();await go(p,'/courses/1');await p.getByText('无作品任务的观察课（测试）',{exact:true}).first().waitFor();
 },'student_wang'));
 await scenario('任务：缺失进度、空态、筛选晚到、失败重试及撤回清范围',()=>withStudent(async p=>{
  await p.route('**/api/tasks',async r=>{const response=await r.fetch(),data=await response.json();data.tasks[0].learning_progress=null;await r.fulfill({response,json:data});});await go(p,'/tasks');await p.getByText('暂未提供',{exact:true}).first().waitFor();await p.unroute('**/api/tasks');
  const hold=gate(),entered=gate();await p.route('**/api/tasks?status=pending',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});try{await choose(p,'按学习状态筛选','待完成');await entered.promise;await choose(p,'按学习状态筛选','学习已完成');await p.getByText(/这个学习状态下暂无任务/).waitFor();hold.release();await p.waitForLoadState('networkidle');assert.equal(await p.locator('.compat-task-row').count(),0);}finally{hold.release();await p.unroute('**/api/tasks?status=pending');}
  await p.route('**/api/tasks',r=>jsonError(r,503,'【测试】任务暂不可读'));await choose(p,'按学习状态筛选','全部任务');await p.getByText('课后任务暂时无法读取',{exact:true}).waitFor();await p.unroute('**/api/tasks');await p.getByRole('button',{name:'重新读取',exact:true}).click();await p.locator('.compat-task-row').first().waitFor();
  db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();try{await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.locator('.compat-task-group[data-course-id="1"]').waitFor({state:'hidden'});await p.locator('.compat-task-group[data-course-id="2"]').waitFor();}finally{db.prepare("UPDATE courses SET status='published' WHERE id=1").run();}
 }));
 await scenario('任务详情：加载/重试三尺寸、replace、不可访问与离页迟到',()=>withStudent(async p=>{
  await p.route('**/api/tasks/1',r=>jsonError(r,503,'【测试】任务网络临时失败'));await go(p,'/tasks/1');await p.getByText('任务暂时无法读取',{exact:true}).waitFor();await captureSizes(p,'03-task-redirect');await p.unroute('**/api/tasks/1');await p.getByRole('button',{name:'重新读取任务',exact:true}).click();await p.waitForURL('**/courses/1/lessons/1/learn');await p.goBack();assert.notEqual(new URL(p.url()).pathname,'/tasks/1');
  await go(p,'/tasks/99999');await p.getByText(/任务不存在|当前内容已不可访问/).first().waitFor();assert.equal(await p.locator('.study-workspace').count(),0);
  const hold=gate(),entered=gate();await p.route('**/api/tasks/1',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});try{await go(p,'/tasks/1');await entered.promise;await p.getByText('正在核对任务…',{exact:true}).waitFor();await go(p,'/tasks');await p.locator('.compat-task-row').first().waitFor();hold.release();await p.waitForLoadState('networkidle');assert.equal(new URL(p.url()).pathname,'/tasks');}finally{hold.release();}
 }));
 await scenario('课程资料：真实五区、历史已修改/最新退回、授权下载、原生视频三尺寸',()=>withStudent(async p=>{
  await go(p,'/courses/1/learn');await p.locator('.review-replay-list button').first().waitFor();await p.getByText('已修改',{exact:true}).waitFor();await p.getByText('需修改',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:/下载：/}).count(),1);assert.equal(await p.getByText('这份资料暂未提供文件。',{exact:true}).count(),2);
  await p.locator('.review-replay-list button').first().click();await p.locator('video').waitFor();await p.locator('video').evaluate(async el=>{await Promise.race([el.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('media play timeout: ready='+el.readyState+', network='+el.networkState+', error='+el.error?.code)),6000))]);});await p.waitForFunction(()=>document.querySelector('video')?.currentTime>0.2);await p.locator('video').evaluate(el=>el.pause());
  await captureSizes(p,'04-course-review');await p.evaluate(()=>scrollTo(0,0));await screenshot(p,'14-review-overview',true);assert.equal(await p.locator('.review-replay-list li').nth(1).innerText().then(t=>/0 分/.test(t)),false);
  const downloaded=p.waitForEvent('download');await p.getByRole('button',{name:/下载：/}).click();await downloaded;
 },'student_wang'));
 await scenario('回放/作品单区 503 与附件 404：其他区保留、局部重试',()=>withStudent(async p=>{
  await p.route('**/api/courses/1/replays',r=>jsonError(r,503,'【测试】回放读取失败'));await p.route('**/api/works?course_id=1',r=>jsonError(r,503,'【测试】提交记录读取失败'));
  await go(p,'/courses/1/learn');await p.locator('.review-replays').getByText('课程回放暂时无法读取',{exact:true}).waitFor();await p.locator('.review-works').getByText('提交记录暂时无法读取',{exact:true}).waitFor();await p.getByRole('heading',{name:'课堂资料',exact:true}).waitFor();await screenshot(p,'10-review-local-errors',true);
  await p.unroute('**/api/courses/1/replays');await p.locator('.review-replays').getByRole('button',{name:'重新读取',exact:true}).click();await p.locator('.review-replay-list button').first().waitFor();await p.unroute('**/api/works?course_id=1');await p.locator('.review-works').getByRole('button',{name:'重新读取',exact:true}).click();await p.locator('.review-works').getByText('本课程还没有作品提交记录。',{exact:true}).waitFor();
  await p.route('**/api/courses/resources/1/download',r=>jsonError(r,404,'【测试】附件不存在'));await p.getByRole('button',{name:/下载：/}).click();await p.getByText('这份资料暂时无法下载',{exact:true}).waitFor();await p.waitForLoadState('networkidle');assert.equal(await p.locator('.review-summary').count(),1);assert.equal(await p.locator('.review-replay-list button').count(),2);
 }));
 await scenario('回放：A→B 迟到、同 ID 重取、取址失败、媒体错误/过期主动恢复',()=>withStudent(async p=>{
  await go(p,'/courses/1/learn');await p.locator('.review-replay-list button').first().waitFor();
  const hold=gate(),entered=gate();await p.route('**/api/courses/replays/1/stream-url',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
  try{await p.locator('.review-replay-list button').first().click();await entered.promise;await p.locator('.review-replay-list button').nth(1).click();await p.locator('video').waitFor();hold.release();await p.waitForLoadState('networkidle');assert.match(await p.locator('video').getAttribute('aria-label'),/回放 B/);assert.equal(await p.locator('video').evaluate(el=>new URL(el.src).pathname),'/api/courses/replays/2/stream');}finally{hold.release();await p.unroute('**/api/courses/replays/1/stream-url');}
  await p.route('**/api/courses/replays/2/stream-url',r=>jsonError(r,503,'【测试】暂时无法取址'));await p.getByRole('button',{name:'重新获取播放地址',exact:true}).click();await p.getByText('本段回放暂不可用',{exact:true}).waitFor();assert.equal(await p.locator('video').count(),0);await p.unroute('**/api/courses/replays/2/stream-url');
  await p.route('**/api/courses/replays/2/stream?*',r=>jsonError(r,401,'【测试】播放地址过期'));await p.getByRole('button',{name:'重新获取播放地址',exact:true}).click();await p.getByText('本段回放暂不可用',{exact:true}).waitFor();await screenshot(p,'11-replay-media-error',true);await p.unroute('**/api/courses/replays/2/stream?*');await p.getByRole('button',{name:'重新获取播放地址',exact:true}).click();await p.locator('video').waitFor();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  const retryHold=gate(),retryEntered=gate();let calls=0;await p.route('**/api/courses/replays/2/stream-url',async r=>{const response=await r.fetch();if(++calls===1){retryEntered.release();await retryHold.promise;await r.fulfill({response,json:{url:'/invalid',expires_in:600}}).catch(()=>{});}else await r.fulfill({response});});
  try{await p.getByRole('button',{name:'重新获取播放地址',exact:true}).click();await retryEntered.promise;await p.locator('.review-replay-list button').nth(1).click();await p.locator('video').waitFor();retryHold.release();await p.waitForLoadState('networkidle');assert.equal(await p.locator('video').count(),1);assert.equal(await p.getByText('本段回放暂不可用',{exact:true}).count(),0);}finally{retryHold.release();}
  await p.locator('video').evaluate(el=>window.oldVideo=el);await go(p,'/tasks');await p.locator('.compat-task-row').first().waitFor();assert.deepEqual(await p.evaluate(()=>[oldVideo.paused,oldVideo.hasAttribute('src')]),[true,false]);
 }));
 await scenario('真实撤回清媒体/作品；主课程 400 和 503 不发布旧内容',()=>withStudent(async p=>{
  await go(p,'/courses/1/learn');await p.getByText('已修改',{exact:true}).waitFor();await p.locator('.review-replay-list button').first().click();await p.locator('video').waitFor();await p.locator('video').evaluate(el=>window.revokedVideo=el);
  db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();try{await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByText('当前内容已不可访问',{exact:true}).waitFor();assert.equal(await p.locator('.review-works,video').count(),0);assert.deepEqual(await p.evaluate(()=>[revokedVideo.paused,revokedVideo.hasAttribute('src')]),[true,false]);await screenshot(p,'12-review-course-revoked');}finally{db.prepare("UPDATE courses SET status='published' WHERE id=1").run();}
  await p.route('**/api/courses/1',r=>jsonError(r,400,'课程不存在'));await p.goto(base+'/courses/1/learn');await p.getByText('课程不存在或已不可访问',{exact:true}).waitFor();assert.equal(await p.locator('.review-works').count(),0);await p.unroute('**/api/courses/1');await p.route('**/api/courses/1',r=>jsonError(r,503,'【测试】课程临时网络错误'));await p.getByRole('button',{name:'重新读取课程',exact:true}).click();await p.getByText('课程暂时无法读取',{exact:true}).waitFor();await p.unroute('**/api/courses/1');await p.getByRole('button',{name:'重新读取课程',exact:true}).click();await p.locator('.review-works').waitFor();
 },'student_wang'));
 await scenario('真实跨标签 refresh：小智草稿/聊天/在途回复、任务筛选、原生播放器持续保留',()=>withStudent(async(a,c)=>{
  const b=await c.newPage(),tasks=await c.newPage(),review=await c.newPage();await b.goto(base+'/dashboard/ai?course_id=1');await b.getByRole('link',{name:'打开当前课程地图 →'}).waitFor();await ask(b);await answer(b).waitFor();await question(b).fill('跨标签轮换时保留的未发送问题');await question(b).evaluate(el=>window.originalQuestion=el);
  await tasks.goto(base+'/tasks');await tasks.locator('.compat-task-row').first().waitFor();await choose(tasks,'按学习状态筛选','待完成');await tasks.locator('.compat-task-row').first().waitFor();
  await review.goto(base+'/courses/1/learn');await review.locator('.review-replay-list button').first().click();await review.locator('video').waitFor();await review.locator('video').evaluate(async el=>{await Promise.race([el.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('media play timeout')),6000))]);el.currentTime=4;window.originalVideo=el;});await review.waitForFunction(()=>document.querySelector('video')?.currentTime>=4);
  let refreshes=0;a.on('request',r=>{if(r.url().endsWith('/auth/refresh'))refreshes++;});const checks=[b,tasks,review].map(p=>p.waitForResponse(r=>r.url().endsWith('/api/auth/me')));await rotate(a);await Promise.all(checks);
  assert.equal(refreshes,1);assert.equal(await question(b).inputValue(),'跨标签轮换时保留的未发送问题');assert.ok(await question(b).evaluate(el=>el===window.originalQuestion));assert.equal(await answer(b).count(),1);assert.equal(await tasks.locator('.ant-select-content').innerText(),'待完成');assert.deepEqual(await review.locator('video').evaluate(el=>[el===window.originalVideo,el.paused,el.currentTime>=4]),[true,false,true]);
  const hold=gate(),entered=gate();provider.next={hold,entered};try{await ask(b);await entered.promise;await question(b).fill('回复仍在等待，新草稿保留');const checked=b.waitForResponse(r=>r.url().endsWith('/api/auth/me'));await rotate(a);await checked;hold.release();await answer(b).nth(1).waitFor();assert.equal(await question(b).inputValue(),'回复仍在等待，新草稿保留');assert.equal(refreshes,2);await screenshot(b,'13-ai-cross-tab',true);}finally{hold.release();}
 }));
 await scenario('真实跨标签退出/换号、停用、FORCE_RESET：清问答与媒体，晚到回复不回写',async()=>{
  for(const mode of['logout-switch','is_active','force_reset_password'])await withStudent(async(a,c,user)=>{
   const b=await c.newPage(),review=await c.newPage();await b.goto(base+'/dashboard/ai?course_id=1');await b.getByRole('link',{name:'打开当前课程地图 →'}).waitFor();await ask(b);await answer(b).waitFor();await question(b).fill('旧账号草稿');
   await review.goto(base+'/courses/1/learn');await review.locator('.review-replay-list button').first().click();await review.locator('video').waitFor();await review.locator('video').evaluate(el=>window.stoppedVideo=el);
   const hold=gate(),entered=gate();provider.next={hold,entered};try{await send(b).click();await entered.promise;
    if(mode==='logout-switch'){await logout(a);await b.waitForURL('**/login');await review.waitForURL('**/login');await login(a,'student_chen');await go(b,'/dashboard/ai?course_id=1');await b.getByRole('link',{name:'打开当前课程地图 →'}).waitFor();assert.equal(await question(b).inputValue(),'');}
    else{db.prepare(`UPDATE users SET ${mode}=? WHERE id=?`).run(mode==='is_active'?0:1,user.id);await a.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');await client.get('/notifications').catch(()=>{});});const target=mode==='is_active'?'**/login':'**/change-password';await b.waitForURL(target);await review.waitForURL(target);assert.equal(await question(b).count(),0);}
    hold.release();await b.waitForLoadState('networkidle');assert.equal(await answer(b).count(),0);assert.equal(await review.locator('video').count(),0);assert.deepEqual(await review.evaluate(()=>[stoppedVideo.paused,stoppedVideo.hasAttribute('src')]),[true,false]);
   }finally{hold.release();}
  });
 });
 await scenario('键盘/减少动画、阅读来源不被新回复抢滚动、未知来源无假链接',()=>withStudent(async p=>{
  await ai(p);provider.next={answer:'【测试服务长回复】\n'+('逐项记录观察条件，比较月球环境证据。\n'.repeat(90))};await question(p).fill('月球环境证据');await send(p).focus();await p.keyboard.press('Enter');await answer(p).waitFor();
  const hold=gate(),entered=gate();provider.next={hold,entered};try{await ask(p);await entered.promise;await p.locator('.assistant-reader').evaluate(el=>{el.scrollTop=20;el.dispatchEvent(new Event('scroll'));});hold.release();await answer(p).nth(1).waitFor();assert.ok(await p.locator('.assistant-reader').evaluate(el=>el.scrollTop<50));await p.getByRole('button',{name:'查看最新回复',exact:true}).click();assert.ok(await p.locator('.assistant-reader').evaluate(el=>el.scrollTop>100));}finally{hold.release();}
  await p.route('**/api/dashboard/ai/ask',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answer:'【指定 DTO 注入】未知来源不得生成入口',scope:'core',origin:'provider',sources:[{ref:'X1',type:'unknown',id:1,title:'未知类型测试'},{ref:'X2',type:'resource',title:'缺失 ID 测试'}]})}));await ask(p);await answer(p).nth(2).waitFor();assert.equal(await answer(p).nth(2).getByRole('link').count(),0);assert.equal(await answer(p).nth(2).getByRole('button').count(),0);assert.equal(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 }));
 await scenario('真实 provider 超时：等待最终错误，原问题可主动恢复，无自动重发',()=>withStudent(async p=>{
  await ai(p);const hold=gate(),entered=gate();provider.next={hold,entered};const before=provider.requests.length;
  try{await ask(p,'月球环境证据超时测试');await entered.promise;await p.locator('.assistant-failure').getByText('AI 服务响应超时，请稍后重试',{exact:true}).waitFor({timeout:40000});assert.equal(provider.requests.length,before+1);await p.getByRole('button',{name:'将原问题放回输入框',exact:true}).click();assert.equal(await question(p).inputValue(),'月球环境证据超时测试');}finally{hold.release();}
 }));
 await scenario('AI_ACCESS_CHANGED 直接拒绝、执行中停用、缺少配置：保留真实服务提示',()=>withStudent(async(p,c,user)=>{
  await ai(p);await ask(p);await answer(p).waitFor();const hold=gate(),entered=gate();provider.next={hold,entered};
  try{await ask(p);await entered.promise;db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=? AND course_id=1").run(user.id);hold.release();await p.getByText(/账号或课程权限已变化/).first().waitFor();assert.equal(await answer(p).count(),0);assert.equal(await p.getByRole('link',{name:'打开当前课程地图 →'}).count(),0);}finally{hold.release();}
  await choose(p,'当前课程','· 课程 2');const stop=gate(),sent=gate();provider.next={hold:stop,entered:sent};try{await ask(p,'月球环境证据');await sent.promise;db.prepare('UPDATE ai_settings SET enabled=0').run();stop.release();await p.locator('.assistant-failure').getByText('AI 助手已停用，请联系管理员',{exact:true}).waitFor();}finally{stop.release();db.prepare('UPDATE ai_settings SET enabled=1').run();}
  const original=db.prepare('SELECT api_key_encrypted FROM ai_settings WHERE id=1').get().api_key_encrypted;try{db.prepare('UPDATE ai_settings SET api_key_encrypted=NULL').run();await ask(p);await p.locator('.assistant-failure').getByText('灵境小智尚未配置 API Key',{exact:true}).waitFor();}finally{db.prepare('UPDATE ai_settings SET api_key_encrypted=?').run(original);}
 }));
 await scenario('下载重复点击与迟到结果：离页或真实撤回后不触发文件保存',async()=>{
  for(const mode of['leave','revoke'])await withStudent(async p=>{
   await go(p,'/courses/1/learn');await p.getByRole('button',{name:/下载：/}).waitFor();const hold=gate(),entered=gate();let calls=0,downloads=0;p.on('download',()=>downloads++);
   await p.route('**/api/courses/resources/1/download',async r=>{calls++;const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
   try{await p.getByRole('button',{name:/下载：/}).evaluate(el=>{el.click();el.click();});await entered.promise;assert.equal(calls,1);if(mode==='leave'){await go(p,'/tasks');await p.locator('.compat-task-row').first().waitFor();}else{db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByText('当前内容已不可访问',{exact:true}).waitFor();}hold.release();await p.waitForLoadState('networkidle');assert.equal(downloads,0);}finally{hold.release();db.prepare("UPDATE courses SET status='published' WHERE id=1").run();}
  });
 });
 await scenario('作品列表返回期间撤回：不发布授权缺口返回的旧作品',()=>withStudent(async p=>{
  const hold=gate(),entered=gate();await p.route('**/api/works?course_id=1',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
  try{await go(p,'/courses/1/learn');await entered.promise;await p.locator('.review-summary').waitFor();db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();hold.release();await p.getByText(/当前内容已不可访问|课程不存在或已不可访问/).first().waitFor();assert.equal(await p.getByText('月球环境记录初稿（测试）',{exact:true}).count(),0);}finally{hold.release();db.prepare("UPDATE courses SET status='published' WHERE id=1").run();}
 },'student_wang'));
 await scenario('任务详情重新读取与权限改变之间的迟到结果不能跳转',()=>withStudent(async(p,c,user)=>{
  const hold=gate(),entered=gate();await p.route('**/api/tasks/1',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
  try{await go(p,'/tasks/1');await entered.promise;db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=? AND course_id=1").run(user.id);hold.release();await p.getByText(/任务所属课程已不可访问|当前内容已不可访问/).first().waitFor();assert.equal(new URL(p.url()).pathname,'/tasks/1');assert.equal(await p.locator('.study-workspace').count(),0);}finally{hold.release();}
 }));
 await scenario('较多任务和本人版本：三尺寸长标题换行、无回放/资料局部空态',()=>withStudent(async(p,c,user)=>{
  const enrollment=db.prepare('SELECT id FROM enrollments WHERE student_id=? AND course_id=2').get(user.id).id;
  let parent=null;for(let i=1;i<=10;i++){db.prepare("INSERT INTO tasks(lesson_id,title,description) VALUES(5,?,'测试多任务')").run('较长的观察记录、条件比较与证据说明任务（测试）'+i);const w=db.prepare("INSERT INTO works(student_id,enrollment_id,title,description,review_status,parent_work_id,version) VALUES(?,? ,?,'合成版本记录','rejected',?,?)").run(user.id,enrollment,'逐步完善观察依据的作品版本（测试）'+i,parent,i);parent ||= Number(w.lastInsertRowid);}
  await go(p,'/courses/2/learn');await p.locator('.review-works .compat-records li').nth(9).waitFor();assert.equal(await p.getByText('已修改',{exact:true}).count(),9);await p.getByText('暂无课程回放。',{exact:true}).waitFor();await p.getByText('暂无课堂资料。',{exact:true}).waitFor();
  for(const[width,height]of sizes){await p.setViewportSize({width,height});await visible(p,p.locator('.review-works .compat-records a').last());}await go(p,'/tasks');await p.locator('.compat-task-row').nth(10).waitFor();await overflow(p);
 }));

 await scenario('管理员/导师原 AI 与任务页保留；教师/新媒体路径限制不扩张',async()=>{
  db.prepare("INSERT INTO users(username,password_hash,real_name,role) SELECT 'r11_media',password_hash,'新媒体（测试）','media' FROM users WHERE id=4").run();
  for(const[username,password,manager]of[['adminpbl','admin123',true],['mentor_zhang','mentor123',true],['teacher_li','teacher123',false],['r11_media','student123',false]]){
   const c=await browser.newContext(),p=await c.newPage();try{await login(p,username,password);await go(p,'/dashboard/ai');if(manager){await p.getByRole('heading',{name:/灵境小智/}).waitFor();assert.equal(await p.locator('.assistant-layout,.student-pixel').count(),0);assert.equal(await p.getByRole('link',{name:'管理员 AI 配置'}).count(),username==='adminpbl'?1:0);await go(p,'/tasks');await p.getByRole('heading',{name:'任务总览',exact:true}).waitFor();await go(p,'/tasks/1');await p.locator('.ant-descriptions').waitFor();assert.equal(new URL(p.url()).pathname,'/tasks/1');}
    else{await p.getByText(/当前身份无法访问此页面/).first().waitFor();await go(p,'/tasks');await p.getByText(/当前身份无法访问此页面/).first().waitFor();assert.equal(await p.locator('.compat-task-row,.assistant-layout').count(),0);}
   }finally{await c.close();}
  }
 });
 }finally{await f.close();}
});
