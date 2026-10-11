import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const Database = require('better-sqlite3');
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round2-'));
// 本轮回归截图放在测试输出，保留已经交付的第二轮历史截图。
const shots = path.join(root, 'test-results/round2');
const base = 'http://127.0.0.1:5180';
const apiBase = 'http://127.0.0.1:3118';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round2.db'),
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: apiBase,
  VITE_STUDENT_TEST_CONFIG: '1', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };
const localPython = path.join(root, '.venv/Scripts/python.exe');
if (existsSync(localPython)) Object.assign(env, { GLIDER_BACKEND: 'reference', GLIDER_PYTHON: localPython, GLIDER_RENDERER: 'mpl' });

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Service did not start: ${url}`);
}

test('第二轮：待办、课时路线、实验定位和局部错误', { timeout: 180000 }, async (t) => {
  mkdirSync(shots, { recursive: true });
  execFileSync(process.execPath, ['database/init.js'], { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
  const db = new Database(env.DB_PATH);
  // 仅临时库中的合成验收材料；不写入开发库，不冒充正式教学安排。
  db.prepare("UPDATE courses SET title='功能验收课程（测试数据）', description='第二轮合成数据：用于验证待办、课程路线和实验往返。', materials_needed='测试记录纸', story_line='仅用于验证课程说明展示。' WHERE id=1").run();
  db.prepare("UPDATE lessons SET start_at='2026-10-10T14:00',end_at='2026-10-10T14:45',location='测试实验室 A',instructor_id=2 WHERE id=1").run();
  db.prepare("INSERT INTO lessons(id, course_id, title, description, sort_order, duration) VALUES (4,1,'无作品任务的测试课时','用于验证没有作品任务的课时也能继续学习。',4,45),(5,1,'未分组测试课时','不配置章节仍然可见。',5,30)").run();
  db.prepare("INSERT INTO tasks(id, lesson_id, title, task_type, sort_order, require_upload) VALUES (4,2,'同课时第二个测试任务','creation',2,1)").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES (1,1,'测试知识卡一','用于验证卡片恢复。',1,'published',2),(2,1,'测试知识卡二','这张卡片配置了测试实验入口。',2,'published',2)").run();
  db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,1)').run();
  db.prepare('INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,1,CURRENT_TIMESTAMP),(4,2,CURRENT_TIMESTAMP)').run();
  db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,enrollment_id,summary,status,version) VALUES(4,1,1,'测试报告已通过','approved',1)").run();
  db.prepare('INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(4,1,100),(4,2,25),(4,4,25)').run();
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,reject_reason,version) VALUES(1,4,1,1,'退回的测试作品','测试文字','rejected','请补充实验依据',1)").run();
  db.prepare("INSERT INTO resources(id,course_id,lesson_id,resource_type,title,file_path,upload_by) VALUES(4,1,1,'template','缺失附件测试资料','missing-round2.pdf',2)").run();
  const server = spawn(process.execPath, ['-e', "require('./app').listen(3118,'127.0.0.1')"], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' });
  const vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5180', '--strictPort'], { cwd: path.join(root, 'frontend'), env, windowsHide: true, stdio: 'pipe' });
  let logs = '';
  for (const child of [server, vite]) { child.stdout.on('data', (chunk) => { logs += chunk; }); child.stderr.on('data', (chunk) => { logs += chunk; }); }
  let browser;
  try {
    await Promise.all([waitFor(base), waitFor(`${apiBase}/api/health`)]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (request.url().includes('/api/')) requests.push(new URL(request.url()).pathname); });
    t.afterEach(async (subtest) => {
      if (!subtest.passed) {
        console.error(subtest.name, page.url(), (await page.locator('body').innerText()).slice(0, 4500));
        await page.screenshot({ path: path.join(root, 'test-results/round2-failure.png'), fullPage: true, animations: 'disabled' });
      }
    });
    await page.goto(`${base}/login`);
    await page.getByPlaceholder('账号', { exact: true }).fill('student_wang');
    await page.getByPlaceholder('密码', { exact: true }).fill('student123');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/explore');

    await t.test('报告通过且作品退回：首页显示修改作品，摘要加载不拉完整学习包', async () => {
      await page.getByRole('button', { name: '修改作品', exact: true }).waitFor();
      await page.getByText('报告已通过', { exact: true }).waitFor();
      assert.equal(requests.filter((url) => /^\/api\/learning\/lessons\/\d+$/.test(url)).length, 0);
      await page.getByRole('button', { name: '修改作品', exact: true }).click();
      await page.waitForURL('**/works/1');
      await page.getByRole('button', { name: '修改后重新提交', exact: true }).waitFor();
      db.prepare("UPDATE lesson_learning_reports SET status='submitted' WHERE student_id=4 AND lesson_id=1").run();
      db.prepare('UPDATE lesson_progress SET progress=85 WHERE student_id=4 AND lesson_id=1').run();
      await page.goto(`${base}/explore`);
      await page.getByRole('button', { name: '修改作品', exact: true }).waitFor();
      await page.getByText('报告待评审', { exact: true }).waitFor();
      db.prepare("UPDATE lesson_learning_reports SET status='approved' WHERE student_id=4 AND lesson_id=1").run();
      await page.reload();
      await page.getByRole('button', { name: '修改作品', exact: true }).waitFor();
    });

    await t.test('无作品任务仍可继续学习，同课时多个任务不重复继续学习', async () => {
      await page.getByText(/还有 \d+ 项学习或作品待办/).click();
      const nextPage = page.getByRole('button', { name: '下一页', exact: true });
      const noWork = page.locator('.ant-list-item').filter({ hasText: '无作品任务的测试课时' });
      if (!(await noWork.count()) && await nextPage.count()) await nextPage.click();
      await noWork.getByRole('button', { name: '继续学习', exact: true }).waitFor();
      assert.equal(await page.locator('.ant-list-item').filter({ hasText: '空间规划设计' }).getByRole('button', { name: '继续学习', exact: true }).count(), 1);
      await page.screenshot({ path: path.join(shots, '01-home.png'), fullPage: true, animations: 'disabled' });
      await noWork.getByRole('button', { name: '继续学习', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/4/learn');
      await page.getByRole('heading', { name: '无作品任务的测试课时', exact: true }).waitFor();
    });

    await t.test('多章节路线、课时信息、未分组节点、键盘与窄屏', async () => {
      await page.goto(`${base}/courses/1`);
      await page.getByRole('heading', { name: '课时路线', exact: true }).waitFor();
      assert.equal(await page.locator('.route-group').count(), 3);
      assert.equal(await page.locator('.route-node').count(), 5);
      assert.equal(await page.locator('.route-node[aria-current="step"]').count(), 1);
      await page.locator('[data-lesson-id="1"] .route-node').click();
      const detail = page.getByTestId('lesson-details');
      for (const text of ['2026-10-10 14:00', '2026-10-10 14:45', '测试实验室 A', '张导师', '45 分钟']) await detail.getByText(text, { exact: true }).waitFor();
      await page.getByRole('button', { name: '课程信息', exact: true }).click();
      await page.getByText('课程说明与准备', { exact: true }).click();
      await page.getByText('测试记录纸', { exact: true }).waitFor();
      await page.waitForTimeout(400); // 等待基础 Collapse 展开后截取完整课程说明。
      await page.screenshot({ path: path.join(shots, '02-map-desktop.png'), fullPage: true, animations: 'disabled' });
      await page.locator('[data-lesson-id="5"] .route-node').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('lesson-details').getByRole('button', { name: '进入课时', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/5/learn');
      await page.goto(`${base}/courses/1`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.route-node').first().waitFor();
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(shots, '03-map-mobile.png'), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 1440, height: 1050 });
    });

    await t.test('只在配置卡片显示关联实验，返回原课程课时阶段与卡片', async () => {
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=1&cardId=2`);
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).waitFor();
      await page.screenshot({ path: path.join(shots, '04-experiment-source-card.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.waitForURL('**/glider?**');
      await page.getByRole('button', { name: /返回来源课程/ }).waitFor();
      await page.locator('.flight-context').getByText('功能验收课程（测试数据）', { exact: true }).waitFor();
      await page.locator('.flight-context').getByText('认识月球环境', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes('正在检测实验环境'));
      await page.screenshot({ path: path.join(shots, '05-experiment.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/learn?stage=1&cardId=2');
      await page.getByText('这张卡片配置了测试实验入口。', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(shots, '06-returned-card.png'), fullPage: true, animations: 'disabled' });
      await page.goto(`${base}/courses/1/lessons/2/learn`);
      await page.getByRole('heading', { name: '空间规划设计', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: /滑翔机实验/ }).count(), 0);
      await page.goto(`${base}/glider`);
      await page.getByText('关联课程 / 课时（可选）', { exact: true }).click();
      await page.getByText('关联课程（可选）', { exact: true }).waitFor();
      await page.getByText('独立实验（不关联课程）', { exact: true }).waitFor();
      await page.getByText('选择课时', { exact: true }).waitFor();
    });

    await t.test('来源卡片撤回回退课程地图，来源课程撤回回退实验室并说明', async () => {
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=1&cardId=2`);
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.getByRole('button', { name: /返回来源课程/ }).waitFor();
      db.prepare("UPDATE knowledge_cards SET status='draft' WHERE id=2").run();
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/courses/1');
      await page.getByText(/原知识卡片已不可访问/).first().waitFor();
      db.prepare("UPDATE knowledge_cards SET status='published' WHERE id=2").run();
      await page.getByRole('button', { name: '课程信息', exact: true }).click();
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.getByRole('button', { name: /返回来源课程/ }).waitFor();
      db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/lab');
      await page.getByText(/来源课程已撤回|来源课程.*不再/).first().waitFor();
      db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
    });

    await t.test('附件404仅局部提示，无关课程变化不清空已填写报告', async () => {
      db.prepare("UPDATE lesson_learning_reports SET status='rejected',review_comment='测试退回报告' WHERE student_id=4 AND lesson_id=1").run();
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=2`);
      await page.getByLabel('学习总结', { exact: true }).fill('附件失败后这段正在填写的内容必须保留。');
      await page.getByText('课堂回顾', { exact: true }).first().click();
      const resource = page.locator('.study-resource').filter({ has: page.getByText('缺失附件测试资料', { exact: true }) });
      await resource.getByRole('button', { name: /下载资料/ }).click();
      await page.getByText(/资料.*(下载失败|未能下载|不可用)|附件.*(不存在|不可用)/).first().waitFor();
      await page.getByRole('heading', { name: '认识月球环境', exact: true }).waitFor();
      // 改变无关课程集合：应保留当前课程表单和所处阶段。
      db.prepare("UPDATE courses SET status='published' WHERE id=2").run();
      db.prepare('INSERT INTO enrollments(student_id,course_id) VALUES(4,2)').run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('学习报告与反思', { exact: true }).first().click();
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), '附件失败后这段正在填写的内容必须保留。');
      db.prepare("UPDATE courses SET status='draft' WHERE id=2").run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(250);
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), '附件失败后这段正在填写的内容必须保留。');
      await page.screenshot({ path: path.join(shots, '07-draft-retained.png'), fullPage: true, animations: 'disabled' });
    });

    await t.test('真实当前课程撤回及时隐藏，已撤回内容不继续显示', async () => {
      db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('当前内容已不可访问', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('学习总结', { exact: true }).count(), 0);
      assert.equal(await page.getByText('测试知识卡二', { exact: true }).count(), 0);
    });
    assert.deepEqual(errors, []);
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { await browser?.close(); server.kill(); vite.kill(); db.close(); }
});
