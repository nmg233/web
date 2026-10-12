import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { readRewardAccount, writeRewardAccount, watchRewardTransactions, holdRewardDatabase, releaseRewardDatabase, waitRewardWrite, failRewardPut, restoreRewardPut } from './helpers/rewardBrowser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const Database = require('better-sqlite3');
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round8-'));
const shots = path.join(root, process.env.ROUND8_CAPTURE_DELIVERY === '1' ? 'docs/round-08/screenshots' : 'test-results/round8');
const base = 'http://127.0.0.1:5189';
const apiBase = 'http://127.0.0.1:3127';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round8.db'),
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: apiBase,
  GLIDER_BACKEND: 'reference', GLIDER_PYTHON: path.join(root,'.venv/Scripts/python.exe'), GLIDER_RENDERER: 'mpl', VITE_STUDENT_TEST_CONFIG: '1', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };
const viewports = [[1440, 900, 'desktop-1440'], [768, 1024, 'tablet-768'], [390, 844, 'mobile-390']];
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Service did not start: ${url}`);
}
async function login(page, username = 'student_wang', password = 'student123') {
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('账号', { exact: true }).fill(username);
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
  await page.getByRole('button', { name: '登录', exact: true }).waitFor({ state: 'hidden' });
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '页面无横向溢出');
}
async function visibleAction(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert.ok(await locator.evaluate((element) => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.top >= 64 && r.bottom <= innerHeight && (hit === element || element.contains(hit));
  }), '实际操作未被顶栏或伙伴遮挡');
}
async function shot(page, name, firstScreen = true) {
  await page.locator('.ant-message-notice').last().waitFor({ state: 'hidden', timeout: 10000 });
  if (firstScreen) await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  await noOverflow(page);
  await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: false, animations: 'disabled' });
}
async function sizes(page, name, focus) {
  for (const [width, height, label] of viewports) {
    await page.setViewportSize({ width, height });
    if (focus) await focus.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await shot(page, `${name}-${label}`, !focus);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}


test('第八轮：奖励视觉、本地存储与双标签一致性', { timeout: 360000 }, async (t) => {
  mkdirSync(shots,{recursive:true});mkdirSync(path.join(root,'test-results'),{recursive:true});
  execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
  const db=new Database(env.DB_PATH);
  db.prepare("UPDATE courses SET title=title||'（测试课程）'").run();
  const server=spawn(process.execPath,['-e',"require('./app').listen(3127,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
  const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5189','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
  let logs='',browser;
  for(const child of [server,vite]){child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);}
  try {
    await Promise.all([waitFor(base),waitFor(apiBase+'/api/health')]);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
        const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const key='star-voyage:rewards:demo:v1:4';
    const button=(name,p=page)=>p.getByRole('button',{name,exact:true});
    const tab=(name,p=page)=>p.getByRole('tab',{name,exact:true}).click();
    const balance=async(value,p=page)=>{await p.getByTestId('reward-balance').getByText(String(value),{exact:true}).waitFor();await p.getByTestId('header-demo-points').getByText(String(value),{exact:true}).waitFor();};
    const saved=async(p=page)=>(await readRewardAccount(p,4))?.state;
    const gift=async(id='notebook',p=page)=>{await tab('礼品',p);await p.locator('[data-gift='+id+']').getByRole('button',{name:'查看礼品详情',exact:true}).click();};
    const start=async(p=page)=>{await gift('notebook',p);await button('演示兑换',p).click();};
    const close=async(p=page)=>{await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'hidden'});};
    const reset=async(p=page)=>{await button('重置演示数据',p).click();await button('确认重置演示数据',p).click();await p.getByRole('dialog').waitFor({state:'hidden'});await balance(120,p);};
    const sync=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('student-demo-rewards-changed',{detail:{accountId:4}})));
    const scenario=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();}catch(error){failure=error;console.error(page.url(),(await page.locator('body').innerText()).slice(0,6000));await page.screenshot({path:path.join(root,'test-results/round8-failure.png'),fullPage:true});throw error;}});if(failure)throw failure;};
    await login(page);await page.getByTestId('header-demo-points').click();await balance(120);
    await scenario('真实浏览器演示：四标签、三尺寸、详情取消与键盘焦点',async()=>{
      assert.equal((await saved()).records.length,0);
      await sizes(page,'01-gifts-demo-first');
      assert.ok(await page.locator('[data-gift=notebook]').evaluate(el=>el.getBoundingClientRect().top<900));
      await tab('兑换记录');await page.getByText('还没有演示兑换记录',{exact:true}).waitFor();await sizes(page,'02-empty-records-demo-first');
      await tab('积分明细');await page.getByText('演示初始值 · 无发放时间',{exact:true}).waitFor();await sizes(page,'03-ledger-initial-demo-first');
      await tab('徽章');await sizes(page,'04-badges-demo-first');
      for(const [index,id] of [[0,'earned'],[1,'unearned']]){
        const trigger=button('查看徽章详情').nth(index);await trigger.focus();await page.keyboard.press('Enter');
        await sizes(page,'05-badge-'+id+'-demo-modal');await close();assert.ok(await trigger.evaluate(el=>el===document.activeElement));
      }
      await gift();await sizes(page,'06-gift-detail-demo-modal');
      await button('演示兑换').click();await sizes(page,'07-confirm-demo-modal');await button('返回详情').click();await close();await balance(120);assert.equal((await saved()).records.length,0);
      for(const [id,reason,prefix] of [['model','还差 40 演示积分','08-insufficient'],['sticker','演示库存不足','09-out-of-stock']]){
        await gift(id);assert.ok(await button('演示兑换').isDisabled());await page.getByRole('dialog').getByText(reason,{exact:true}).waitFor();await sizes(page,prefix+'-demo-modal');await close();
      }
      await page.getByRole('tab',{name:'礼品',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.locator('#reward-tabs-tab-ledger').getAttribute('aria-selected').then(v=>assert.equal(v,'true'));
    });
    await scenario('事务在 put 成功后中止：失败重试保留同次编号，刷新持久化与原限制',async()=>{
  await failRewardPut(page);
  await start();await button('确认演示兑换').click();await page.getByText('未完成演示兑换',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),1);await balance(120);assert.equal((await saved()).records.length,0);
  const failedId=await page.evaluate(()=>window.rewardAttemptIds.at(-1));assert.ok(failedId);
  await sizes(page,'10-write-failure-injected-modal');
  await restoreRewardPut(page);await button('重试本次兑换').evaluate(el=>{el.click();el.click();});
  await page.getByText('演示兑换成功',{exact:true}).waitFor();await balance(80);
  assert.equal((await saved()).records.length,1);assert.equal((await saved()).records[0].id,failedId);
  await sizes(page,'11-success-demo-modal');await button('查看本次兑换记录').click();await page.getByText('本次兑换',{exact:true}).waitFor();
  await sizes(page,'12-records-demo-first');await tab('积分明细');await sizes(page,'13-ledger-demo-first');
  await page.reload();await balance(80);await start();await button('确认演示兑换').click();await page.getByText('演示兑换成功',{exact:true}).waitFor();await button('返回礼品').click();await balance(40);
  await gift();await page.getByRole('dialog').getByText('已达到演示兑换次数上限',{exact:true}).waitFor();assert.ok(await button('演示兑换').isDisabled());await sizes(page,'14-limit-demo-modal');await close();
});
    await scenario('数据库 getter / 读取 / 损坏 / 重置失败可恢复，不自动覆盖',async()=>{
  await page.evaluate(()=>{window.rewardTestDescriptor=Object.getOwnPropertyDescriptor(window,'indexedDB');Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Injected getter denial','SecurityError');}});});
  await sync();await page.getByTestId('reward-balance').getByText('暂不可读取',{exact:true}).waitFor();assert.match(await page.getByTestId('header-demo-points').innerText(),/—/);await sizes(page,'15-storage-getter-injected-first');
  await page.evaluate(()=>Object.defineProperty(window,'indexedDB',window.rewardTestDescriptor));await button('重试读取').click();await balance(40);
  await page.evaluate(()=>{window.rewardTestTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(this.name==='star-voyage-rewards'&&mode==='readonly')throw new Error('Injected read failure');return window.rewardTestTransaction.call(this,names,mode,...rest);};});
  await sync();await page.getByText(/暂时无法读取奖励数据库/).waitFor();await sizes(page,'16-read-failure-injected-first');
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=window.rewardTestTransaction;});await button('重试读取').click();await balance(40);
  await writeRewardAccount(page,4,{state:{balance:120,records:[null],ledger:[]}});await sync();await page.getByText(/本账号的演示数据损坏/).waitFor();
  assert.deepEqual((await readRewardAccount(page)).state.records,[null]);await sizes(page,'17-corrupt-injected-first');
  await button('重置演示数据').click();await sizes(page,'18-reset-demo-modal');await button('取消').click();assert.deepEqual((await saved()).records,[null]);
  await failRewardPut(page);await button('重置演示数据').click();await button('确认重置演示数据').click();await page.getByText('未完成重置',{exact:true}).waitFor();await sizes(page,'19-reset-failure-injected-modal');
  assert.deepEqual((await saved()).records,[null]);assert.equal(await page.getByRole('dialog').count(),1);
  await restoreRewardPut(page);await button('重试重置').click();await page.getByRole('dialog').waitFor({state:'hidden'});await balance(120);
  assert.equal((await readRewardAccount(page)).initialized,true);
});
    await scenario('实际双标签广播同步：详情、顶栏、列表、焦点及旧版本隔离',async()=>{
  const second=await context.newPage();second.setDefaultTimeout(12000);second.on('pageerror',e=>errors.push(e.message));await second.goto(base+'/archives/rewards');await balance(120,second);
  await gift('model',second);await start();await button('确认演示兑换').click();await page.getByText('演示兑换成功',{exact:true}).waitFor();await balance(80);await balance(80,second);await second.getByRole('dialog').getByText('还差 80 演示积分',{exact:true}).waitFor();
  await close(second);await tab('积分明细',second);await second.locator('.reward-amount strong').getByText('-40',{exact:true}).waitFor();
  await tab('兑换记录',second);await second.getByText('演示兑换成功（不发货）',{exact:true}).waitFor();
  await button('返回礼品').click();await reset();await balance(120,second);assert.equal(await second.getByRole('tab',{name:'兑换记录',exact:true}).getAttribute('aria-selected'),'true');await second.getByText('还没有演示兑换记录',{exact:true}).waitFor();
  // A direct fixture write omits invalidation. Returning focus must read the database.
  const source=await saved();source.balance=80;source.records=[{id:'focus-case',giftId:'notebook',title:'探索笔记本（演示）',cost:40,time:'2026-01-02T03:04:00Z',status:'演示兑换成功（不发货）'}];
  source.ledger.unshift({id:'focus-case',title:'演示兑换：探索笔记本（演示）',amount:-40,time:'2026-01-02T03:04:00Z'});
  await writeRewardAccount(second,4,{state:source});await second.evaluate(()=>window.dispatchEvent(new Event('focus')));await balance(80,second);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await balance(80);
  await second.evaluate(k=>localStorage.setItem(k,JSON.stringify({balance:0,records:[],ledger:[]})),key);
  await page.getByText(/检测到旧页面更改了旧版演示记录/).waitFor();await balance(80);
  await reset();await balance(120,second);await second.close();
});
    await scenario('实际 IndexedDB 事务：兑换→重置、重置→兑换、竞争最后限兑与两页一致',async()=>{
  const second=await context.newPage();second.setDefaultTimeout(12000);await second.goto(base+'/archives/rewards');await balance(120,second);
  const prepare=async()=>{await watchRewardTransactions(page);await watchRewardTransactions(second);await holdRewardDatabase(second);};
  await prepare();await start();await button('确认演示兑换').click();await waitRewardWrite(page);await button('重置演示数据',second).click();await button('确认重置演示数据',second).click();await waitRewardWrite(second);
  assert.equal(await page.getByText('演示兑换成功',{exact:true}).count(),0);
  await releaseRewardDatabase(second);await balance(120);await balance(120,second);await second.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('演示记录已变化',{exact:true}).waitFor();await button('返回礼品').click();
  assert.equal((await saved()).records.length,0);assert.equal((await saved()).ledger.length,1);
  await prepare();await button('重置演示数据',second).click();await button('确认重置演示数据',second).click();await waitRewardWrite(second);
  await start();await button('确认演示兑换').click();await waitRewardWrite(page);await releaseRewardDatabase(second);
  await page.getByText('演示兑换成功',{exact:true}).waitFor();await balance(80);await balance(80,second);assert.equal((await saved()).records.length,1);assert.equal((await saved()).ledger.length,2);await button('返回礼品').click();
  await prepare();await start();await start(second);await button('确认演示兑换').click();await button('确认演示兑换',second).click();await waitRewardWrite(page);await waitRewardWrite(second);await releaseRewardDatabase(second);
  await balance(40);await balance(40,second);assert.equal((await saved()).records.length,2);assert.equal((await saved()).ledger.length,3);
  await page.waitForFunction(()=>document.querySelector('.reward-modal .ant-btn-loading')===null);
  await second.waitForFunction(()=>document.querySelector('.reward-modal .ant-btn-loading')===null);
  assert.equal(await page.getByText('未完成演示兑换',{exact:true}).count()+await second.getByText('未完成演示兑换',{exact:true}).count(),1);
  await close();await close(second);await reset();await balance(120,second);await second.close();
});
    await scenario('离开/退出中止尚未提交事务，已提交事实保留，账号隔离且不依赖 Web Locks',async()=>{
  const holder=await context.newPage();await holder.goto(base+'/archives/rewards');await balance(120,holder);
  await watchRewardTransactions(page);await holdRewardDatabase(holder);await start();await button('确认演示兑换').click();await waitRewardWrite(page);
  await page.evaluate(()=>{history.pushState({},'', '/archives');window.dispatchEvent(new PopStateEvent('popstate'));});
  await page.locator('.archive-workspace').waitFor();await releaseRewardDatabase(holder);assert.equal((await saved()).records.length,0);assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByTestId('header-demo-points').click();await balance(120);await watchRewardTransactions(page);await holdRewardDatabase(holder);await start();await button('确认演示兑换').click();await waitRewardWrite(page);
  await holder.evaluate(()=>{localStorage.removeItem('token');localStorage.removeItem('refresh_token');localStorage.removeItem('user');});
  await page.waitForURL('**/login');await releaseRewardDatabase(holder);assert.equal((await saved()).records.length,0);await holder.close();
  await login(page,'student_chen');await page.getByTestId('header-demo-points').click();await balance(120);assert.equal(await page.getByRole('dialog').count(),0);
  await page.evaluate(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}));
  await start();await button('确认演示兑换').click();await page.getByText('演示兑换成功',{exact:true}).waitFor();await balance(80);await button('返回礼品').click();
  assert.equal((await readRewardAccount(page,5)).state.records.length,1);assert.equal((await saved()).records.length,0);
  await page.evaluate(()=>delete navigator.locks);
  await button('个人中心').click();await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();await login(page);await page.getByTestId('header-demo-points').click();await balance(120);
  for(const [username,password] of [['adminpbl','admin123'],['mentor_zhang','mentor123'],['teacher_li','teacher123']]){
    const other=await browser.newPage();await login(other,username,password);assert.equal(await other.locator('.student-pixel').count(),0);await other.goto(base+'/archives/rewards');await other.getByText('当前身份无法访问此页面',{exact:true}).waitFor();assert.equal(await other.locator('.reward-workspace,.reward-modal-root').count(),0);await other.close();
  }
  assert.deepEqual(errors,[]);
});
    await scenario('长历史与窄屏分页、弹窗焦点约束、素材正常加载',async()=>{
      const initial=await saved();
      const records=Array.from({length:11},(_,i)=>({id:'history-'+i,giftId:'notebook',title:'探索笔记本（演示）— 历史兼容布局测试，较长名称仍应完整换行 '+i,cost:40,time:'2026-01-02T03:04:00.000Z',status:'演示兑换成功（不发货）'}));
      await writeRewardAccount(page,4,{state:{...initial,records}});await sync();
      await tab('兑换记录');await page.getByRole('listitem',{name:'2',exact:true}).click();assert.equal(await page.locator('.reward-record-list>li').count(),3);await sizes(page,'20-long-records-fixture-scrolled',page.locator('.reward-history'));
      await reset();await gift();await page.setViewportSize({width:390,height:844});
      for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.ant-modal')));}
      await visibleAction(button('演示兑换'));await noOverflow(page);await close();await page.setViewportSize({width:1440,height:900});
      assert.equal(await page.locator('.reward-art img').evaluateAll(imgs=>imgs.filter(img=>!img.complete||!img.naturalWidth).length),0);
      assert.deepEqual(errors,[]);
    });

    await scenario('拒绝存储后首次挂载奖励页仍可重试，背景更新保留标签与滚动',async()=>{
      await page.locator('.study-header-context a').click();await page.locator('.archive-counts dd').first().waitFor();
      await page.evaluate(()=>{window.rewardTestDescriptor=Object.getOwnPropertyDescriptor(window,'indexedDB');Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Injected getter denial before reward mount','SecurityError');}});});
      await page.getByTestId('header-demo-points').click();await page.getByTestId('reward-balance').getByText('暂不可读取',{exact:true}).waitFor();assert.equal(await page.locator('.reward-workspace').count(),1);
      await page.evaluate(()=>Object.defineProperty(window,'indexedDB',window.rewardTestDescriptor));await button('重试读取').click();await balance(120);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.setViewportSize({width:390,height:844});
      // Establish the narrow-screen scroll position after responsive layout has settled.
      const before=await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.querySelector('[data-gift=sticker]').scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(r));return scrollY;});
      await sync();await balance(120);const after=await page.evaluate(()=>scrollY);assert.ok(Math.abs(after-before)<2, `背景读取保留滚动：${before} → ${after}`);await tab('徽章');await sync();assert.equal(await page.locator('#reward-tabs-tab-badges').getAttribute('aria-selected'),'true');await page.setViewportSize({width:1440,height:900});assert.deepEqual(errors,[]);
    });
  } finally {if(browser)await browser.close();server.kill();vite.kill();db.close();writeFileSync(path.join(root,'test-results/round8-server.log'),logs);}
});
