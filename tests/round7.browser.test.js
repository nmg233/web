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
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round7-'));
const shots = path.join(root, process.env.ROUND7_CAPTURE_DELIVERY === '1' ? 'docs/round-07/screenshots' : 'test-results/round7');
const base = 'http://127.0.0.1:5188';
const apiBase = 'http://127.0.0.1:3126';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round7.db'),
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

test('第七轮：档案、成果浏览与独立反思，隔离真实 API', { timeout: 480000 }, async (t) => {
  mkdirSync(shots,{recursive:true}); mkdirSync(path.join(root,'test-results'),{recursive:true});
  execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe'});
  const db=new Database(env.DB_PATH);
  db.prepare("UPDATE courses SET title='观察与迭代：从证据出发完善方案（测试课程）',status='published' WHERE id IN(1,2)").run();
  db.prepare("UPDATE courses SET title='未发布课程（仅测试，不得显示）' WHERE id=3").run();
  db.prepare("UPDATE users SET real_name='认真记录每一次尝试的探索者（合成学生）',school_id=NULL,class_id=NULL,teacher_id=3 WHERE id=4").run();
  db.prepare("UPDATE users SET teacher_id=3 WHERE id=5").run();
  db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(4,2,'active'),(4,3,'active')").run();
  const e2=db.prepare('SELECT id FROM enrollments WHERE student_id=4 AND course_id=2').get().id;
  const e3=db.prepare('SELECT id FROM enrollments WHERE student_id=4 AND course_id=3').get().id;
  db.prepare("INSERT INTO lessons(id,course_id,title,sort_order,duration) VALUES(4,1,'没有作品任务的观察课（测试）',4,45),(5,2,'另一门课程的课时（测试）',1,45)").run();
  db.prepare("INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,1),(4,4)").run();
  db.prepare("INSERT INTO lesson_learning_reports(id,student_id,lesson_id,enrollment_id,summary,status,version,score,review_comment,reviewer_id,submitted_at,reviewed_at) VALUES(1,4,1,1,'真实报告合成内容','approved',1,88,'报告已通过，作品仍可独立修改',2,'2026-01-02 01:00:00','2026-01-03 01:00:00'),(2,4,4,1,'无作品任务也有报告','approved',2,0,'请补充观察依据（零分边界测试）',2,'2026-01-04 01:00:00','2026-01-05 01:00:00')").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES(1,4,'无任务课时卡片（测试）','合成学习材料',1,'published',2),(2,5,'另一课程卡片（测试）','合成学习材料',1,'published',2)").run();
  db.prepare("INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,1,'2026-01-01 01:00:00'),(4,2,'2026-01-01 01:00:00')").run();
  const insertWork=db.prepare('INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,parent_work_id,version,created_at) VALUES(?,4,?,?,?,?,?,?,?,?)');
  [[51,1,1,'观察记录初稿（测试）','观察条件有待补充','rejected',null,1],[52,1,1,'观察记录第二版：补充控制条件、数据与判断依据（测试）','改进后的记录','rejected',51,2],[53,1,2,'需要修改的设计方案（测试）','设计仍需修改','rejected',null,1],[54,1,3,'等待导师反馈的模型（测试）','已提交模型文字','pending',null,1],[55,e2,null,'同名另一课程的作品（测试）','按ID区分','approved',null,1],[56,e3,null,'不可访问课程的旧作品（不得显示）','不能泄露','approved',null,1]].forEach((row,i)=>insertWork.run(...row,`2026-01-${String(10+i).padStart(2,'0')} 01:00:00`));
  db.prepare("INSERT INTO work_reviews(work_id,reviewer_id,comment,suggestion,problem_discovery,solution_design,hands_on,data_analysis,presentation) VALUES(52,2,'记录更完整了','继续比较多个条件',4,4,3,4,3),(56,2,'不可访问旧评语','不可访问建议',5,5,5,5,5)").run();
  db.prepare("INSERT INTO reflections(id,student_id,enrollment_id,lesson_id,difficulty,solution,improvement,new_question,created_at) VALUES(11,4,1,1,'难以解释第一次观察结果','记录多个条件','学会保留判断依据','下次要怎样减少误差？','2026-01-12 01:00:00'),(12,4,?,5,'第二门课的反思（测试）',NULL,NULL,NULL,'2026-01-13 01:00:00'),(13,4,?,NULL,'不可访问反思（不得显示）',NULL,NULL,NULL,'2026-01-14 01:00:00')").run(e2,e3);
  db.prepare("INSERT INTO evaluations(student_id,enrollment_id,evaluator_id,eval_type,score,comment) VALUES(4,1,2,'process',NULL,'你开始主动记录失败的原因，下一次试着说明调整依据。'),(4,?,2,'outcome',90,'另一门课程的成果评价（测试）'),(4,?,2,'outcome',99,'不可访问评价（不得显示）')").run(e2,e3);
  db.prepare("INSERT INTO growth_records(student_id,event_type,description,work_id,recorded_by,created_at) VALUES(4,'system','提交作品《观察记录初稿（测试）》',51,NULL,'2026-01-10 01:00:00'),(4,'teacher','你愿意倾听不同解释，并用证据讨论自己的判断。',NULL,2,'2026-01-18 01:00:00'),(4,'system','旧课程里累计完成的秘密（不得显示）',NULL,NULL,'2026-01-19 01:00:00'),(4,'system','撤回课程作品事件（不得显示）',56,NULL,'2026-01-20 01:00:00')").run();
  const server=spawn(process.execPath,['-e',"require('./app').listen(3126,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
  const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5188','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
  let logs='',browser;
  for(const child of [server,vite]){child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);}
  try {
    await Promise.all([waitFor(base),waitFor(apiBase+'/api/health')]);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}); page.setDefaultTimeout(12000);
    const errors=[],learningReads=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/\/api\/learning\/lessons\/\d+$/.test(r.url()))learningReads.push(r.url());});
    const scenario=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();}catch(error){failure=error;console.error(page.url(),(await page.locator('body').innerText()).slice(0,5000));await page.screenshot({path:path.join(root,'test-results/round7-failure.png'),fullPage:true});throw error;}});if(failure)throw failure;};
    const select=async(id,text)=>{await page.locator('#'+id).click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:text}).click();};
    const tab=async(name)=>{await page.getByRole('tab',{name,exact:true}).click();};
    const overview=async()=>{await page.goto(base+'/archives');await page.locator('.archive-counts dd').first().waitFor();};
    const counts=()=>page.locator('.archive-counts dd').allTextContents();
    await login(page);
    await scenario('自动加载、同名课程、真实记录与聚合范围，三尺寸概览',async()=>{
      learningReads.length=0;await overview();
      assert.deepEqual(await counts(),['2','4','1','2','2']);
      assert.equal(learningReads.length,0);assert.equal(await page.getByRole('button',{name:'查看我的档案',exact:true}).count(),0);
      await page.getByText('学校未提供 · 班级未提供',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'添加成长记录',exact:true}).count(),0);
      assert.ok(!((await page.locator('body').innerText()).includes('不得显示')));
      await sizes(page,'01-overview-real-first');
      assert.ok(await page.locator('.archive-course-list').evaluate(el=>el.getBoundingClientRect().top<900));
      await tab('作品与迭代');assert.equal(await page.locator('.archive-work-row').count(),5);
      assert.match(await page.locator('.archive-work-row').filter({hasText:'观察记录初稿'}).innerText(),/已修改/);
      assert.match(await page.locator('.archive-work-row').filter({hasText:'需要修改'}).innerText(),/查看反馈并修改/);
      await sizes(page,'02-archive-works-real-scrolled',page.locator('.archive-tabs'));
    });
    await scenario('报告按需读取，无作品任务课时与真实零分，报告作品独立',async()=>{
      await tab('课程记录');await select('archive-course','#1');await page.locator('#archive-lesson').waitFor();assert.equal(learningReads.length,0);
      await select('archive-lesson','没有作品任务');await page.getByText('报告评分：0 分',{exact:true}).waitFor();assert.ok(learningReads.length<=2);assert.ok(learningReads.every(url=>url.endsWith('/lessons/4')));
      assert.match(await page.locator('.archive-report-result').innerText(),/第 2 版/);
      await sizes(page,'03-report-real-scrolled',page.locator('.archive-report-browser'));
      // 导师调整学习资料后，已有报告仍可从原评审入口只读回看，不改变解锁/完成规则。
      db.prepare("UPDATE knowledge_cards SET status='draft' WHERE id=1").run();
      await page.getByRole('link',{name:'查看报告评审',exact:true}).click();await page.waitForURL(/stage=3/);await page.getByRole('heading',{name:'导师评审',exact:true}).waitFor();await page.getByText('本版报告评分：0 分',{exact:true}).waitFor();
      assert.ok(await page.getByRole('button',{name:/知识卡片与练习/}).count());db.prepare("UPDATE knowledge_cards SET status='published' WHERE id=1").run();
      await overview();await select('archive-course','#1');await select('archive-lesson','认识月球');await page.getByText('报告评分：88 分',{exact:true}).waitFor();
      await select('archive-lesson','空间规划');await page.getByText('报告未解锁',{exact:true}).first().waitFor();
      await sizes(page,'04-report-locked-real-scrolled',page.locator('.archive-report-browser'));
      await select('archive-course','#2');await select('archive-lesson','另一门');await page.getByText('报告未解锁',{exact:true}).first().waitFor();
      db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,5)').run();
      await overview();await select('archive-course','#2');await select('archive-lesson','另一门');await page.getByText('尚未提交',{exact:true}).first().waitFor();
    });
    await scenario('报告读取失败不冒充未提交，迟到课时报告不覆盖新选择',async()=>{
      await overview();await select('archive-course','#1');
      await page.route('**/api/learning/lessons/4',r=>r.fulfill({status:503,json:{error:'报告读取失败（故障注入）'}}));
      await select('archive-lesson','没有作品任务');await page.locator('.archive-report-result .ant-result-subtitle').filter({hasText:'报告读取失败'}).waitFor();
      assert.equal(await page.locator('.archive-report-result').getByText('尚未提交',{exact:true}).count(),0);
      await sizes(page,'04-report-error-injected-scrolled',page.locator('.archive-report-browser'));await page.unroute('**/api/learning/lessons/4');
      const releases=[];await page.route('**/api/learning/lessons/4',async route=>{const response=await route.fetch();const json=await response.json();await new Promise(resolve=>releases.push(()=>route.fulfill({json}).then(resolve)));});
      await page.locator('.archive-report-result').getByRole('button',{name:'重新加载',exact:true}).click();while(!releases.length)await page.waitForTimeout(20);
      await select('archive-lesson','空间规划');await page.getByText('报告未解锁',{exact:true}).first().waitFor();await Promise.all(releases.map(release=>release()));
      assert.equal(await page.getByText('报告评分：0 分',{exact:true}).count(),0);await page.unroute('**/api/learning/lessons/4');
    });
    await scenario('三种反馈分区、原能力维度、成长去重与无法归属降级',async()=>{
      await tab('导师反馈');await page.getByText('暂不可汇总',{exact:true}).waitFor();await page.getByText('暂无评价',{exact:true}).waitFor();
      await sizes(page,'05-feedback-real-scrolled',page.locator('.archive-tabs'));
      await sizes(page,'05-aggregate-limited-real-scrolled',page.getByRole('heading',{name:'作品评审维度汇总',exact:true}));
      await tab('成长足迹');await page.getByText('部分历史记录暂不展示详情',{exact:true}).waitFor();
      assert.equal(await page.locator('.archive-timeline > li').filter({hasText:'提交作品《观察记录初稿（测试）》'}).count(),1);
      assert.ok(!(await page.locator('.archive-timeline').innerText()).includes('不得显示'));
      await sizes(page,'06-trail-real-scrolled',page.locator('.archive-tabs'));
      await page.getByText('展开这次反思',{exact:true}).first().click();await page.getByText('第二门课的反思（测试）',{exact:true}).waitFor();
      // API 契约边界注入：原 SQL 五维不允许新写零分，UI 仍须正确呈现遗留数值 0。
      await page.route('**/api/archives/generate*',async route=>{const response=await route.fetch();const body=await response.json();body.works=body.works.filter(w=>w.course_id!==3);body.ability={problem_discovery:0,solution_design:null,hands_on:3,data_analysis:4,presentation:2};await route.fulfill({json:body});});
      await page.getByRole('button',{name:/刷新档案/}).click();await page.locator('.archive-counts').waitFor();await tab('导师反馈');
      assert.equal(await page.locator('.archive-dimensions strong').first().innerText(),'0 / 5');assert.equal(await page.locator('.archive-dimensions strong').nth(1).innerText(),'暂无评价');
      await page.locator('.archive-dimensions').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await shot(page,'05-aggregate-zero-contract-desktop-scrolled',false);await page.unroute('**/api/archives/generate*');
    });
    await scenario('作品总列表搜索、筛选、版本、待办与详情反馈，三尺寸',async()=>{
      await page.goto(base+'/works');await page.locator('.archive-work-row').first().waitFor();assert.equal(await page.locator('.archive-work-row').count(),5);
      await sizes(page,'07-works-real-first');
      await page.getByPlaceholder('搜索作品',{exact:true}).fill('同名另一');await page.getByRole('link',{name:'同名另一课程的作品（测试）',exact:true}).waitFor();assert.equal(await page.locator('.archive-work-row').count(),1);
      await page.getByPlaceholder('搜索作品',{exact:true}).fill('');await select('work-course','#1');await page.getByRole('link',{name:'同名另一课程的作品（测试）',exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('.archive-work-row').length===4);assert.equal(await page.locator('.archive-work-row').count(),4);
      await page.locator('.archive-work-row').filter({hasText:'观察记录第二版'}).getByRole('link',{name:'查看反馈并修改',exact:true}).click();await page.getByText('评审导师：张导师',{exact:true}).waitFor();await page.getByText(/评审时间：/).waitFor();
      await page.goto(base+'/works');await page.locator('.archive-work-row').filter({hasText:'需要修改'}).getByRole('link',{name:'查看反馈并修改',exact:true}).click();await page.getByRole('button',{name:'修改后重新提交',exact:true}).waitFor();
      // 真实临时库中的多版本；仅为分页验证，之后删除这些明确的测试行。
      for(let version=3;version<=12;version++)db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,parent_work_id,version) VALUES(?,4,1,1,?,'多版本分页合成材料','pending',51,?)").run(60+version,`同一项目第${version}版（分页测试）`,version);
      await page.goto(base+'/works');await page.locator('.archive-work-row').first().waitFor();assert.equal(await page.locator('.archive-work-row').count(),8);await page.getByText('当前结果：4 个项目作品 · 11 次迭代。版本不重复计为项目。',{exact:true}).waitFor();
      await page.locator('.ant-pagination-item-2').click();await page.getByRole('link',{name:'观察记录初稿（测试）',exact:true}).waitFor();assert.equal(await page.locator('.archive-work-row').count(),7);
      await sizes(page,'07-many-versions-real-scrolled',page.locator('.archive-work-list'));
      db.prepare('DELETE FROM works WHERE id BETWEEN 63 AND 72').run();
    });
    await scenario('部分失败、归属核验失败及刷新恢复，不冒充空成果',async()=>{
      await overview();await page.route('**/api/archives/generate*',r=>r.fulfill({status:503,json:{error:'档案摘要暂时失败（注入）'}}));
      await page.getByRole('button',{name:/刷新档案/}).click();await page.getByText('部分资料读取失败',{exact:true}).waitFor();assert.deepEqual(await counts(),['—','—','—','—','—']);
      await sizes(page,'08-partial-failure-injected-first');await page.unroute('**/api/archives/generate*');
      await page.route('**/api/archives/reflection',r=>r.fulfill({status:503,json:{error:'报名核验失败（注入）'}}));await page.getByRole('button',{name:/刷新档案/}).click();await page.getByText('档案刷新失败',{exact:true}).waitFor();assert.equal(await page.locator('.archive-counts').count(),0);
      await shot(page,'09-scope-failure-injected-desktop-first');await page.unroute('**/api/archives/reflection');await page.getByRole('button',{name:'重试读取',exact:true}).click();await page.locator('.archive-counts').waitFor();
    });
    await scenario('真实课程撤回、报名移除清理统计，迟到档案不复活内容',async()=>{
      let release;await page.route('**/api/archives/generate*',async route=>{const response=await route.fetch();const json=await response.json();await new Promise(resolve=>{release=()=>route.fulfill({json}).then(resolve);});});
      await page.getByRole('button',{name:/刷新档案/}).click();while(!release)await page.waitForTimeout(20);
      db.prepare("UPDATE courses SET status='draft' WHERE id=2").run();await release();await page.locator('.archive-counts').waitFor();assert.deepEqual(await counts(),['1','3','1','1','1']);
      await page.unroute('**/api/archives/generate*');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(300);
      await tab('作品与迭代');assert.equal(await page.getByRole('link',{name:'同名另一课程的作品（测试）',exact:true}).count(),0);
      db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=4 AND course_id=1").run();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('.archive-counts dd')?.textContent==='0');
      assert.deepEqual(await counts(),['0','0','0','0','0']);await sizes(page,'10-withdrawn-real-first');
      await tab('成长足迹');await page.getByText('你愿意倾听不同解释，并用证据讨论自己的判断。',{exact:true}).waitFor();assert.equal(await page.locator('.archive-timeline > li').count(),1);
      db.prepare("UPDATE courses SET status='published' WHERE id=2").run();db.prepare("UPDATE enrollments SET status='active' WHERE student_id=4 AND course_id=1").run();
    });
    await scenario('反思必填、真实提交和返回档案，三尺寸表单',async()=>{
      await page.goto(base+'/archives/reflection');await page.getByRole('button',{name:'提交反思日志',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('#enrollment_id')?.disabled);
      await page.getByRole('button',{name:'提交反思日志',exact:true}).click();await page.getByText('请选择课程',{exact:true}).waitFor();await page.getByText('请填写遇到的困难',{exact:true}).waitFor();
      await select('enrollment_id','#1');await select('lesson_id','认识月球');
      for(const [field,text] of [['difficulty','测试反思：判断哪项证据更可靠'],['solution','重复观察并记录条件'],['improvement','下一次先写清楚比较方法'],['new_question','样本数量还会怎样影响结果？']])await page.locator('#'+field).fill(text);
      await sizes(page,'11-reflection-real-first');await sizes(page,'11-reflection-submit-real-scrolled',page.locator('.study-actions'));
      await visibleAction(page.getByRole('button',{name:'提交反思日志',exact:true}));await page.getByRole('button',{name:'提交反思日志',exact:true}).focus();await page.keyboard.press('Enter');await page.getByText('反思日志提交成功',{exact:true}).waitFor();
      assert.equal(db.prepare("SELECT COUNT(*) n FROM reflections WHERE student_id=4 AND difficulty='测试反思：判断哪项证据更可靠'").get().n,1);
      await page.getByRole('button',{name:'查看成长档案',exact:true}).click();await page.locator('.archive-counts').waitFor();assert.equal((await counts())[3],'3');
      await tab('成长足迹');await page.getByText('展开这次反思',{exact:true}).first().click();await page.getByText('测试反思：判断哪项证据更可靠',{exact:true}).waitFor();
    });
    await scenario('日限额、网络失败与课程失效保留所有文字；快速切课防迟到',async()=>{
      // 将刚才真实日志标记为报告反思，验证后端相同的北京时间日限额来源。
      db.prepare("UPDATE reflections SET report_id=1 WHERE difficulty='测试反思：判断哪项证据更可靠'").run();
      await page.goto(base+'/archives/reflection');await page.waitForFunction(()=>!document.querySelector('#enrollment_id')?.disabled);await select('enrollment_id','#1');
      const texts={difficulty:'失败后保留困难',solution:'失败后保留方式',improvement:'失败后保留收获',new_question:'失败后保留问题'};
      for(const [field,text] of Object.entries(texts))await page.locator('#'+field).fill(text);
      await page.getByRole('button',{name:'提交反思日志',exact:true}).click();await page.locator('.study-submit-result').getByText(/今日已提交过反思日志/).waitFor();
      for(const [field,text] of Object.entries(texts))assert.equal(await page.locator('#'+field).inputValue(),text);
      await sizes(page,'12-daily-limit-real-scrolled',page.locator('.study-submit-result'));
      await page.route('**/api/archives/reflection',r=>r.request().method()==='POST'?r.fulfill({status:503,json:{error:'反思提交失败（故障注入）'}}):r.continue());await page.getByRole('button',{name:'提交反思日志',exact:true}).click();await page.locator('.study-submit-result').getByText('反思提交失败（故障注入）',{exact:true}).waitFor();await page.unroute('**/api/archives/reflection');
      let release;await page.route('**/api/courses/1',async r=>{const response=await r.fetch();const json=await response.json();await new Promise(resolve=>{release=()=>r.fulfill({json}).then(resolve);});});
      await select('enrollment_id','#2');await select('enrollment_id','#1');while(!release)await page.waitForTimeout(20);await select('enrollment_id','#2');await page.waitForFunction(()=>!document.querySelector('#lesson_id')?.disabled);await release();await page.unroute('**/api/courses/1');
      await select('lesson_id','另一门课程');assert.ok(!(await page.locator('#lesson_id').locator('..').innerText()).includes('认识月球'));
      db.prepare("UPDATE courses SET status='draft' WHERE id=2").run();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText(/所选课程已不可访问，已清除课程与课时关联/).waitFor();
      for(const [field,text] of Object.entries(texts))assert.equal(await page.locator('#'+field).inputValue(),text);
      assert.equal(await page.locator('#lesson_id').inputValue(),'');await sizes(page,'13-reflection-invalid-real-first');
      await page.route('**/api/archives/reflection',r=>r.fulfill({status:503,json:{error:'课程映射失败（故障注入）'}}));await page.getByRole('button',{name:'提交反思日志',exact:true}).click();await select('enrollment_id','#1');await page.getByRole('button',{name:'提交反思日志',exact:true}).click();await page.getByText('课程范围暂未确认',{exact:true}).waitFor();
      for(const [field,text] of Object.entries(texts))assert.equal(await page.locator('#'+field).inputValue(),text);await page.unroute('**/api/archives/reflection');
    });
    await scenario('新学生无成果，管理员/导师/教师保留原页面与权限',async()=>{
      const empty=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await login(empty,'student_chen');await empty.goto(base+'/archives');await empty.locator('.archive-counts').waitFor();assert.deepEqual(await empty.locator('.archive-counts dd').allTextContents(),['1','0','0','0','0']);await empty.getByRole('tab',{name:'作品与迭代',exact:true}).click();await empty.getByText(/暂无作品记录/).waitFor();await sizes(empty,'14-empty-real-first');
      db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=5").run();await empty.goto(base+'/archives/reflection');await empty.getByText('暂无可进入的课程',{exact:true}).waitFor();assert.ok(await empty.getByRole('button',{name:'提交反思日志',exact:true}).isDisabled());await sizes(empty,'15-reflection-no-course-real-first');db.prepare("UPDATE enrollments SET status='active' WHERE student_id=5").run();await empty.close();
      for(const [username,password,canAdd] of [['adminpbl','admin123',true],['mentor_zhang','mentor123',true],['teacher_li','teacher123',false]]){
        const p=await browser.newPage();await login(p,username,password);await p.goto(base+'/archives');await p.getByText('学生列表',{exact:true}).waitFor();assert.equal(await p.locator('.archive-workspace').count(),0);for(let i=0;i<12 && await p.locator('.ant-tree-switcher_close').count();i++){await p.locator('.ant-tree-switcher_close').first().click();await p.waitForTimeout(100);}const student=p.getByText('陈小红',{exact:true});await student.waitFor();{await student.click();await p.getByRole('button',{name:'导出 PDF',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'添加成长记录',exact:true}).count(),canAdd?1:0);}await p.goto(base+'/works');if(username==='teacher_li'){await p.getByText('当前身份无法访问此页面',{exact:true}).waitFor();}else{await p.getByRole('heading',{name:'作品管理',exact:true}).waitFor();}assert.equal(await p.locator('.archive-workspace').count(),0);await p.close();
      }
      assert.deepEqual(errors,[]);
    });
  } finally { if(browser)await browser.close();server.kill();vite.kill();db.close();writeFileSync(path.join(root,'test-results/round7-server.log'),logs); }
});
