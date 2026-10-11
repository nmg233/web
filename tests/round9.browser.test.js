
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'), require=createRequire(path.join(root,'backend/package.json'));
const Database=require('better-sqlite3'), bcrypt=require('bcryptjs');
const scratch=mkdtempSync(path.join(tmpdir(),'star-voyage-round9-'));
const shots=path.join(root,process.env.ROUND9_CAPTURE_DELIVERY==='1'?'docs/round-09/screenshots':'test-results/round9');
const base='http://127.0.0.1:5190', apiBase='http://127.0.0.1:3128';
const env={...process.env,NODE_ENV:'test',DB_PATH:path.join(scratch,'round9.db'),JWT_SECRET:randomBytes(32).toString('hex'),
UPLOAD_PATH:path.join(scratch,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(scratch,'feedback'),CORS_ORIGIN:base,API_PROXY_TARGET:apiBase,
VITE_STUDENT_TEST_CONFIG:'1',LOGIN_RATE_LIMIT_IP:'500',LOGIN_RATE_LIMIT_USER:'5'};
const viewports=[[1440,900,'desktop-1440'],[768,1024,'tablet-768'],[390,844,'mobile-390']];
async function waitFor(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('Service not ready');}
async function login(page,username='student_wang',password='student123'){
 await page.goto(base+'/login');await page.getByLabel('账号',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill(password);
 await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');
}
async function go(page,target){await page.evaluate(target=>{history.pushState({},'',target);dispatchEvent(new PopStateEvent('popstate'));},target);}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');}
async function shot(page,name,focus){
 if(focus)await focus.scrollIntoViewIfNeeded();else await page.evaluate(()=>scrollTo(0,0));
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(220);await noOverflow(page);
 await page.screenshot({path:path.join(shots,name+'.png'),animations:'disabled',maskColor:'#fffdf5',mask:[page.locator('input[autocomplete="current-password"]:not([role="combobox"]),input[autocomplete="new-password"]:not([role="combobox"])')]});
}
async function sizes(page,name,focus){for(const [width,height,label]of viewports){await page.setViewportSize({width,height});await shot(page,name+'-'+label,focus);}await page.setViewportSize({width:1440,height:900});}
async function choose(page,label,text){await page.getByRole('combobox',{name:label,exact:true}).click();await page.locator('.ant-select-item-option').filter({hasText:text}).last().click();}
const jsonError=(route,status,text='测试：暂时无法读取')=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:text})});
test('第九轮：认证、通知和反馈视觉与容错（隔离真实 API + 指定故障注入）',{timeout:600000},async(t)=>{
 mkdirSync(shots,{recursive:true});mkdirSync(path.join(root,'test-results'),{recursive:true});
 execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
 const db=new Database(env.DB_PATH);
 db.prepare("UPDATE courses SET title=title||'（测试课程）'").run();
 db.prepare("UPDATE users SET email=NULL,phone=NULL").run();
 db.prepare("INSERT INTO users (username,password_hash,real_name,role) VALUES (?,?,?,'media')").run('round9_media',bcrypt.hashSync('Media123!',4),'新媒体测试账号');
 const server=spawn(process.execPath,['-e',"require('./app').listen(3128,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
 const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5190','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
 let browser,logs='';
 for(const child of[server,vite]){child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);}
 try{
  await Promise.all([waitFor(base),waitFor(apiBase+'/api/health')]);browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const button=(name,p=page)=>p.getByRole('button',{name,exact:true});
  const scenario=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;console.error(page.url(),(await page.locator('body').innerText()).slice(0,4500));await shot(page,'failure');throw e;}});if(failure)throw failure;};
  const api=async(method,url,body,token)=>{const r=await fetch(apiBase+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
  const admin=(await api('POST','/auth/login',{username:'adminpbl',password:'admin123'})).data.token;
  const note=(title,action='/courses/1',category='course',user=4)=>{
   const n=db.prepare("INSERT INTO notifications (event_key,title,content,summary,category,level,action_url) VALUES ('round9.test',?,?,?,?,?,?)").run(title,'【测试通知】\n知识卡片中的资料已更新。请返回对应课时，查看资源并继续自己的学习。\n这条消息仅用于本轮界面验收。','测试消息：查看资源后，继续你的学习。',category,'normal',action);
   db.prepare('INSERT INTO user_notifications(notification_id,user_id) VALUES (?,?)').run(n.lastInsertRowid,user);return Number(n.lastInsertRowid);
  };
  let nid,nid2,feedbackId,otherFeedbackId,attachmentId;
  await scenario('登录：三尺寸、键盘显示切换、校验与真实错误密码/频控',async()=>{
   await page.goto(base+'/login');await page.getByRole('heading',{name:'登录你的账号'}).waitFor();await sizes(page,'01-login');
   await button('登录').click();await page.getByText('请输入账号',{exact:true}).waitFor();
   await page.getByLabel('账号',{exact:true}).fill('student_wang');await page.getByLabel('密码',{exact:true}).fill('wrong');
   await button('显示密码').focus();await page.keyboard.press('Enter');assert.equal(await page.getByLabel('密码',{exact:true}).getAttribute('type'),'text');await button('隐藏密码').click();
   await button('登录').click();await page.getByText('账号或密码错误',{exact:true}).waitFor();assert.equal(await page.getByLabel('账号',{exact:true}).inputValue(),'student_wang');await sizes(page,'02-login-error');
   for(let i=0;i<5;i++)await api('POST','/auth/login',{username:'round9_rate_test',password:'wrong'});
   await page.getByLabel('账号',{exact:true}).fill('round9_rate_test');await button('登录').click();await page.getByText(/登录失败次数过多/).waitFor();
   await page.setViewportSize({width:390,height:480});await button('登录').scrollIntoViewIfNeeded();await noOverflow(page);
  });
  await scenario('登录网络/超时故障注入保留表单；真实学生登录进入探索',async()=>{
   await page.route('**/api/auth/login',r=>r.abort('failed'));await page.getByLabel('账号',{exact:true}).fill('student_wang');await button('登录').click();await page.getByText(/暂时无法连接服务/).waitFor();
   assert.equal(await page.getByLabel('账号',{exact:true}).inputValue(),'student_wang');await page.unroute('**/api/auth/login');
   await page.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');window.round9timeout=client.defaults.timeout;client.defaults.timeout=150;});
   await page.route('**/api/auth/login',async r=>{await new Promise(x=>setTimeout(x,400));await r.abort().catch(()=>{});});
   await button('登录').click();await page.getByText(/登录请求超时/).waitFor();await page.unroute('**/api/auth/login');
   await page.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');client.defaults.timeout=window.round9timeout;});
   await login(page);await page.getByRole('heading',{name:'探索地图',exact:true}).waitFor();await page.setViewportSize({width:1440,height:900});
  });
  await scenario('强制改密不可绕过、无通知请求；真实新凭证与普通改密三尺寸',async()=>{
   db.prepare('UPDATE users SET force_reset_password=1 WHERE id=5').run();
   const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await c.newPage();p.setDefaultTimeout(10000);
   let business=0;p.on('request',r=>{if(/\/api\/(notifications|feedback)/.test(r.url()))business++;});
   await login(p,'student_chen');await p.waitForURL('**/change-password');await sizes(p,'03-password-forced');
   for(const target of ['/explore','/notifications','/feedback']){await go(p,target);await p.waitForURL('**/change-password');}
   assert.equal(business,0);assert.equal(await p.locator('.student-partner').count(),0);assert.equal(await p.getByRole('navigation',{name:'学生主导航'}).count(),0);
   const oldToken=await p.evaluate(()=>localStorage.getItem('token'));
   await p.getByLabel('原密码',{exact:true}).fill('student123');await p.getByLabel('新密码',{exact:true}).fill('Round9New!');await p.getByLabel('确认新密码',{exact:true}).fill('Round9New!');await button('确认修改',p).click();await p.waitForURL('**/explore');
   assert.equal((await api('GET','/auth/me',undefined,oldToken)).status,401);assert.equal((await api('GET','/auth/me',undefined,await p.evaluate(()=>localStorage.getItem('token')))).status,200);
   await go(p,'/change-password');await p.getByLabel('原密码',{exact:true}).waitFor();await sizes(p,'04-password-normal');
   await p.getByLabel('原密码',{exact:true}).fill('Round9New!');await p.getByLabel('新密码',{exact:true}).fill('Round9Next!');await p.getByLabel('确认新密码',{exact:true}).fill('Round9Next!');await button('确认修改',p).click();await p.waitForURL('**/explore');
   await go(p,'/change-password');await p.getByLabel('原密码',{exact:true}).fill('Round9Next!');await p.getByLabel('新密码',{exact:true}).fill('Round9Final!');await p.getByLabel('确认新密码',{exact:true}).fill('Round9Final!');
   await p.evaluate(()=>{window.r9set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='token')throw Error('test write');return window.r9set.call(this,k,v);};});
   await button('确认修改',p).click();await p.waitForURL('**/login');await p.getByText(/密码已经修改，但新登录信息无法保存/).first().waitFor();await sizes(p,'05-password-saved-session-failed');
   await p.evaluate(()=>{Storage.prototype.setItem=window.r9set;});await login(p,'student_chen','Round9Final!');await p.waitForURL('**/explore');await c.close();
  });


  await scenario('真实其他角色首页与管理功能保持原角色布局',async()=>{
   for(const [u,pwd,home]of[['adminpbl','admin123','/dashboard'],['mentor_zhang','mentor123','/dashboard'],['teacher_li','teacher123','/observer'],['round9_media','Media123!','/dashboard']]){
    const c=await browser.newContext(),p=await c.newPage();await login(p,u,pwd);await p.waitForURL('**'+home);
    assert.equal(await p.locator('.student-shell').count(),0);await go(p,'/feedback');await p.getByRole('heading',{name:'我的反馈',exact:true}).waitFor();assert.equal(await p.locator('.student-pixel').count(),0);
    await go(p,'/notifications');await p.getByRole('heading',{name:'通知中心',exact:true}).waitFor();await c.close();
   }
  });
  await scenario('localStorage getter/getItem 故障结束恢复；sessionStorage 禁用不阻断登录',async()=>{
   for(const mode of ['getter','read','sessionGetter','sessionMethods']){
    const c=await browser.newContext(),p=await c.newPage();p.setDefaultTimeout(10000);
    await p.addInitScript(mode=>{
     const type=mode.startsWith('session')?'sessionStorage':'localStorage';
     const descriptor=Object.getOwnPropertyDescriptor(window,type);
     if(mode==='getter'||mode==='sessionGetter'){Object.defineProperty(window,type,{configurable:true,get(){throw Error('test storage getter');}});window.r9restore=()=>Object.defineProperty(window,type,descriptor);}
     else {const original={getItem:Storage.prototype.getItem,setItem:Storage.prototype.setItem,removeItem:Storage.prototype.removeItem};for(const method of mode==='read'?['getItem']:Object.keys(original)){Storage.prototype[method]=function(...args){if(this===window[type])throw Error('test storage method');return original[method].apply(this,args);};}window.r9restore=()=>Object.assign(Storage.prototype,original);}
    },mode);
    await p.goto(base+'/login');await p.getByRole('heading',{name:'登录你的账号'}).waitFor();
    if(mode==='getter'||mode==='read'){await p.getByText(/浏览器不允许访问登录存储|无法读取登录信息/).first().waitFor();await shot(p,'06-storage-'+mode);await p.evaluate(()=>window.r9restore());await button('重新读取登录信息',p).click();}
    await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await button('登录',p).click();await p.waitForURL('**/explore');await c.close();
   }
  });
  await scenario('登录部分写入失败不进业务；退出清理失败立即移除内容并可重新登录',async()=>{
   const c=await browser.newContext(),p=await c.newPage();
   await p.goto(base+'/login');await p.getByRole('heading',{name:'登录你的账号'}).waitFor();await p.evaluate(()=>{window.r9set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='refresh_token')throw Error('test partial');return window.r9set.call(this,k,v);};});
   await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await button('登录',p).click();await p.getByText(/登录信息保存失败/).first().waitFor();assert.equal(new URL(p.url()).pathname,'/login');
   assert.deepEqual(await p.evaluate(()=>['token','refresh_token','user'].map(k=>localStorage.getItem(k))),[null,null,null]);
   await p.evaluate(()=>{Storage.prototype.setItem=window.r9set;});await login(p);await p.getByTestId('header-demo-points').waitFor();
   await p.evaluate(()=>{window.r9remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(this===localStorage)throw Error('test cleanup');return window.r9remove.call(this,k);};});
   await button('个人中心',p).click();await p.getByRole('menuitem',{name:'退出登录'}).click();await p.waitForURL('**/login');assert.equal(await p.locator('.student-shell').count(),0);await p.getByText(/无法清理全部登录记录/).first().waitFor();await shot(p,'07-logout-cleanup-failed');
   await p.evaluate(()=>{Storage.prototype.removeItem=window.r9remove;});await p.reload();await p.getByRole('heading',{name:'登录你的账号'}).waitFor();assert.equal(await p.locator('.student-shell').count(),0);
   await login(p,'student_chen','Round9Final!');const identity=await p.evaluate(()=>JSON.parse(localStorage.getItem('user')).id);assert.equal(identity,5);await c.close();
  });
  await scenario('通知真实空态、三尺寸列表/详情/最近弹层、GET 自动已读与标未读',async()=>{
   await go(page,'/notifications');await page.getByText('暂时没有通知。有新消息时，会出现在这里。').waitFor();await sizes(page,'08-notifications-empty');
   nid=note('【测试】知识卡片资源已更新');nid2=note('【测试】反馈已收到，请留意处理进展','/feedback','feedback');
   for(let i=1;i<=22;i++)note('【测试】课程提醒 '+String(i).padStart(2,'0'));
   await page.reload();await page.locator('.notification-row').first().waitFor();await sizes(page,'09-notifications-list');
   await go(page,'/notifications/'+nid);await page.getByRole('heading',{name:'【测试】知识卡片资源已更新',exact:true}).waitFor();
   assert.equal(db.prepare('SELECT is_read FROM user_notifications WHERE notification_id=? AND user_id=4').get(nid).is_read,1);await sizes(page,'10-notification-detail');
   await button('标记为未读').click();await button('标记为已读').waitFor();assert.equal(db.prepare('SELECT is_read FROM user_notifications WHERE notification_id=? AND user_id=4').get(nid).is_read,0);
   for(const [width,height,label]of viewports){await page.setViewportSize({width,height});await button('通知').click();await page.getByRole('region',{name:'最近通知'}).waitFor();await page.locator('.notification-popover .notification-row').first().waitFor();assert.equal(await page.locator('.notification-popover .notification-row').count(),8);await shot(page,'11-notifications-popover-'+label);await page.keyboard.press('Escape');await page.getByRole('region',{name:'最近通知'}).waitFor({state:'hidden'});assert.ok(await button('通知').evaluate(el=>document.activeElement===el));}
   await page.setViewportSize({width:1440,height:900});
  });
  await scenario('通知筛选与分页、批量真实范围、清理确认及最后一页回退',async()=>{
   await go(page,'/notifications');await choose(page,'通知分类','反馈');await page.getByText('【测试】反馈已收到，请留意处理进展',{exact:true}).waitFor();await button('全部已读').click();await page.getByText('已将全部通知标为已读',{exact:true}).waitFor();
   assert.equal(db.prepare('SELECT COUNT(*) n FROM user_notifications WHERE user_id=4 AND is_read=0 AND is_hidden=0').get().n,0);
   await button('清理已读').click();await page.getByRole('dialog').waitFor();await shot(page,'12-notifications-clear-confirm');await button('确认清理').click();await page.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(db.prepare('SELECT COUNT(*) n FROM user_notifications WHERE user_id=4 AND is_hidden=0').get().n,0);
   await go(page,'/explore');for(let i=1;i<=21;i++)note('【测试】分页通知 '+i);await go(page,'/notifications');await page.locator('.notification-row').first().waitFor();await page.locator('.ant-pagination-item-2').click();await page.waitForTimeout(200);assert.equal(await page.locator('.notification-row').count(),1);
   await button('全部已读').click();await page.getByText('已将全部通知标为已读',{exact:true}).waitFor();await button('清理已读').click();await button('确认清理').click();await page.getByText('暂时没有通知。有新消息时，会出现在这里。').waitFor();
   const only=note('【测试】最后一条通知');await page.reload();await page.locator('.notification-row').first().click();await button('隐藏通知').click();await page.waitForURL('**/notifications');await page.getByText('暂时没有通知。有新消息时，会出现在这里。').waitFor();assert.equal(db.prepare('SELECT is_hidden FROM user_notifications WHERE notification_id=?').get(only).is_hidden,1);
  });
  await scenario('最近通知合法路径跳转、不允许路径回退；计数失败不伪装为零',async()=>{
   const denied=note('【测试】仅查看此通知','/students','system');await button('通知').click();await page.locator('.notification-popover').getByText('【测试】仅查看此通知',{exact:true}).click();await page.waitForURL('**/notifications/'+denied);
   note('【测试】返回课程地图','/courses/1');await button('通知').click();await page.locator('.notification-popover').getByText('【测试】返回课程地图',{exact:true}).click();await page.waitForURL('**/courses/1');
   await page.route('**/api/notifications/unread-count',r=>jsonError(r,503));await page.evaluate(()=>dispatchEvent(new Event('focus')));await button('通知').click();await page.getByText('未读数暂未读取',{exact:true}).waitFor();await shot(page,'13-notification-count-failure');await page.unroute('**/api/notifications/unread-count');await page.getByRole('region',{name:'最近通知'}).getByRole('button',{name:'重试',exact:true}).click();await page.getByText('未读数暂未读取',{exact:true}).waitFor({state:'hidden'});await page.keyboard.press('Escape');
  });


  await scenario('通知 A 切 B 失败、迟到 A、动作迟到；列表筛选迟到均不串对象',async()=>{
   nid=note('【测试】通知对象 A');nid2=note('【测试】通知对象 B');
   await go(page,'/notifications/'+nid);await page.getByRole('heading',{name:'【测试】通知对象 A',exact:true}).waitFor();
   await page.route('**/api/notifications/'+nid2,r=>jsonError(r,404,'测试通知不存在'));await go(page,'/notifications/'+nid2);await page.getByText('通知不存在或已不可访问',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'【测试】通知对象 A',exact:true}).count(),0);await shot(page,'14-notification-object-failure');await page.unroute('**/api/notifications/'+nid2);
   let release,started;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
   await page.route('**/api/notifications/'+nid,async r=>{const response=await r.fetch();started();await gate;await r.fulfill({response});});
   await go(page,'/notifications/'+nid);await began;await go(page,'/notifications/'+nid2);await page.getByRole('heading',{name:'【测试】通知对象 B',exact:true}).waitFor();release();await page.waitForTimeout(250);assert.equal(await page.getByRole('heading',{name:'【测试】通知对象 A',exact:true}).count(),0);await page.unroute('**/api/notifications/'+nid);
   let releaseAction,startAction;const ready=new Promise(r=>startAction=r),gateAction=new Promise(r=>releaseAction=r);
   await page.route('**/api/notifications/'+nid2+'/hide',async r=>{const response=await r.fetch();startAction();await gateAction;await r.fulfill({response});});
   await button('隐藏通知').click();await ready;await go(page,'/notifications/'+nid);await page.getByRole('heading',{name:'【测试】通知对象 A',exact:true}).waitFor();releaseAction();await page.waitForTimeout(250);assert.equal(new URL(page.url()).pathname,'/notifications/'+nid);await page.unroute('**/api/notifications/'+nid2+'/hide');
   let releaseList,startList;const listReady=new Promise(r=>startList=r),gateList=new Promise(r=>releaseList=r);
   await page.route('**/api/notifications?*',async r=>{if(new URL(r.request().url()).searchParams.get('category')==='course'){const response=await r.fetch();startList();await gateList;await r.fulfill({response});}else await r.continue();});
   await go(page,'/notifications');await choose(page,'通知分类','课程');await listReady;await choose(page,'通知分类','安全');await page.getByText('没有符合筛选条件的通知，可调整筛选。').waitFor();releaseList();await page.waitForTimeout(200);assert.equal(await page.locator('.notification-row').count(),0);await page.unroute('**/api/notifications?*');
  });
  await scenario('通知写成功回读失败显示真实结果，重试只读取',async()=>{
   await go(page,'/explore');await go(page,'/notifications');await page.locator('.notification-row').first().waitFor();let writes=0;
   await page.route('**/api/notifications/read-all',async r=>{writes++;await r.continue();});
   await page.route('**/api/notifications?*',r=>jsonError(r,503));await button('全部已读').click();await page.getByText(/已完成操作，显示暂未刷新/).waitFor();assert.equal(writes,1);await shot(page,'15-notification-write-read-failure');
   await page.unroute('**/api/notifications?*');await button('重新读取显示').click();await page.locator('.notification-row').first().waitFor();assert.equal(writes,1);await page.unroute('**/api/notifications/read-all');
  });
  await scenario('反馈真实空态与表单三尺寸；合法文件、类型/数量/大小校验及失败保留',async()=>{
   await go(page,'/feedback');await page.getByText(/你还没有提交反馈/).waitFor();await sizes(page,'16-feedback-empty');await button('提交反馈').click();await page.getByLabel('反馈标题',{exact:true}).waitFor();await sizes(page,'17-feedback-form');
   await choose(page,'反馈类型','程序错误');await page.getByLabel('反馈标题',{exact:true}).fill('【测试】知识卡片图片暂时无法显示');await page.getByLabel('详细描述',{exact:true}).fill('【测试反馈】我打开课程中的知识卡片时，图片区域没有显示。已经尝试刷新，希望能查看完整资料并继续学习。');
   const files=page.locator('#feedback-files');const pdf={name:'测试操作说明.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nround9 test\n%%EOF')};
   await files.setInputFiles(pdf);await files.setInputFiles({name:'不支持.gif',mimeType:'image/gif',buffer:Buffer.from('GIF89a')});await page.getByText(/不支持 GIF/).waitFor();
   await files.setInputFiles({name:'过大.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});await page.getByText(/单个附件不能超过 10 MiB/).waitFor();
   await files.setInputFiles([{...pdf,name:'测试文件2.pdf'},{...pdf,name:'测试文件3.pdf'},{...pdf,name:'第四份.pdf'}]);await page.getByText(/已选择的文件已保留/).waitFor();assert.equal(await page.locator('.feedback-file-picker li').count(),3);assert.equal(await page.getByText('测试操作说明.pdf',{exact:true}).count(),1);
   await button('移除 测试文件2.pdf').click();await button('移除 测试文件3.pdf').click();await page.route('**/api/feedback',r=>jsonError(r,503,'测试：附件保存暂不可用'));
   await button('提交反馈').click();await page.getByText('测试：附件保存暂不可用',{exact:true}).waitFor();assert.equal(await page.locator('.feedback-file-picker li').count(),1);assert.match(await page.getByLabel('详细描述',{exact:true}).inputValue(),/测试反馈/);await shot(page,'18-feedback-submit-failure',button('提交反馈'));
   await page.unroute('**/api/feedback');await button('提交反馈').click();await page.waitForURL(/\/feedback\/\d+$/);feedbackId=Number(new URL(page.url()).pathname.split('/').at(-1));await page.getByRole('heading',{name:'【测试】知识卡片图片暂时无法显示',exact:true}).waitFor();
   const row=db.prepare('SELECT * FROM feedbacks WHERE id=?').get(feedbackId);assert.equal(row.user_id,4);assert.equal(row.allow_contact,1);assert.ok(row.client_info);assert.equal(row.source_path,'/feedback/new');attachmentId=db.prepare('SELECT id FROM feedback_attachments WHERE feedback_id=?').get(feedbackId).id;
   await sizes(page,'19-feedback-detail');await go(page,'/feedback');await page.locator('.feedback-row').first().waitFor();await sizes(page,'20-feedback-list');await choose(page,'状态','待处理');await page.locator('.feedback-row').first().waitFor();assert.equal(await page.locator('.feedback-row').count(),1);
  });
  await scenario('反馈授权附件下载与真实 404 不清回复；普通回复失败保留并可真实发送',async()=>{
   await go(page,'/feedback/'+feedbackId);await page.getByLabel('回复内容',{exact:true}).fill('【测试补充】我已经重新打开课程，问题仍然出现。');
   const download=page.waitForEvent('download');await button('下载附件').click();assert.equal((await download).suggestedFilename(),'测试操作说明.pdf');
   db.prepare('UPDATE feedback_attachments SET file_path=? WHERE id=?').run(path.join(scratch,'missing.pdf'),attachmentId);
   await button('下载附件').click();await button('重试下载').waitFor();assert.match(await page.getByLabel('回复内容',{exact:true}).inputValue(),/测试补充/);await shot(page,'21-feedback-attachment-missing',page.getByLabel('回复内容',{exact:true}));
   await page.route('**/api/feedback/'+feedbackId+'/messages',r=>jsonError(r,503,'测试：回复暂时无法提交'));await button('发送回复').click();await page.getByText('测试：回复暂时无法提交',{exact:true}).waitFor();assert.match(await page.getByLabel('回复内容',{exact:true}).inputValue(),/测试补充/);await page.unroute('**/api/feedback/'+feedbackId+'/messages');
   await button('发送回复').click();await page.getByText('回复已发送',{exact:true}).waitFor();assert.equal(await page.getByLabel('回复内容',{exact:true}).inputValue(),'');assert.equal(db.prepare("SELECT COUNT(*) n FROM feedback_messages WHERE feedback_id=? AND content LIKE '【测试补充】%'").get(feedbackId).n,1);
  });
  await scenario('反馈回复写成功回读失败仅重新 GET，不重复 POST',async()=>{
   let writes=0;await page.getByLabel('回复内容',{exact:true}).fill('【测试回读】这条回复只提交一次。');
   await page.route('**/api/feedback/'+feedbackId+'/messages',async r=>{writes++;await r.continue();});await page.route('**/api/feedback/'+feedbackId,r=>jsonError(r,503));
   await button('发送回复').click();await page.getByText(/回复已发送。已完成操作，显示暂未刷新/).waitFor();assert.equal(writes,1);await sizes(page,'22-feedback-write-read-failure');
   await page.unroute('**/api/feedback/'+feedbackId);await button('重新读取显示').click();await page.getByLabel('回复内容',{exact:true}).waitFor();assert.equal(await page.getByLabel('回复内容',{exact:true}).inputValue(),'');assert.equal(writes,1);await page.unroute('**/api/feedback/'+feedbackId+'/messages');
  });


  await scenario('真实管理员内部备注不可见、解决确认与重新处理；重开失败保留、焦点恢复',async()=>{
   assert.equal((await api('POST','/feedback/'+feedbackId+'/internal-notes',{content:'ROUND9_INTERNAL_SECRET'},admin)).status,201);
   assert.equal((await api('POST','/feedback/'+feedbackId+'/resolve',{resolution:'【测试处理结果】资源已经重新检查，请再试一次。如果问题仍在，可以补充情况。'},admin)).status,200);
   await page.reload();await button('确认已解决').waitFor();assert.equal(await page.getByText('ROUND9_INTERNAL_SECRET').count(),0);assert.equal(await page.getByRole('heading',{name:'管理员处理',exact:true}).count(),0);await sizes(page,'23-feedback-resolved');
   await button('确认已解决').click();await page.getByText('已确认解决',{exact:true}).waitFor();assert.equal(db.prepare('SELECT status FROM feedbacks WHERE id=?').get(feedbackId).status,'closed');assert.equal(await page.getByLabel('回复内容',{exact:true}).count(),0);
   await button('申请重新处理').click();await page.getByLabel('重新处理的原因',{exact:true}).fill('【测试】再次尝试后图片依然无法打开，请继续检查。');
   await page.route('**/api/feedback/'+feedbackId+'/reopen',r=>jsonError(r,503,'测试：重新处理暂时无法提交'));await button('提交原因').click();await page.getByRole('dialog').getByText('测试：重新处理暂时无法提交',{exact:true}).waitFor();assert.match(await page.getByLabel('重新处理的原因',{exact:true}).inputValue(),/依然无法打开/);await sizes(page,'24-feedback-reopen-error');
   await page.setViewportSize({width:390,height:844});await button('提交原因').focus();await page.keyboard.press('Tab');assert.ok(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));
   await page.unroute('**/api/feedback/'+feedbackId+'/reopen');await button('提交原因').click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('.ant-alert').getByText('反馈已重新打开',{exact:true}).waitFor();assert.equal(db.prepare('SELECT status FROM feedbacks WHERE id=?').get(feedbackId).status,'processing');await page.setViewportSize({width:1440,height:900});
  });
  await scenario('反馈 A 切 B 的真实 403/404、迟到返回与路由后动作不串对象',async()=>{
   const other=(await api('POST','/auth/login',{username:'student_chen',password:'Round9Final!'})).data.token;
   const fd=new FormData();fd.set('type','question');fd.set('title','【测试】另一位学生的反馈');fd.set('description','【测试】这是另一位学生自己的反馈内容，不能展示给当前学生。');
   const r=await fetch(apiBase+'/api/feedback',{method:'POST',headers:{Authorization:'Bearer '+other},body:fd});otherFeedbackId=(await r.json()).data.feedback.id;
   await go(page,'/feedback/'+otherFeedbackId);await page.getByText('无权访问这条反馈',{exact:true}).waitFor();assert.equal(await page.getByText('【测试】知识卡片图片暂时无法显示',{exact:true}).count(),0);await sizes(page,'25-feedback-forbidden');
   await go(page,'/feedback/999999');await page.getByText('反馈不存在或已不可访问',{exact:true}).waitFor();
   let release,start;const ready=new Promise(r=>start=r),gate=new Promise(r=>release=r);
   await page.route('**/api/feedback/'+feedbackId,async r=>{const response=await r.fetch();start();await gate;await r.fulfill({response});});
   await go(page,'/feedback/'+feedbackId);await ready;await go(page,'/feedback/999999');await page.getByText('反馈不存在或已不可访问',{exact:true}).waitFor();release();await page.waitForTimeout(200);assert.equal(await page.getByRole('heading',{name:'【测试】知识卡片图片暂时无法显示',exact:true}).count(),0);await page.unroute('**/api/feedback/'+feedbackId);
   await go(page,'/feedback/'+feedbackId);await page.getByLabel('回复内容',{exact:true}).fill('【测试路由】只发送到当前反馈。');
   let releaseAction,startAction;const actionReady=new Promise(r=>startAction=r),actionGate=new Promise(r=>releaseAction=r);
   await page.route('**/api/feedback/'+feedbackId+'/messages',async r=>{const response=await r.fetch();startAction();await actionGate;await r.fulfill({response});});
   await button('发送回复').click();await actionReady;await go(page,'/feedback/999999');await page.getByText('反馈不存在或已不可访问',{exact:true}).waitFor();releaseAction();await page.waitForTimeout(200);assert.equal(new URL(page.url()).pathname,'/feedback/999999');await page.unroute('**/api/feedback/'+feedbackId+'/messages');
  });

  await scenario('反馈筛选迟到/读取失败隔离，长内容与三尺寸表单底部可达',async()=>{
   let release,start;const ready=new Promise(r=>start=r),gate=new Promise(r=>release=r);
   await page.route('**/api/feedback/mine?*',async r=>{if(new URL(r.request().url()).searchParams.get('type')==='bug'){const response=await r.fetch();start();await gate;await r.fulfill({response});}else await r.continue();});
   await go(page,'/feedback');await page.locator('.feedback-row').first().waitFor();await choose(page,'反馈类型','程序错误');await ready;await choose(page,'反馈类型','功能建议');await page.getByText('没有符合条件的反馈，请调整筛选。').waitFor();release();await page.waitForTimeout(180);assert.equal(await page.locator('.feedback-row').count(),0);await page.unroute('**/api/feedback/mine?*');
   await page.route('**/api/feedback/mine?*',r=>jsonError(r,503));await choose(page,'反馈类型','使用咨询');await page.getByText('反馈列表暂时无法读取',{exact:true}).waitFor();await page.unroute('**/api/feedback/mine?*');
   const long='【测试长标题】'+ '知识卡片资源与学习操作说明'.repeat(5);
   db.prepare('UPDATE feedbacks SET title=?,description=? WHERE id=?').run(long,'【测试长描述】\n'+('不带空格的测试长文本LongText123_'.repeat(20))+'\n这些文字仅用于验证完整换行，不代表正式课程。',feedbackId);
   await go(page,'/feedback/'+feedbackId);await page.getByRole('heading',{name:long,exact:true}).waitFor();await sizes(page,'26-long-content');
   await go(page,'/feedback/new');await page.getByLabel('反馈标题',{exact:true}).waitFor();await sizes(page,'27-feedback-footer',button('提交反馈'));
   for(const [width,height]of viewports){await page.setViewportSize({width,height});await button('提交反馈').scrollIntoViewIfNeeded();assert.ok(await button('提交反馈').evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.bottom<innerHeight&&el.contains(hit);}));}
   await page.setViewportSize({width:1440,height:900});
  });
  await scenario('回复超时未确认不伪造失败或成功；重复点击只发一个请求',async()=>{
   await go(page,'/feedback/'+feedbackId);await page.getByLabel('回复内容',{exact:true}).fill('【测试超时】服务端已接收但响应未送达。');
   await page.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');client.defaults.timeout=200;});
   let writes=0;await page.route('**/api/feedback/'+feedbackId+'/messages',async r=>{writes++;const response=await r.fetch();await new Promise(resolve=>setTimeout(resolve,500));await r.fulfill({response}).catch(()=>{});});
   await button('发送回复').evaluate(el=>{el.click();el.click();});await page.getByText(/提交请求超时，结果暂未确认/).waitFor();assert.equal(writes,1);assert.match(await page.getByLabel('回复内容',{exact:true}).inputValue(),/测试超时/);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM feedback_messages WHERE feedback_id=? AND content LIKE '【测试超时】%'").get(feedbackId).n,1);
   await page.unroute('**/api/feedback/'+feedbackId+'/messages');await page.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');client.defaults.timeout=15000;});await page.reload();await page.getByLabel('回复内容',{exact:true}).waitFor();assert.equal(await page.getByLabel('回复内容',{exact:true}).inputValue(),'');
  });
  await scenario('真实有效 refresh 轮换与并发去重，旧账号迟到请求不能覆盖新账号',async()=>{
   const c=await browser.newContext(),p=await c.newPage();await login(p);await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   const token=await p.evaluate(()=>localStorage.getItem('token')),jwt=require('jsonwebtoken');
   const expired=jwt.sign({...jwt.decode(token),exp:Math.floor(Date.now()/1000)-1},env.JWT_SECRET);
   await p.evaluate(value=>localStorage.setItem('token',value),expired);let calls=0;p.on('request',r=>{if(r.url().endsWith('/auth/refresh'))calls++;});
   const result=await p.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');return (await Promise.allSettled([client.get('/auth/me'),client.get('/notifications/unread-count'),client.get('/feedback/mine')])).map(r=>r.status);});
   assert.deepEqual(result,['fulfilled','fulfilled','fulfilled']);assert.equal(calls,1);
   let release,start;const ready=new Promise(r=>start=r),gate=new Promise(r=>release=r);
   await p.route('**/api/notifications/recent?*',async r=>{const response=await r.fetch();start();await gate;await r.fulfill({response}).catch(()=>{});});
   await button('通知',p).click();await ready;await p.keyboard.press('Escape');await button('个人中心',p).click();await p.getByRole('menuitem',{name:'退出登录'}).click();await p.waitForURL('**/login');release();
   await login(p,'student_chen','Round9Final!');await go(p,'/notifications');await p.getByRole('heading',{name:'通知中心',exact:true}).waitFor();assert.equal(await p.getByText('【测试】通知对象 A',{exact:true}).count(),0);await c.close();
  });


  await scenario('账号停用及并发 401 刷新只一次；强制重置全局处理与受限业务不循环',async()=>{
   const c=await browser.newContext(),p=await c.newPage();await login(p,'student_liu');await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();
   let refreshes=0;p.on('request',r=>{if(r.url().endsWith('/auth/refresh'))refreshes++;});
   db.prepare('UPDATE users SET is_active=0 WHERE id=6').run();
   await p.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');await Promise.allSettled([client.get('/auth/me'),client.get('/notifications/unread-count'),client.get('/feedback/mine')]);});
   await p.waitForURL('**/login');assert.equal(await p.locator('.student-shell').count(),0);assert.equal(refreshes,1);db.prepare('UPDATE users SET is_active=1 WHERE id=6').run();
   await login(p,'student_liu');await p.getByRole('heading',{name:'探索地图',exact:true}).waitFor();db.prepare('UPDATE users SET force_reset_password=1 WHERE id=6').run();
   await p.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');await client.get('/notifications').catch(()=>{});});await p.waitForURL('**/change-password');assert.equal(await button('通知',p).count(),0);await c.close();
  });

  await scenario('管理员反馈详情保留优先级、状态和内部备注操作，没有学生外壳',async()=>{
   const c=await browser.newContext(),p=await c.newPage();await login(p,'adminpbl','admin123');await go(p,'/feedback/'+feedbackId);await p.getByRole('heading',{name:'管理员处理',exact:true}).waitFor();
   assert.equal(await p.locator('.student-pixel').count(),0);
   await choose(p,'优先级','高');await p.getByText('优先级已更新',{exact:true}).waitFor();assert.equal(db.prepare('SELECT priority FROM feedbacks WHERE id=?').get(feedbackId).priority,'high');
   await choose(p,'变更状态','待补充');await p.getByText('状态已更新',{exact:true}).waitFor();assert.equal(db.prepare('SELECT status FROM feedbacks WHERE id=?').get(feedbackId).status,'waiting_user');
   await p.getByLabel('内部备注',{exact:true}).fill('ROUND9_ADMIN_UI_INTERNAL');await button('保存内部备注',p).click();await p.getByText('内部备注已保存',{exact:true}).waitFor();
   assert.equal(db.prepare("SELECT is_internal FROM feedback_messages WHERE feedback_id=? AND content='ROUND9_ADMIN_UI_INTERNAL'").get(feedbackId).is_internal,1);
   await c.close();
  });


  await scenario('通知账号切换不残留旧列表/计数；浏览器无未捕获异常',async()=>{
   await go(page,'/notifications');await page.locator('.notification-row').first().waitFor();await button('个人中心').click();await page.getByRole('menuitem',{name:'退出登录'}).click();await page.waitForURL('**/login');assert.equal(await page.locator('.notification-row').count(),0);
   await login(page,'student_chen','Round9Final!');await go(page,'/notifications');await page.getByRole('heading',{name:'通知中心',exact:true}).waitFor();assert.equal(await page.getByText('【测试】通知对象 A',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
  });
  await context.close();
 }finally{if(browser)await browser.close();server.kill();vite.kill();db.close();writeFileSync(path.join(root,'test-results/round9-server.log'),logs);}
});
