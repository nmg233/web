import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const Database = require('better-sqlite3');
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round6-'));
const delivery = process.env.ROUND6_CAPTURE_DELIVERY === '1';
const shots = path.join(root, delivery ? 'docs/round-06/screenshots' : 'test-results/round6');
const base = 'http://127.0.0.1:5187';
const apiBase = 'http://127.0.0.1:3125';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round6.db'),
  // 此套件将浏览器快进 10 分钟验证计算超时，避免与真实 15 分钟凭据的提前刷新互相干扰。
  // 仅临时库沿用既有可配置项；真实默认凭据轮换由 round10/round11 独立验证。
  JWT_ACCESS_EXPIRES_IN: '60', JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
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
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
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

test('第六轮：实验室、真实试飞、局部状态及作品课程边界', { timeout: 480000 }, async (t) => {
  mkdirSync(shots,{recursive:true}); mkdirSync(path.join(root,'test-results'),{recursive:true});
  execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
  const db=new Database(env.DB_PATH);
  db.prepare("UPDATE courses SET title='实验探究（测试课程）' WHERE id IN (1,2)").run();
  db.prepare("UPDATE courses SET status='published' WHERE id=2").run();
  db.prepare("INSERT OR IGNORE INTO enrollments(student_id,course_id,status) VALUES(4,2,'active')").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,summary,content,sort_order,status,created_by) VALUES(1,1,'观察条件（测试卡片）','用于往返验收','合成测试内容',1,'published',2),(2,1,'调整与验证（测试卡片）','指定第二张卡片','不是正式课程内容',2,'published',2)").run();
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,reject_reason,version) VALUES(51,4,1,1,'最新退回作品（测试）','正文应直接开始，没有孤立零','rejected','请补充依据',1),(52,4,1,2,'历史退回作品（测试）','历史内容','rejected','请补充依据',1)").run();
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,parent_work_id,version) VALUES(53,4,1,2,'已修改新版（测试）','新版本内容','pending',52,2)").run();
  const enrollment2=db.prepare('SELECT id FROM enrollments WHERE student_id=4 AND course_id=2').get().id;
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,title,description) VALUES(54,4,?,'同名另一课程作品（测试）','另一课程的作品')").run(enrollment2);
  const server=spawn(process.execPath,['-e',"require('./app').listen(3125,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
  const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5187','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
  let logs='',browser;
  for(const child of [server,vite]) {child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);}
  try {
    await Promise.all([waitFor(base),waitFor(apiBase+'/api/health')]);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const page=await context.newPage(); page.setDefaultTimeout(15000);
    const errors=[],posts=[],reads=[]; let realId,realRecord;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/glider/simulate'))posts.push(request.postDataJSON());if(/\/glider\/simulations\/\d+$/.test(request.url()))reads.push(request.url());});
    const scenario=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();}catch(e){failure=e;console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>({hidden:[...document.querySelectorAll('[aria-hidden=true],[inert]')].map(e=>[e.tagName,e.className]),buttons:[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('刷新')).map(b=>b.outerHTML)})));await page.screenshot({path:path.join(root,'test-results/round6-failure.png'),fullPage:true});throw e;}});if(failure)throw failure;};
    const historyEntry=(id)=>page.getByRole('button',{name:new RegExp(`^#${id}\\b`)});
    const open=(id)=>historyEntry(id).click();
    const imageReady=async(title)=>{await page.getByRole('img',{name:title,exact:true}).waitFor();await page.waitForFunction(title=>{const i=[...document.images].find(i=>i.alt===title);return i&&i.complete&&i.naturalWidth>0;},title);};
    await page.clock.install();
    await login(page);
    await scenario('真实接口：实验选择、默认参数、空历史与三尺寸',async()=>{
      await page.goto(base+'/lab'); await page.getByRole('button',{name:'开始实验',exact:true}).waitFor();
      assert.equal(await page.locator('.lab-experiment').count(),1);
      await sizes(page,'01-lab-real-first');
      await page.getByRole('button',{name:'开始实验',exact:true}).click();
      await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor({timeout:60000});
      assert.equal(await page.locator('input[role=spinbutton]').count(),7);
      const defaults={dihedral:'5',cg:'0',speed:'36',wing_area:'17.5',mass:'420',elevator:'0',rudder:'0'};
      for(const [id,value] of Object.entries(defaults))assert.equal(Number(await page.locator('#'+id).inputValue()),Number(value));
      await sizes(page,'02-parameters-real-first');
      await page.getByText('还没有试飞记录，先设计一架试试吧',{exact:true}).waitFor();
      await page.locator('.flight-history').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await shot(page,'02-empty-history-real-desktop-scrolled',false);
    });
    await scenario('真实参考引擎：七参数映射、自由空关联、六指标及两张科学图',async()=>{
      await page.locator('#dihedral').fill('6'); await page.locator('#cg').fill('0.2'); await page.locator('#speed').fill('38');
      await page.getByText('机身与尾翼（进阶 · 4 项）',{exact:true}).click();
      for(const [id,value] of Object.entries({wing_area:'18',mass:'430',elevator:'-0.5',rudder:'0.5'}))await page.locator('#'+id).fill(value);
      await sizes(page,'02-advanced-real-scrolled',page.locator('.flight-parameters .ant-collapse').first());
      await page.getByText('机身与尾翼（进阶 · 4 项）',{exact:true}).click();
      await visibleAction(page.getByRole('button',{name:'开始试飞',exact:true}));
      await page.getByRole('button',{name:'开始试飞',exact:true}).click();
      await page.getByText('计算成功',{exact:true}).waitFor({timeout:90000});
      assert.deepEqual(posts[0],{dihedral_deg:6,cg_x:0.2,speed:38,wing_area:18,mass:430,elevator_deg:-0.5,rudder_deg:0.5});
      const row=db.prepare('SELECT * FROM glider_simulations WHERE student_id=4 ORDER BY id DESC LIMIT 1').get();
      realId=row.id;assert.equal(row.status,'success');assert.equal(row.course_id,null);assert.equal(row.lesson_id,null);
      realRecord={...row,id:row.id,glide_time_s:row.glide_time,result:JSON.parse(row.summary_json)};
      assert.equal(await page.locator('.flight-metrics > div').count(),6);
      await imageReady('三维航迹');await imageReady('飞行遥测');
      assert.equal(await page.getByRole('img',{name:'三维航迹',exact:true}).evaluate(el=>getComputedStyle(el).imageRendering),'auto');
      await sizes(page,'04-success-reference-scrolled',page.locator('.flight-result-anchor'));
      await sizes(page,'04-trajectory-reference-scrolled',page.locator('[data-file="trajectory3d.png"]'));
      await sizes(page,'05-history-real-scrolled',page.locator('.flight-history'));
      await page.setViewportSize({width:390,height:844});
      await visibleAction(page.getByRole('button',{name:'放大查看三维航迹',exact:true}));
      await page.getByRole('button',{name:'放大查看三维航迹',exact:true}).focus();await page.keyboard.press('Enter');
      await page.locator('.ant-image-preview').waitFor();
      assert.ok(await page.locator('.ant-image-preview').evaluate(el=>{const box=el.getBoundingClientRect();const hit=document.elementFromPoint(innerWidth/2,innerHeight/2);return box.width>0&&el.contains(hit);}));
      await shot(page,'04-chart-preview-real-mobile-scrolled',false);
      await page.keyboard.press('Escape');await page.locator('.ant-image-preview').waitFor({state:'hidden'});
      await page.setViewportSize({width:1440,height:900});
      writeFileSync(path.join(root,delivery ? 'docs/round-06/real-flight.json' : 'test-results/round6-real-flight.json'),JSON.stringify({engine:'reference',parameters:posts[0],recordId:realId,state:row.state,metrics:realRecord.result,glide_time_s:row.glide_time,course_id:row.course_id,lesson_id:row.lesson_id},null,2));
    });
    await scenario('同条重开、独立文件重试、历史参数与编辑值不混淆',async()=>{
      await page.locator('#speed').fill('42');
      await open(realId); await imageReady('三维航迹');
      const n=reads.length;await historyEntry(realId).focus();await page.keyboard.press('Enter');await imageReady('三维航迹');assert.ok(reads.length>n);
      assert.equal(await page.locator('#speed').inputValue(),'42');
      await page.getByText(`试飞 #${realId} 使用的参数`,{exact:true}).click();
      assert.match(await page.locator('.flight-snapshot-grid').innerText(),/38 m\/s/);
      let blocked=true;
      await page.route('**/glider/simulations/*/files/trajectory3d.png',route=>blocked?route.fulfill({status:404,json:{error:'结果文件不存在（故障注入）'}}):route.continue());
      await page.getByRole('button',{name:'重新读取本条记录',exact:true}).click();
      await page.getByText('三维航迹暂时无法加载',{exact:true}).waitFor();await imageReady('飞行遥测');
      assert.equal(await page.locator('#speed').inputValue(),'42'); assert.equal(await page.locator('.flight-metrics > div').count(),6);
      await sizes(page,'06-file-404-injected-scrolled',page.locator('[data-file="trajectory3d.png"]'));
      const beforePosts=posts.length;blocked=false;await page.getByRole('button',{name:'重试三维航迹',exact:true}).click();await imageReady('三维航迹');assert.equal(posts.length,beforePosts);
      await page.unroute('**/glider/simulations/*/files/trajectory3d.png');
    });
    await scenario('故障注入：运行/超时恢复/三次读取失败/迟到响应/缺失与零',async()=>{
      const running=(id)=>({...realRecord,id,status:'running',result:null,created_at:'2026-10-03 08:00:00'});
      const items=[running(901),running(902),{...realRecord}];let fail=false,lateResolve;
      await page.route('**/api/glider/simulations',r=>r.fulfill({json:{items}}));
      await page.route('**/api/glider/simulations/901',async r=>{if(fail)return r.fulfill({status:503,json:{error:'受控读取失败'}});await r.fulfill({json:running(901)});});
      await page.route('**/api/glider/simulations/902',r=>r.fulfill({json:running(902)}));
      await page.getByRole('button',{name:'刷新记录',exact:true}).click();await open(901);
      await page.getByText('正在计算飞行轨迹与图表',{exact:true}).waitFor();
      await sizes(page,'03-running-injected-scrolled',page.locator('.flight-result-anchor'));
      await page.clock.fastForward(300000);
      await page.getByText('等待已超过 5 分钟',{exact:true}).waitFor();
      await shot(page,'07-timeout-injected-desktop-scrolled',false);
      await open(902);await page.getByText('正在计算飞行轨迹与图表',{exact:true}).waitFor();assert.equal(await page.getByText('等待已超过 5 分钟',{exact:true}).count(),0);
      await page.clock.fastForward(300000);await page.getByText('等待已超过 5 分钟',{exact:true}).waitFor();
      await page.route('**/api/glider/simulate',r=>r.fulfill({json:{id:902}}));
      await page.getByRole('button',{name:'开始试飞',exact:true}).click();await page.getByText('正在计算飞行轨迹与图表',{exact:true}).waitFor();assert.equal(await page.getByText('等待已超过 5 分钟',{exact:true}).count(),0);
      await page.unroute('**/api/glider/simulate');
      fail=true;await Promise.all([page.waitForResponse(r=>r.url().endsWith('/simulations/901')&&r.status()===503),open(901)]);
      await page.clock.runFor(2100);await page.waitForTimeout(100);await page.clock.runFor(2100);
      await page.getByText('暂时读不到模拟状态',{exact:true}).waitFor();
      const beforePosts=posts.length;fail=false;await page.getByRole('button',{name:'重试读取',exact:true}).click();await page.getByText('正在计算飞行轨迹与图表',{exact:true}).waitFor();assert.equal(posts.length,beforePosts);
      await page.unroute('**/api/glider/simulations/901');
      await page.route('**/api/glider/simulations/901',r=>new Promise(resolve=>{lateResolve=()=>r.fulfill({json:{...realRecord,id:901,status:'error',error:'迟到旧记录（不得显示）'}}).then(resolve); }));
      await open(901);while(!lateResolve)await page.waitForTimeout(20);await open(realId);await imageReady('三维航迹');await lateResolve();await page.waitForTimeout(100);assert.equal(await page.getByText('迟到旧记录（不得显示）',{exact:true}).count(),0);
      await page.unroute('**/api/glider/simulations/901');await page.unroute('**/api/glider/simulations/902');await page.unroute('**/api/glider/simulations');
      await page.route(`**/api/glider/simulations/${realId}`,r=>r.fulfill({json:{...realRecord,state:'crashed(roll)',glide_time_s:null,result:{alt_end:0}}}));
      await page.getByRole('button',{name:'重新读取本条记录',exact:true}).click();await page.getByText('结果：横滚失控坠毁',{exact:true}).waitFor();await page.getByText('计算成功',{exact:true}).waitFor();
      assert.equal(await page.locator('.flight-metrics dd').first().innerText(),'—s');assert.equal(await page.locator('.flight-metrics dd').last().innerText(),'0m');
      await page.unroute(`**/api/glider/simulations/${realId}`);
      await page.reload();await page.getByRole('button',{name:'开始试飞',exact:true}).waitFor();
    });
    await scenario('环境/提交/历史/计算失败可恢复，失败不清空参数',async()=>{
      await page.route('**/api/glider/capabilities',r=>r.fulfill({status:503,json:{error:'环境检查注入失败'}}));await page.reload();await page.getByText(/无法确认实验环境/).waitFor();assert.ok(await page.getByRole('button',{name:'开始试飞',exact:true}).isDisabled());
      await page.unroute('**/api/glider/capabilities');await page.getByRole('button',{name:'重新检查环境',exact:true}).click();await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();
      await page.route('**/api/glider/simulate',r=>r.fulfill({status:503,json:{error:'提交注入失败'}}));await page.locator('#speed').fill('41');await page.getByRole('button',{name:'开始试飞',exact:true}).click();await page.getByText('提交注入失败',{exact:true}).waitFor();assert.equal(await page.locator('#speed').inputValue(),'41');await page.unroute('**/api/glider/simulate');
      await page.route('**/api/glider/simulations',r=>r.fulfill({status:503,json:{error:'历史注入失败'}}));await page.getByRole('button',{name:'刷新记录',exact:true}).click();await page.getByText('试飞记录加载失败，请重试。',{exact:true}).waitFor();await page.unroute('**/api/glider/simulations');await page.getByRole('button',{name:'重试加载记录',exact:true}).click();await historyEntry(realId).waitFor();
      await page.route(`**/api/glider/simulations/${realId}`,r=>r.fulfill({json:{...realRecord,status:'error',error:'计算失败（受控测试）'}}));await open(realId);await page.getByText('本次计算失败',{exact:true}).waitFor();await page.unroute(`**/api/glider/simulations/${realId}`);
      await page.locator('#speed').fill('');await page.getByRole('button',{name:'开始试飞',exact:true}).click();await page.waitForTimeout(100);assert.ok(await page.locator('#speed').evaluate(el=>document.activeElement===el));
    });
    await scenario('旧 MP4：真实签名与视频播放，媒体内容为兼容性测试夹具',async()=>{
      const folder=path.join(env.UPLOAD_PATH,'glider',String(realId));
      execFileSync('ffmpeg',['-y','-f','lavfi','-i','color=c=navy:s=320x180:d=2','-c:v','libx264','-pix_fmt','yuv420p',path.join(folder,'flight_replay.mp4')],{stdio:'pipe',windowsHide:true});
      const summary=JSON.parse(db.prepare('SELECT summary_json FROM glider_simulations WHERE id=?').get(realId).summary_json);
      db.prepare('UPDATE glider_simulations SET summary_json=? WHERE id=?').run(JSON.stringify({...summary,files:{...summary.files,video:'flight_replay.mp4'}}),realId);
      await open(realId);await page.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
      assert.match(await page.locator('video').getAttribute('src'),/sig=/);await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>0);
      db.prepare('UPDATE glider_simulations SET summary_json=? WHERE id=?').run(JSON.stringify(summary),realId);
    });
    await scenario('真实来源核验：卡片精确返回、固定关联、卡片/课时/课程失效回退',async()=>{
      await page.goto(base+'/courses/1/lessons/1/learn');await page.getByRole('button',{name:'我已完成课堂回顾',exact:true}).click();await page.getByRole('button',{name:'我已学完本卡片',exact:true}).click();
      await page.getByRole('heading',{name:'调整与验证（测试卡片）',exact:true}).waitFor();await page.getByRole('button',{name:'滑翔机实验（测试关联）',exact:true}).click();
      await page.getByRole('button',{name:'返回来源课程',exact:true}).waitFor();await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();
      await sizes(page,'08-course-source-real-first');
      await page.getByText('查看固定课程关联',{exact:true}).click();assert.ok(await page.locator('#course_id').isDisabled());assert.ok(await page.locator('#lesson_id').isDisabled());
      await page.route('**/api/glider/simulate',r=>r.fulfill({status:503,json:{error:'关联提交边界验收，不新建试飞'}}));await page.getByRole('button',{name:'开始试飞',exact:true}).click();await page.getByText('关联提交边界验收，不新建试飞',{exact:true}).waitFor();assert.equal(posts.at(-1).course_id,1);assert.equal(posts.at(-1).lesson_id,1);await page.unroute('**/api/glider/simulate');
      const sourceUrl=page.url();await page.getByRole('button',{name:'返回来源课程',exact:true}).click();await page.waitForURL('**/learn?stage=1&cardId=2');await page.getByRole('heading',{name:'调整与验证（测试卡片）',exact:true}).waitFor();
      await page.goto(sourceUrl);await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();db.prepare("UPDATE knowledge_cards SET status='draft' WHERE id=2").run();await page.getByRole('button',{name:'返回来源课程',exact:true}).click();await page.waitForURL('**/courses/1');await page.getByText(/原知识卡片已不可访问/).first().waitFor();db.prepare("UPDATE knowledge_cards SET status='published' WHERE id=2").run();
      await page.goto(sourceUrl);await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();db.prepare("UPDATE lessons SET status='cancelled' WHERE id=1").run();await page.getByRole('button',{name:'返回来源课程',exact:true}).click();await page.waitForURL('**/courses/1');db.prepare("UPDATE lessons SET status='scheduled' WHERE id=1").run();
      await page.goto(sourceUrl);await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();await page.getByRole('button',{name:'返回来源课程',exact:true}).click();await page.waitForURL('**/lab');await page.getByText(/来源课程已撤回/).first().waitFor();await shot(page,'09-source-withdrawn-real-desktop-first');db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
      assert.equal(db.prepare('SELECT COUNT(*) n FROM works WHERE student_id=4').get().n,4);assert.equal(db.prepare('SELECT COUNT(*) n FROM glider_simulations WHERE student_id=4').get().n,1);
    });
    await scenario('最新退回无孤立0、历史已修改；列表搜索、同名课程筛选及失效清理',async()=>{
      await page.goto(base+'/works/51');await page.getByText('正文应直接开始，没有孤立零',{exact:true}).waitFor();
      assert.equal(await page.locator('.study-section').first().evaluate(el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()==='0').length),0);
      await page.getByRole('button',{name:'修改后重新提交',exact:true}).waitFor();await shot(page,'10-rejected-real-desktop-first');
      await page.goto(base+'/works/52');await page.getByText('此版本已修改',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'修改后重新提交',exact:true}).count(),0);
      await page.goto(base+'/works');await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor();await page.getByRole('link',{name:'同名另一课程作品（测试）',exact:true}).waitFor();
      await page.getByPlaceholder('搜索作品',{exact:true}).fill('同名另一');await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor({state:'hidden'});await page.getByRole('link',{name:'同名另一课程作品（测试）',exact:true}).waitFor();await page.getByPlaceholder('搜索作品',{exact:true}).fill('');
      await page.getByRole('combobox').click();await page.locator('.ant-select-item-option').first().click();await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'同名另一课程作品（测试）',exact:true}).count(),0);
      db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('筛选课程已不可访问，相关作品已清除。',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).count(),0);
      await page.goto(base+'/works/51');await page.getByText(/该作品所属课程已不可访问/).waitFor();assert.equal(await page.getByText('正文应直接开始，没有孤立零',{exact:true}).count(),0);
      db.prepare("UPDATE courses SET status='published' WHERE id=1").run();await page.goto(base+'/works');await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor();db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4 AND course_id=1").run();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor({state:'hidden'});await page.getByRole('link',{name:'同名另一课程作品（测试）',exact:true}).waitFor();
      await page.goto(base+'/works/51');await page.getByText(/该作品所属课程已不可访问/).waitFor();
      db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4").run();await page.goto(base+'/works');await page.getByText(/暂无作品记录/).waitFor();assert.equal(await page.locator('.archive-work-row').count(),0);
      await page.goto(base+'/glider');await page.getByText('实验环境就绪，可以开始试飞。',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'开始试飞',exact:true}).isEnabled());
      db.prepare("UPDATE enrollments SET status='active' WHERE student_id=4").run();
      await page.route('**/api/works?**',r=>r.fulfill({status:503,json:{error:'作品列表读取失败（注入）'}}));await page.goto(base+'/works');await page.locator('.ant-result-subtitle').filter({hasText:'作品列表读取失败（注入）'}).waitFor();await page.unroute('**/api/works?**');
    });
    await scenario('管理员/执行导师保留原布局、记录范围与作品入口',async()=>{
      for(const [username,password] of [['adminpbl','admin123'],['mentor_zhang','mentor123']]){
        const p=await browser.newPage();await login(p,username,password);await p.goto(base+'/glider');await p.getByText('滑翔机试飞记录（只读视图）',{exact:true}).waitFor();assert.equal(await p.locator('.lab-workspace').count(),0);assert.equal(await p.getByRole('button',{name:'开始试飞',exact:true}).count(),0);if(username==='adminpbl'){await p.locator('.ant-list-item').filter({hasText:'#'+realId}).click();await p.getByText('结果：',{exact:false}).waitFor();}else{assert.equal(await p.locator('.ant-list-item').filter({hasText:'#'+realId}).count(),0,'导师不能读取无课程的独立试飞');}await p.goto(base+'/works');await p.getByRole('heading',{name:'作品管理',exact:true}).waitFor();await p.getByRole('link',{name:'最新退回作品（测试）',exact:true}).waitFor();await p.close();
      }
    });
    assert.deepEqual(errors,[],'无浏览器未捕获异常');
    console.log('Real reference result:',realId,realRecord.state,realRecord.glide_time_s);
  } catch(e){console.error(logs.slice(-5000));throw e;}
  finally {await browser?.close();server.kill();vite.kill();db.close();}
});
