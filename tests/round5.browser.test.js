import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const Database = require('better-sqlite3');
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round5-'));
const shots = path.join(root, process.env.ROUND5_CAPTURE_DELIVERY === '1' ? 'docs/round-05/screenshots' : 'test-results/round5');
const base = 'http://127.0.0.1:5186';
const apiBase = 'http://127.0.0.1:3124';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round5.db'),
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: apiBase,
  VITE_STUDENT_TEST_CONFIG: '1', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };
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
    if (focus) await focus.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await shot(page, `${name}-${label}`, !focus);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('第五轮：真实学习与作品提交、版本、反馈及学生视觉', { timeout: 360000 }, async (t) => {
  mkdirSync(shots, { recursive: true });
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  execFileSync(process.execPath, ['database/init.js'], { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
  const db = new Database(env.DB_PATH);
  // 所有教学文字、身份与状态仅用于本轮隔离合成验收，不写开发库。
  db.prepare("UPDATE courses SET title='探索与验证（测试课程）' WHERE id=1").run();
  db.prepare("UPDATE lessons SET title='观察、验证与改进我们的方案（测试课时）' WHERE id=1").run();
  db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration) VALUES(4,1,'无卡片与无作品任务（测试）','空状态验收',4,45)").run();
  db.prepare("UPDATE tasks SET title='提交观察记录与改进方案（测试任务）',description='整理观察记录，说明判断依据，并用一次验证解释你的改进。此内容仅用于验收。' WHERE id=1").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,summary,content,key_points,common_mistakes,sort_order,status,created_by) VALUES(1,1,'从观察中寻找证据（测试卡片）','先记录现象，再区分事实与推测。','观察同一对象时，记录条件、变化和结果。\n用多次观察比较结果，说明哪些证据支持你的判断。\n这是一段用于排版与交互验收的合成内容。','记录条件与结果；用证据支持判断。','一次结果不等于普遍结论。',1,'published',2),(2,1,'用实验检验想法（测试卡片）','改变一个条件，观察结果。','这里验证无练习卡片和原卡片实验往返，不代表正式课程内容。',NULL,NULL,2,'published',2)").run();
  const insertExercise = db.prepare('INSERT INTO card_exercises(id,card_id,question_type,prompt,options_json,answer_json,explanation,sort_order) VALUES(?,1,?,?,?,?,?,?)');
  const exercises = [
    ['single_choice', '哪一项属于观察记录？', ['记录温度', '猜测结果'], '记录温度'],
    ['multiple_choice', '哪些信息应当记录？', ['条件', '结果', '未经说明的猜测'], ['条件', '结果']],
    ['true_false', '答错练习后仍可阅读解析并完成卡片。', [], true],
    ['fill_blank', '记录条件与什么？', [], '结果'],
    ['short_answer', '用什么支持判断？', [], ['证据', '观察证据']],
  ];
  exercises.forEach(([type, prompt, options, answer], i) => insertExercise.run(i + 1, type, prompt, JSON.stringify(options), JSON.stringify(answer), '合成题目解析：根据记录和证据作出判断。', i + 1));
  db.prepare("INSERT INTO resources(id,course_id,lesson_id,resource_type,title,file_path,upload_by) VALUES(99,1,1,'other','观察记录模板（缺失附件测试）',?,2)").run(path.join(scratch, 'missing.pdf'));
  db.prepare("INSERT INTO course_replays(id,course_id,lesson_id,title,video_path,created_by) VALUES(99,1,1,'课堂回放（播放失败测试）',?,2)").run(path.join(scratch, 'missing.mp4'));
  const server = spawn(process.execPath, ['-e', "require('./app').listen(3124,'127.0.0.1')"], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' });
  const vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { cwd: path.join(root, 'frontend'), env, windowsHide: true, stdio: 'pipe' });
  let logs = '', browser;
  for (const child of [server, vite]) { child.stdout.on('data', (chunk) => { logs += chunk; }); child.stderr.on('data', (chunk) => { logs += chunk; }); }
  try {
    await Promise.all([waitFor(base), waitFor(`${apiBase}/api/health`)]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    // These scenarios form one real workflow; stop after a failed prerequisite.
    const scenario = async (name, run) => {
      let failure;
      await t.test(name, async () => { try { await run(); } catch (error) { failure = error; throw error; } });
      if (failure) throw failure;
    };
    page.on('pageerror', (error) => errors.push(error.message));
    t.afterEach(async (subtest) => {
      if (!subtest.passed) {
        console.error(subtest.name, page.url(), (await page.locator('body').innerText()).slice(0, 5000));
        await page.screenshot({ path: path.join(root, 'test-results/round5-failure.png'), fullPage: true });
      }
    });
    const learn = async (suffix = '', lesson = 1) => {
      await page.goto(`${base}/courses/1/lessons/${lesson}/learn${suffix}`);
      await page.getByRole('navigation', { name: '学习阶段', exact: true }).waitFor();
    };
    const confirmReport = async () => {
      await page.getByRole('button', { name: '提交学习报告与反思', exact: true }).click();
      await page.getByRole('button', { name: /确\s*定/, exact: true }).click();
    };
    await login(page);

    await scenario('四阶段锁定原因、回放与附件局部失败、三尺寸首屏', async () => {
      await learn();
      assert.equal(await page.locator('.study-stage:disabled').count(), 3);
      await page.getByText('完成课堂回顾后开启', { exact: true }).waitFor();
      await page.getByText('回放暂不可用', { exact: true }).waitFor();
      await page.getByRole('button', { name: '重试播放', exact: true }).click();
      await page.getByRole('button', { name: /下载资料/ }).click();
      await page.getByText(/下载失败，文件可能已移除/).waitFor();
      await sizes(page, '01-review-first-screen');
      await visibleAction(page.getByRole('button', { name: '我已完成课堂回顾', exact: true }));
      await page.getByRole('button', { name: '我已完成课堂回顾', exact: true }).click();
      await page.getByRole('heading', { name: '从观察中寻找证据（测试卡片）', exact: true }).waitFor();
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_review_completions WHERE student_id=4 AND lesson_id=1').get().n, 1);
    });

    await scenario('五种题型、一次作答、答错仍可完成、卡片顺序与阅读布局', async () => {
      await sizes(page, '02-card-first-screen');
      await sizes(page, '02-card-reading-scrolled', page.getByRole('heading', { name: '从观察中寻找证据（测试卡片）', exact: true }));
      assert.ok(await page.getByRole('button', { name: /2\. 用实验检验想法/ }).isDisabled());
      assert.ok(await page.getByRole('button', { name: '我已学完本卡片', exact: true }).isDisabled());
      for (let i = 0; i < exercises.length; i++) {
        const section = page.locator('.study-exercise').nth(i);
        if (i === 0) await section.getByRole('radio', { name: '猜测结果', exact: true }).check();
        if (i === 1) {
          for (const option of ['条件', '结果']) {
            const checkbox = section.getByRole('checkbox', { name: option, exact: true });
            await checkbox.focus(); await checkbox.press('Space');
            await page.waitForFunction((element) => element.checked, await checkbox.elementHandle());
            assert.ok(await checkbox.isChecked());
          }
        }
        if (i === 2) {
          const radio = section.getByRole('radio', { name: '正确', exact: true });
          await radio.focus(); await radio.press('Space');
          await page.waitForFunction((element) => element.checked, await radio.elementHandle());
        }
        if (i >= 3) await section.getByPlaceholder('填写答案').fill(i === 3 ? '结果' : '证据');
        await section.getByRole('button', { name: '提交答案', exact: true }).click();
        await section.getByText(i === 0 ? '已作答，本题回答不正确' : '回答正确', { exact: true }).waitFor();
        assert.ok(await section.getByRole('button', { name: /提交答案/ }).isDisabled());
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_exercise_attempts WHERE student_id=4 AND exercise_id=?').get(i + 1).n, 1);
      }
      await sizes(page, '03-exercise-feedback-scrolled', page.locator('.study-exercise').first());
      await page.getByRole('button', { name: '我已学完本卡片', exact: true }).click();
      await page.getByRole('heading', { name: '用实验检验想法（测试卡片）', exact: true }).waitFor();
      assert.ok(db.prepare('SELECT completed_at FROM student_card_progress WHERE student_id=4 AND card_id=1').get().completed_at);
    });

    await scenario('无题卡片、指定实验返回卡片、无卡片不自动通过与无作品任务', async () => {
      await page.getByText('本卡片没有配套练习，阅读后即可确认完成。', { exact: true }).waitFor();
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.waitForURL('**/glider?**');
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/learn?stage=1&cardId=2');
      await page.getByRole('heading', { name: '用实验检验想法（测试卡片）', exact: true }).waitFor();
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM works WHERE student_id=4').get().n, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM glider_simulations WHERE student_id=4').get().n, 0);
      await page.getByRole('button', { name: '我已学完本卡片', exact: true }).click();
      await page.getByLabel('学习总结', { exact: true }).waitFor();
      await learn('', 4);
      await page.getByText('本课时暂无作品任务', { exact: true }).waitFor();
      await page.getByRole('button', { name: '我已完成课堂回顾', exact: true }).click();
      await page.getByText('导师尚未发布知识卡片', { exact: true }).waitFor();
      assert.ok(await page.locator('.study-stage').nth(2).isDisabled());
      assert.equal(db.prepare('SELECT progress FROM lesson_progress WHERE student_id=4 AND lesson_id=4').get().progress, 25);
      await shot(page, '04-empty-cards-and-works-desktop-1440');
      await learn('?stage=2');
    });

    await scenario('折叠必填字段展开定位、全部报告字段草稿恢复、提交失败与待评审', async () => {
      const summary = page.getByLabel('学习总结', { exact: true });
      await page.getByRole('button', { name: '提交学习报告与反思', exact: true }).click();
      await page.getByText('请填写学习总结', { exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await summary.fill('测试学习总结：记录现象，用证据解释方案。');
      // Fold after initial validation, then prove hidden required reflection still validates.
      if (await page.getByLabel('遇到的困难', { exact: true }).isVisible()) await page.getByText('结构化反思（必填）', { exact: true }).click();
      await page.getByRole('button', { name: '提交学习报告与反思', exact: true }).click();
      const difficulty = page.getByLabel('遇到的困难', { exact: true });
      await difficulty.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.activeElement?.id.endsWith('reflection_difficulty'));
      await visibleAction(difficulty);
      const fields = ['关键收获', '应用设想', '困难与疑问', '下一步计划', '遇到的困难', '解决方式', '可以改进之处', '新的问题'];
      for (const label of fields) await page.getByLabel(label, { exact: true }).fill(`测试${label}：保留独立字段。`);
      await page.evaluate(() => {
        window.round5SetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('star-voyage:report:')) throw new DOMException('Synthetic storage limit', 'QuotaExceededError');
          return window.round5SetItem.call(this, key, value);
        };
      });
      await summary.fill('测试存储失败时，当前文字仍然保留。');
      await page.getByText(/草稿保存失败，请保留页面并复制填写内容/).waitFor();
      assert.equal(await summary.inputValue(), '测试存储失败时，当前文字仍然保留。');
      await page.evaluate(() => { Storage.prototype.setItem = window.round5SetItem; delete window.round5SetItem; });
      await summary.fill('测试学习总结：记录现象，用证据解释方案。');
      await sizes(page, '05-report-draft-first-screen');
      await page.reload();
      await summary.waitFor();
      assert.equal(await summary.inputValue(), '测试学习总结：记录现象，用证据解释方案。');
      await page.getByText('结构化反思（必填）', { exact: true }).click();
      for (const label of fields) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), `测试${label}：保留独立字段。`);
      await page.route('**/api/learning/lessons/1/report', (route) => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
      await confirmReport();
      await page.getByText('报告未能提交', { exact: true }).waitFor();
      assert.equal(await summary.inputValue(), '测试学习总结：记录现象，用证据解释方案。');
      await page.getByText('报告未能提交', { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, '06-report-failure-desktop-1440', false);
      await page.unroute('**/api/learning/lessons/1/report');
      await confirmReport();
      await page.getByText(/报告正在等待执行导师评审/).waitFor();
      const report = db.prepare('SELECT * FROM lesson_learning_reports WHERE student_id=4 ORDER BY id DESC LIMIT 1').get();
      assert.equal(report.status, 'submitted');
      assert.equal(report.key_points, '测试关键收获：保留独立字段。');
      assert.equal(db.prepare('SELECT new_question FROM reflections WHERE report_id=?').get(report.id).new_question, '测试新的问题：保留独立字段。');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM works WHERE student_id=4').get().n, 0);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('star-voyage:report:')).length), 0);
      await sizes(page, '07-report-pending-first-screen');
      await sizes(page, '07-report-pending-content-scrolled', page.getByText(/报告正在等待执行导师评审/));
    });

    await scenario('报告退回修改、新版本通过，作品入口独立且不被报告状态隐藏', async () => {
      db.prepare("UPDATE lesson_learning_reports SET status='rejected',review_comment='测试导师意见：请补充证据和比较过程。' WHERE student_id=4 AND lesson_id=1").run();
      await learn();
      await page.getByText('测试导师意见：请补充证据和比较过程。', { exact: true }).waitFor();
      await sizes(page, '08-report-returned-first-screen');
      await sizes(page, '08-report-returned-content-scrolled', page.getByText('测试导师意见：请补充证据和比较过程。', { exact: true }));
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), '测试学习总结：记录现象，用证据解释方案。');
      await page.getByLabel('学习总结', { exact: true }).fill('测试报告第二版：已补充比较过程。');
      await confirmReport();
      await page.getByText(/报告正在等待执行导师评审/).waitFor();
      const report = db.prepare('SELECT * FROM lesson_learning_reports WHERE student_id=4 ORDER BY version DESC LIMIT 1').get();
      assert.equal(report.version, 2);
      db.prepare("UPDATE lesson_learning_reports SET status='approved',review_comment='测试反馈：比较记录完整。',score=88 WHERE id=?").run(report.id);
      await learn();
      await page.getByText('本版报告评分：', { exact: false }).waitFor();
      assert.equal(db.prepare('SELECT progress FROM lesson_progress WHERE student_id=4 AND lesson_id=1').get().progress, 100);
      await page.getByRole('link', { name: '查看本课时任务与作品 ↓', exact: true }).click();
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.waitForURL('**/works/upload?**');
      await page.getByLabel('作品名称', { exact: true }).waitFor();
    });

    let firstWorkId, secondWorkId;
    await scenario('作品首次提交、字段校验、草稿恢复、上传失败后文字和附件保留', async () => {
      const title = page.getByLabel('作品名称', { exact: true }), description = page.getByLabel('成果文字', { exact: true });
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.getByText('请输入作品名称', { exact: true }).waitFor();
      await title.fill('观察记录与方案迭代（测试作品）');
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.getByText('请填写成果文字或选择附件，至少提供一项。', { exact: true }).waitFor();
      await description.fill('测试成果：记录条件与结果，说明方案如何改进。\n这份作品与学习报告独立保存。');
      await page.reload();
      await title.waitFor();
      assert.equal(await title.inputValue(), '观察记录与方案迭代（测试作品）');
      assert.match(await description.inputValue(), /与学习报告独立保存/);
      await sizes(page, '09-work-upload-first-screen');
      await page.locator('input[type=file]').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid signature') });
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.getByText('未能提交', { exact: true }).waitFor();
      assert.match(await description.inputValue(), /方案如何改进/);
      await page.getByText('invalid.pdf', { exact: true }).waitFor();
      const retryResponse = page.waitForResponse((response) => response.url().endsWith('/api/works') && response.request().method() === 'POST');
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      const rejectedAgain = await retryResponse;
      assert.equal(rejectedAgain.status(), 400);
      assert.match((await rejectedAgain.json()).error, /文件内容与扩展名不符（.pdf）/, '无需重新选择，服务器仍收到并校验失败附件；若附件丢失，已有成果文字会单独提交成功');
      await sizes(page, '10-work-upload-failure-scrolled', page.getByText('未能提交', { exact: true }));
      await page.locator('input[type=file]').setInputFiles({ name: 'observation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% synthetic test only\n%%EOF') });
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/1/learn');
      await page.getByText('观察记录与方案迭代（测试作品）', { exact: false }).waitFor();
      firstWorkId = db.prepare('SELECT id FROM works WHERE student_id=4 ORDER BY id DESC LIMIT 1').get().id;
      assert.equal(await page.evaluate(() => localStorage.getItem('star-voyage:work:v1:4:1:first')), null);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_learning_reports WHERE student_id=4').get().n, 2);
    });

    await scenario('最新退回作品可修改、旧版本只读已修改、作品附件局部失败与版本切换', async () => {
      db.prepare("UPDATE works SET review_status='rejected',reject_reason='测试修改建议：增加对照记录。' WHERE id=?").run(firstWorkId);
      db.prepare("INSERT INTO work_reviews(work_id,reviewer_id,comment,suggestion) VALUES(?,2,'测试评语：有清楚的观察过程。','测试修改建议：增加对照记录。')").run(firstWorkId);
      await learn('#lesson-works');
      await page.reload(); // 同页 hash 导航不重新取数，刷新以读取刚设置的导师评审状态。
      await page.getByRole('button', { name: '提交修改后的作品', exact: true }).waitFor();
      assert.equal(db.prepare('SELECT status FROM lesson_learning_reports WHERE student_id=4 ORDER BY version DESC LIMIT 1').get().status, 'approved');
      await page.goto(`${base}/works/${firstWorkId}`);
      await page.getByRole('heading', { name: '作品内容', exact: true }).waitFor();
      assert.equal(await page.getByText('作品评审', { exact: true }).count(), 0, '学生看不到管理表单');
      await sizes(page, '11-work-detail-returned-first-screen');
      await sizes(page, '12-work-feedback-scrolled', page.locator('.study-feedback'));
      db.prepare("UPDATE works SET file_path=? WHERE id=?").run(path.join(scratch, 'missing-work.pdf'), firstWorkId);
      await page.getByRole('button', { name: '下载附件', exact: true }).click();
      await page.getByText('附件下载失败', { exact: true }).waitFor();
      await shot(page, '13-work-attachment-failure-scrolled', false);
      await page.getByRole('heading', { name: '作品内容', exact: true }).waitFor();
      await page.getByRole('button', { name: '修改后重新提交', exact: true }).click();
      await page.getByLabel('成果文字', { exact: true }).fill('测试新版本：补充了对照记录与结果比较。');
      assert.equal(await page.locator('.ant-upload-list-item').count(), 0, '旧附件不冒充已选择的新附件');
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/1/learn');
      secondWorkId = db.prepare('SELECT id FROM works WHERE student_id=4 ORDER BY version DESC LIMIT 1').get().id;
      assert.equal(db.prepare('SELECT version FROM works WHERE id=?').get(secondWorkId).version, 2);
      await page.goto(`${base}/works/${firstWorkId}`);
      await page.getByText('此版本已修改', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '修改后重新提交', exact: true }).count(), 0);
      await shot(page, '14-historical-work-first-screen');
      for (const [width, height, label] of viewports) {
        await page.setViewportSize({ width, height });
        await page.goto(`${base}/works/${firstWorkId}`);
        await page.getByLabel('切换历史版本', { exact: true }).click();
        const option = page.getByTitle('第 2 版', { exact: true });
        await visibleAction(option);
        await shot(page, `14-version-menu-scrolled-${label}`, false);
        await option.click();
        await page.waitForURL(`**/works/${secondWorkId}`);
        await page.getByText('作品正在等待导师评审', { exact: true }).waitFor();
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${base}/works/upload?task_id=1&parent_work_id=${firstWorkId}`);
      await page.getByText('当前作品不能提交新版本', { exact: true }).waitFor();
      assert.equal(await page.locator('form').count(), 0, '旧版本修改地址不能重新开放表单');
    });

    await scenario('小智顺向Tab到提问、Escape回焦点、窄屏报告确认无遮挡', async () => {
      await learn();
      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        const open = page.getByRole('button', { name: '打开学习伙伴', exact: true });
        await open.focus(); await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('button', { name: '向灵境小智提问', exact: true }).evaluate((el) => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await open.evaluate((el) => el === document.activeElement), true);
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: '收起学习伙伴', exact: true }).click();
        assert.equal(await open.evaluate((el) => el === document.activeElement), true);
      }
      db.prepare("UPDATE lesson_learning_reports SET status='rejected',review_comment='确认框布局测试' WHERE student_id=4 AND version=2").run();
      await learn('?stage=2');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      const submit = page.getByRole('button', { name: '提交学习报告与反思', exact: true });
      await visibleAction(submit); await submit.click();
      const cancel = page.getByRole('button', { name: /取\s*消/, exact: true });
      await visibleAction(cancel);
      await shot(page, '15-report-confirm-mobile-390', false);
      await cancel.click();
      await page.getByRole('button', { name: '收起学习伙伴', exact: true }).click();
    });

    await scenario('管理员和导师保留原评审表单；导师真实评分后学生可查看维度', async () => {
      for (const [username, password] of [['adminpbl', 'admin123'], ['mentor_zhang', 'mentor123']]) {
        const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const staffPage = await staff.newPage();
        await login(staffPage, username, password);
        await staffPage.goto(`${base}/works/${secondWorkId}`);
        await staffPage.getByText('作品评审', { exact: true }).waitFor();
        assert.equal(await staffPage.locator('.student-pixel').count(), 0);
        assert.equal(await staffPage.getByLabel('导师评语', { exact: true }).count(), 1);
        if (username === 'mentor_zhang') {
          await staffPage.getByLabel('导师评语', { exact: true }).fill('测试评语：证据充分，表达清楚。');
          await staffPage.getByLabel('修改建议', { exact: true }).fill('测试建议：继续记录新的问题。');
          for (const label of ['问题发现', '方案设计', '动手操作', '数据分析', '表达展示']) {
            await staffPage.getByLabel(label, { exact: true }).click();
            const popup = staffPage.locator('.ant-select-dropdown:visible');
            await popup.getByTitle('4 分', { exact: true }).click();
            await popup.waitFor({ state: 'hidden' });
          }
          await staffPage.getByRole('button', { name: '保存评审', exact: true }).click();
          await staffPage.getByText('评审已保存', { exact: true }).waitFor();
        } else await shot(staffPage, '16-admin-original-review-first-screen');
        await staff.close();
      }
      assert.equal(db.prepare('SELECT review_status FROM works WHERE id=?').get(secondWorkId).review_status, 'approved');
      await page.bringToFront(); // 结束其他角色上下文后恢复学生页面的真实可见状态。
      await page.goto(`${base}/works/${secondWorkId}`);
      await page.getByText('测试评语：证据充分，表达清楚。', { exact: true }).waitFor();
      assert.equal(await page.locator('.study-scores li').count(), 5);
      await sizes(page, '17-work-approved-feedback-scrolled', page.locator('.study-scores'));
    });

    await scenario('作品详情网络失败可重试，真实课程撤回清除作品内容', async () => {
      await page.route(`**/api/works/${secondWorkId}`, (route) => route.abort('failed'));
      await page.reload();
      await page.getByRole('button', { name: '重新加载', exact: true }).waitFor();
      assert.equal(await page.getByText('测试新版本：补充了对照记录与结果比较。', { exact: true }).count(), 0);
      await shot(page, '18-work-network-failure-desktop-1440');
      await page.unroute(`**/api/works/${secondWorkId}`);
      await page.getByRole('button', { name: '重新加载', exact: true }).click();
      await page.getByText('测试新版本：补充了对照记录与结果比较。', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
      db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('该作品所属课程已不可访问，作品内容已清除。请返回探索地图查看可进入的课程。', { exact: true }).waitFor();
      assert.equal(await page.locator('.study-detail-layout').count(), 0);
      assert.equal(await page.getByRole('heading', { name: '观察记录与方案迭代（测试作品）', exact: true }).count(), 0);
      await shot(page, '18-work-access-invalid-desktop-1440');
      await page.reload();
      await page.getByText('该作品所属课程已不可访问，作品内容已清除。请返回探索地图查看可进入的课程。', { exact: true }).waitFor();
      assert.equal(await page.locator('.study-detail-layout').count(), 0, '撤回课程作品旧链接刷新后仍不展示内容');
    });
    assert.deepEqual(errors, [], '没有浏览器未捕获异常');
  } catch (error) { console.error(logs.slice(-3000)); throw error; }
  finally { await browser?.close(); server.kill(); vite.kill(); db.close(); }
});
