import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'backend/package.json'));
const Database=require('better-sqlite3'),jwt=require('jsonwebtoken');
const scratch=mkdtempSync(path.join(tmpdir(),'star-voyage-round10-'));
const base='http://127.0.0.1:5191',apiBase='http://127.0.0.1:3129';
const env={...process.env,NODE_ENV:'test',DB_PATH:path.join(scratch,'round10.db'),JWT_SECRET:randomBytes(32).toString('hex'),
 UPLOAD_PATH:path.join(scratch,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(scratch,'feedback'),
 CORS_ORIGIN:base,API_PROXY_TARGET:apiBase,VITE_STUDENT_TEST_CONFIG:'1',LOGIN_RATE_LIMIT_IP:'1000',LOGIN_RATE_LIMIT_USER:'1000'};
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('service not ready');}
async function login(p,user='student_wang',password='student123'){await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(user);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');await p.getByRole('button',{name:'登录',exact:true}).waitFor({state:'hidden'});}
async function rotate(p){return p.evaluate(async()=>{const {default:client}=await import('/src/api/client.js');const old=Date.now;try{const exp=JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp;Date.now=()=> (exp-240)*1000;return (await client.get('/auth/me')).user.id;}finally{Date.now=old;}});}
async function choose(p,label,text){await p.getByRole('combobox',{name:label,exact:true}).click();await p.locator('.ant-select-item-option').filter({hasText:text}).last().click();}
const shots=path.join(root,process.env.ROUND10_CAPTURE_DELIVERY==='1'?'docs/round-10/screenshots':'test-results/round10');
async function shot(p,name){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(shots,name+'.png'),animations:'disabled'});}
async function logout(p){await p.goto(base+'/me');await p.getByRole('button',{name:'退出登录',exact:true}).click();await p.waitForURL('**/login');}
async function go(p,url){await p.evaluate(url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));},url);}
const gate=()=>{let release;return{promise:new Promise(r=>release=r),release:()=>release()};};
test('第十轮：跨标签会话与通知批量回归（真实隔离 API）',{timeout:240000},async t=>{
 mkdirSync(path.join(root,'test-results'),{recursive:true});mkdirSync(shots,{recursive:true});
 execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
 const db=new Database(env.DB_PATH);
 const server=spawn(process.execPath,['-e',"require('./app').listen(3129,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
 const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5191','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
 let browser;
 try{
  await Promise.all([ready(base),ready(apiBase+'/api/health')]);browser=await chromium.launch({channel:'msedge',headless:true});console.log('Browser:',browser.version());
  await t.test('同账号真实过期凭据刷新，另一标签反馈输入和 DOM 不应丢失',async()=>{
   const c=await browser.newContext({viewport:{width:1440,height:900}}),a=await c.newPage(),b=await c.newPage();
   try{
    await login(a);await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('【测试】刷新时保留我的反馈');
    await b.getByLabel('详细描述',{exact:true}).fill('【测试】这段尚未提交的文字应当在同账号凭据轮换后继续保留。');
    await b.getByLabel('反馈标题',{exact:true}).evaluate(el=>window.originalInput=el);await shot(b,'01-feedback-before');
    const claims=jwt.decode(await a.evaluate(()=>localStorage.getItem('token')));delete claims.exp;const expired=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-1},env.JWT_SECRET);
    await a.evaluate(value=>localStorage.setItem('token',value),expired);
    const verified=b.waitForResponse(r=>r.url().endsWith('/api/auth/me'),{timeout:5000}).then(r=>r.status(),()=>null);
    let rotationError;try{assert.equal(await a.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');return(await client.get('/auth/me')).user.id;}),4);}catch(e){rotationError=e.message;}const verificationStatus=await verified;
    assert.equal(rotationError,undefined);console.log('Session observation',JSON.stringify({rotationError,verificationStatus,path:new URL(b.url()).pathname,title:await b.getByLabel('反馈标题',{exact:true}).inputValue().catch(()=>null)}));
    await b.getByLabel('反馈标题',{exact:true}).waitFor();
    assert.equal(await b.getByLabel('反馈标题',{exact:true}).inputValue(),'【测试】刷新时保留我的反馈');
    assert.equal(await b.getByLabel('详细描述',{exact:true}).inputValue(),'【测试】这段尚未提交的文字应当在同账号凭据轮换后继续保留。');assert.equal(await b.getByLabel('反馈标题',{exact:true}).evaluate(el=>window.originalInput===el),true);await shot(b,'02-feedback-after');
   }finally{await c.close();}
  });
  await t.test('真实全部已读延迟期间切换筛选，写成功必须重读当前列表',async()=>{
   db.prepare('DELETE FROM user_notifications WHERE user_id=4').run();
   const n=db.prepare("INSERT INTO notifications(event_key,title,content,summary,category,level) VALUES ('r10','【测试】课程通知','测试正文','测试摘要','course','normal')").run();
   db.prepare('INSERT INTO user_notifications(notification_id,user_id) VALUES (?,4)').run(n.lastInsertRowid);
   const c=await browser.newContext(),p=await c.newPage(),hold=gate();
   try{
    await login(p);await p.goto(base+'/notifications');await p.locator('.notification-row.is-unread').waitFor();
    let lists=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/notifications')lists++;});
    const entered=gate();
    await p.route('**/api/notifications/read-all',async route=>{entered.release();await hold.promise;await route.continue();});
    await p.getByRole('button',{name:'全部已读',exact:true}).click();await entered.promise;
    await choose(p,'通知分类','课程');await p.locator('.notification-row.is-unread').waitFor();const before=lists;
    hold.release();await p.getByText('已将全部通知标为已读',{exact:true}).waitFor();
    await p.waitForFunction(()=>document.querySelectorAll('.notification-row.is-unread').length===0,{},{timeout:3000});
    assert.ok(lists>before,'成功后必须读取当前筛选');await shot(p,'03-notifications-filter-after');
   }finally{hold.release();await c.close();}
  });
  await t.test('主动刷新保留独立反思、回复及其他角色表单；同账号迟到成功响应仍有效',async()=>{
   for(const role of['student','mentor']){
    const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage();a.setDefaultTimeout(5000);b.setDefaultTimeout(5000);
    try{await login(a,role==='student'?'student_wang':'mentor_zhang',role==='student'?'student123':'mentor123');
     if(role==='student'){
      await b.goto(base+'/courses/1/reflection');await b.getByLabel('遇到的困难',{exact:true}).fill('【测试】主动轮换时，反思仍在原来的页面。');await b.getByLabel('解决方式',{exact:true}).fill('【测试】保留解决思路');
      await b.getByLabel('遇到的困难',{exact:true}).evaluate(el=>window.originalField=el);
      const verified=b.waitForResponse(r=>r.url().endsWith('/api/auth/me'));assert.equal(await rotate(a),4);await verified;
      assert.equal(await b.getByLabel('遇到的困难',{exact:true}).evaluate(el=>el===window.originalField),true);assert.match(await b.getByLabel('解决方式',{exact:true}).inputValue(),/保留解决思路/);
     }
     await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('【测试】跨标签回复验证');await b.getByLabel('详细描述',{exact:true}).fill('【测试】用真实反馈接口创建会话后验证未提交回复。');
     await choose(b,'反馈类型','问题');await b.getByRole('button',{name:'提交反馈',exact:true}).click();await b.waitForURL(/\/feedback\/\d+$/);
     await b.getByLabel('回复内容',{exact:true}).fill('【测试】未提交回复保持不变');await b.getByLabel('回复内容',{exact:true}).evaluate(el=>window.originalField=el);
     const hold=gate(),entered=gate();await b.route('**/api/feedback/mine',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
     const request=b.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');return(await client.get('/feedback/mine')).success;});await entered.promise;
     const verified=b.waitForResponse(r=>r.url().endsWith('/api/auth/me'));await rotate(a);await verified;hold.release();assert.equal(await request,true);
     assert.equal(await b.getByLabel('回复内容',{exact:true}).evaluate(el=>el===window.originalField),true);assert.equal(await b.getByLabel('回复内容',{exact:true}).inputValue(),'【测试】未提交回复保持不变');if(role==='mentor')assert.equal(await b.locator('.student-shell').count(),0);
    }finally{await c.close();}
   }
  });
  await t.test('真实 401 单次刷新保留另一标签输入，后台复核暂时失败也不卸载',async()=>{
   const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage();
   try{await login(a);await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('【测试】401 后还在');
    const claims=jwt.decode(await a.evaluate(()=>localStorage.getItem('token')));const expired=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-1},env.JWT_SECRET);await a.evaluate(v=>localStorage.setItem('token',v),expired);
    let refreshes=0,unauthorized=0;a.on('request',r=>{if(r.url().endsWith('/auth/refresh'))refreshes++;});a.on('response',r=>{if(r.url().endsWith('/auth/me')&&r.status()===401)unauthorized++;});
    const verify=gate();await b.route('**/api/auth/me',async r=>{verify.release();await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试复核暂时失败'})});});
    assert.equal(await a.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');const old=Date.now;Date.now=()=>old()-3600000;try{return(await client.get('/auth/me')).user.id;}finally{Date.now=old;}}),4);await verify.promise;
    assert.equal(refreshes,1);assert.equal(unauthorized,1);assert.equal(await b.getByLabel('反馈标题',{exact:true}).inputValue(),'【测试】401 后还在');
   }finally{await c.close();}
  });
  await t.test('配对边界：真实退出和换账号清除另一标签表单，旧响应不得覆盖新账号',async()=>{
   const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage(),hold=gate(),entered=gate();
   try{await login(a);await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('旧账号不可带走');
    await b.route('**/api/feedback/mine',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
    const old=b.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');try{await client.get('/feedback/mine');return'accepted';}catch(e){return e.code;}});await entered.promise;
    await logout(a);await b.waitForURL('**/login');assert.equal(await b.getByLabel('反馈标题',{exact:true}).count(),0);const verified=b.waitForResponse(r=>r.url().endsWith('/api/auth/me')&&r.status()===200);await login(a,'student_chen');await verified;hold.release();assert.equal(await old,'AUTH_STOPPED');
    await go(b,'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).waitFor();assert.equal(await b.getByLabel('反馈标题',{exact:true}).inputValue(),'');assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem('user')).id),5);
   }finally{hold.release();await c.close();}
  });
  await t.test('配对边界：真实停用和 FORCE_RESET 使另一标签清理旧内容',async()=>{
   for(const field of['is_active','force_reset_password']){
    const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage();
    try{await login(a,'student_liu');await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('失效后不继续显示');db.prepare(`UPDATE users SET ${field}=? WHERE id=6`).run(field==='is_active'?0:1);
     await a.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');await client.get('/notifications').catch(()=>{});});const target=field==='is_active'?'**/login':'**/change-password';await a.waitForURL(target);await b.waitForURL(target);assert.equal(await b.getByLabel('反馈标题',{exact:true}).count(),0);assert.equal(await b.locator('.student-shell').count(),0);
    }finally{db.prepare(`UPDATE users SET ${field}=? WHERE id=6`).run(field==='is_active'?1:0);await c.close();}
   }
  });
  await t.test('批量延迟期间切分页：成功/失败/回读失败提示保留，重读不重复写入',async()=>{
   for(const mode of['success','failure','read-failure']){
    db.prepare('DELETE FROM user_notifications WHERE user_id=4').run();for(let i=0;i<24;i++){const n=db.prepare("INSERT INTO notifications(event_key,title,content,summary,category,level) VALUES ('r10-pages',?,'测试正文','测试摘要','course','normal')").run('【测试】分页通知 '+i);db.prepare('INSERT INTO user_notifications(notification_id,user_id) VALUES (?,4)').run(n.lastInsertRowid);}
    const c=await browser.newContext(),p=await c.newPage(),hold=gate(),entered=gate();let writes=0;
    try{await login(p);await p.goto(base+'/notifications');await p.locator('.notification-row.is-unread').first().waitFor();
     await p.route('**/api/notifications/read-all',async r=>{writes++;entered.release();await hold.promise;if(mode==='failure')await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试批量写入失败'})});else await r.continue();});
     await p.getByRole('button',{name:'全部已读',exact:true}).click();await entered.promise;await p.locator('.ant-pagination-item-2').click();await p.waitForFunction(()=>document.querySelector('.ant-pagination-item-active')?.title==='2');await p.locator('.notification-row.is-unread').first().waitFor();
     if(mode==='read-failure')await p.route('**/api/notifications?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试回读失败'})}));hold.release();
     if(mode==='failure'){await p.getByText('测试批量写入失败',{exact:true}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) n FROM user_notifications WHERE user_id=4 AND is_read=0').get().n,24);assert.ok(await p.locator('.notification-row.is-unread').count()>0);}
     else{if(mode==='read-failure'){await p.getByText(/已完成操作，显示暂未刷新/).waitFor();await p.unroute('**/api/notifications?*');await p.getByRole('button',{name:'重新读取显示',exact:true}).click();}else await p.getByText('已将全部通知标为已读',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelectorAll('.notification-row.is-unread').length===0);assert.equal(db.prepare('SELECT COUNT(*) n FROM user_notifications WHERE user_id=4 AND is_read=0').get().n,0);}
     assert.equal(writes,1);assert.equal(await p.locator('.ant-pagination-item-active').getAttribute('title'),'2');
    }finally{hold.release();await c.close();}
   }
  });
  await t.test('批量写已提交但响应迟到，退出换账号后不显示旧结果',async()=>{
   const c=await browser.newContext(),p=await c.newPage(),hold=gate(),entered=gate();
   try{await login(p);await p.goto(base+'/notifications');await p.getByRole('button',{name:'全部已读',exact:true}).waitFor();await p.route('**/api/notifications/read-all',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});await p.getByRole('button',{name:'全部已读',exact:true}).click();await entered.promise;await logout(p);await login(p,'student_chen');await go(p,'/notifications');await p.getByRole('heading',{name:'通知中心',exact:true}).waitFor();hold.release();await p.getByRole('button',{name:'全部已读',exact:true}).waitFor();assert.equal(await p.getByText('已将全部通知标为已读',{exact:true}).count(),0);
   }finally{hold.release();await c.close();}
  });
  await t.test('两个标签同时主动刷新只进行一次真实凭据轮换',async()=>{
   const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage();
   try{await login(a);await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('并发刷新也不能退出');
    let requests=0;for(const p of[a,b])p.on('request',r=>{if(r.url().endsWith('/auth/refresh'))requests++;});
    for(let group=0;group<20;group++){
    const before=requests;const claims=jwt.decode(await a.evaluate(()=>localStorage.getItem('token')));await a.evaluate(v=>localStorage.setItem('token',v),jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-1},env.JWT_SECRET));
    const results=await Promise.all([a,b].map(p=>p.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');try{return{ok:true,id:(await client.get('/auth/me')).user.id};}catch(e){return{ok:false,code:e.code,stack:e.stack};}})));
    if(results.some(r=>!r.ok))console.error('Concurrent refresh diagnostics',group,JSON.stringify(results));assert.deepEqual(results,[{ok:true,id:4},{ok:true,id:4}]);assert.equal(requests-before,1);assert.equal(await b.getByLabel('反馈标题',{exact:true}).inputValue(),'并发刷新也不能退出');}
    console.log('Concurrent real refresh groups: 20, failures: 0');
   }finally{await c.close();}
  });

  await t.test('旧账号刷新响应迟到，不能覆盖另一标签新登录的凭据或表单',async()=>{
   const c=await browser.newContext(),a=await c.newPage(),b=await c.newPage(),hold=gate(),entered=gate();
   try{await login(a);await b.goto(base+'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('旧账号');
    await a.route('**/api/auth/refresh',async r=>{const response=await r.fetch();entered.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
    const pending=rotate(a).then(()=> 'accepted',e=>e.message);await entered.promise;await logout(b);await a.waitForURL('**/login');await login(b,'student_chen');await go(b,'/feedback/new');await b.getByLabel('反馈标题',{exact:true}).fill('【测试】新账号的输入');hold.release();assert.match(await pending,/会话已停止/);
    assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem('user')).id),5);assert.equal(await b.getByLabel('反馈标题',{exact:true}).inputValue(),'【测试】新账号的输入');const token=await b.evaluate(()=>localStorage.getItem('token'));assert.equal((await(await fetch(apiBase+'/api/auth/me',{headers:{Authorization:'Bearer '+token}})).json()).user.id,5);
   }finally{hold.release();await c.close();}
  });
  await t.test('实际奖励页：v1 迁移、双标签最终一致、轮换保留弹窗、窄屏数据库错误',async()=>{
   const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),a=await c.newPage(),b=await c.newPage();
   const balance=async(p,n)=>{await p.getByTestId('reward-balance').getByText(String(n),{exact:true}).waitFor();await p.getByTestId('header-demo-points').getByText(String(n),{exact:true}).waitFor();};
   try{await a.goto(base+'/login');await a.evaluate(()=>localStorage.setItem('star-voyage:rewards:demo:v1:4',JSON.stringify({balance:80,records:[{id:'legacy-request',giftId:'notebook',title:'探索笔记本（演示）',cost:40,time:'2026-01-02T03:04:00.000Z',status:'演示兑换成功（不发货）'}],ledger:[{id:'legacy-request',title:'演示兑换：探索笔记本（演示）',amount:-40,time:'2026-01-02T03:04:00.000Z'},{id:'initial',title:'演示初始积分（非真实发放）',amount:120,time:''}]})));
    await login(a);await a.goto(base+'/archives/rewards');await balance(a,80);await a.getByRole('tab',{name:'兑换记录',exact:true}).click();await shot(a,'04-migrated-history');
    await b.goto(base+'/archives/rewards');await balance(b,80);await b.getByRole('button',{name:/查看.*详情/}).first().click();await b.getByRole('dialog').waitFor();const verify=b.waitForResponse(r=>r.url().endsWith('/api/auth/me'));await rotate(a);await verify;assert.equal(await b.getByRole('dialog').count(),1);await b.getByRole('button',{name:'关闭',exact:true}).click();
    await a.getByRole('button',{name:'重置演示数据',exact:true}).click();await a.getByRole('button',{name:'确认重置演示数据',exact:true}).click();await balance(a,120);await balance(b,120);
    await a.getByRole('tab',{name:'礼品',exact:true}).click();await a.getByRole('button',{name:/查看.*详情/}).first().click();await a.getByRole('button',{name:'演示兑换',exact:true}).click();await a.getByRole('button',{name:'确认演示兑换',exact:true}).click();await a.getByText('演示兑换成功',{exact:true}).waitFor();await balance(a,80);await balance(b,80);await shot(a,'05-reward-tab-a');await shot(b,'06-reward-tab-b');
    await b.setViewportSize({width:390,height:844});await b.evaluate(()=>{window.savedDatabase=Object.getOwnPropertyDescriptor(window,'indexedDB');Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw Error('test database unavailable');}});dispatchEvent(new Event('focus'));});await b.getByText('演示数据暂不可用',{exact:true}).waitFor();await b.getByText('演示数据暂不可用',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(b,'07-database-error-mobile');
    await b.evaluate(()=>Object.defineProperty(window,'indexedDB',window.savedDatabase));await b.getByRole('button',{name:'重试读取',exact:true}).click();await balance(b,80);
   }finally{await c.close();}
  });

 }finally{if(browser)await browser.close();server.kill();vite.kill();db.close();}
});
