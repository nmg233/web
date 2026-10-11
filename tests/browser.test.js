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
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-e2e-'));
const dbPath = path.join(scratch, 'test.db');
const backendUrl = 'http://127.0.0.1:3117';
const base = 'http://127.0.0.1:5179';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: dbPath, PORT: '3117',
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: backendUrl,
  GLIDER_BACKEND: 'reference', GLIDER_PYTHON: path.join(root, '.venv/Scripts/python.exe'),
  GLIDER_RENDERER: 'mpl', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Service did not start: ${url}`);
}

test('真实本地 API 的学生流程与故障回归', { timeout: 180000 }, async (t) => {
  execFileSync(process.execPath, ['database/init.js'], { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
  const db = new Database(dbPath);
  db.prepare("INSERT INTO knowledge_cards (id, lesson_id, title, content, sort_order, status, created_by) VALUES (1, 1, '测试知识卡', '用于本地回归验证的知识内容。', 1, 'published', 2)").run();
  db.prepare("INSERT INTO card_exercises (id, card_id, question_type, prompt, answer_json, explanation) VALUES (1, 1, 'true_false', '测试判断题', 'true', '测试答案解释')").run();
  // 仅临时测试库，不修改被复制的后端或任何真实学生数据。
  const server = spawn(process.execPath, ['-e', "require('./app').listen(3117, '127.0.0.1')"], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' });
  const vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { cwd: path.join(root, 'frontend'), env, windowsHide: true, stdio: 'pipe' });
  // Vite 的入口参数使用绝对地址，避免工作目录影响。
  vite.on('error', () => {});
  let browser;
  let logs = '';
  for (const child of [server, vite]) { child.stdout.on('data', (chunk) => { logs += chunk; }); child.stderr.on('data', (chunk) => { logs += chunk; }); }
  try {
    await Promise.all([waitFor(`${backendUrl}/api/health`), waitFor(base)]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    t.afterEach(async (subtest) => {
      if (!subtest.passed) {
        console.log('FAILED PAGE', subtest.name, page.url(), (await page.locator('body').innerText()).slice(0, 2500));
        await page.screenshot({ path: path.join(root, 'test-results/failure.png'), fullPage: true });
      }
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const login = async (username = 'student_wang') => {
      await page.goto(`${base}/login`);
      await page.getByPlaceholder('账号', { exact: true }).fill(username);
      await page.getByPlaceholder('密码', { exact: true }).fill('student123');
      await page.getByRole('button', { name: /登\s*录/ }).click();
      await page.waitForURL('**/explore');
      await page.getByRole('heading', { name: '探索地图', exact: true }).waitFor();
    };
    await t.test('登录、三个入口、课程地图、旧链接、窄屏', async () => {
      await login();
      assert.equal(await page.getByRole('navigation', { name: '学生主导航' }).getByRole('link').count(), 3);
      await page.getByRole('button', { name: '进入课程地图' }).click();
      await page.getByRole('button', { name: /第 1 关：认识月球环境/ }).waitFor();
      assert.equal(await page.locator('.route-node').count(), 3);
      for (const lessonId of [1, 2, 3]) {
        await page.locator(`[data-lesson-id="${lessonId}"] .route-node`).click();
        const detail = page.getByTestId('lesson-details');
        await detail.getByRole('button', { name: '进入课时', exact: true }).waitFor();
        await detail.getByRole('button', { name: '进入课时', exact: true }).click();
        await page.waitForURL(`**/courses/1/lessons/${lessonId}/learn`);
        await page.goto(`${base}/courses/1`);
      }
      await page.goto(`${base}/dashboard`);
      await page.getByRole('heading', { name: '探索地图', exact: true }).waitFor();
      await page.goto(`${base}/tasks`);
      await page.getByRole('heading', { name: '课后任务', exact: true }).waitFor();
      await page.getByText('月球环境调研', { exact: true }).waitFor();
      await page.goto(`${base}/works`);
      await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor();
      await page.getByRole('link', { name: '提交作品', exact: true }).first().waitFor();
      await page.goto(`${base}/courses/1/learn`);
      await page.getByRole('heading', { name: '回看课程资料' }).waitFor();
      await page.goto(`${base}/explore`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '进入课程地图' }).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(root, 'test-results/mobile.png'), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '窄屏首页没有整体横向溢出');
      await page.setViewportSize({ width: 1365, height: 900 });
    });
    await t.test('奖励详情、取消与确认兑换、余额、记录、徽章', async () => {
      await page.goto(`${base}/archives/rewards`);
      await page.getByRole('button', { name: '查看礼品详情' }).first().click();
      await page.getByRole('button', { name: '演示兑换', exact: true }).click();
      await page.getByRole('button', { name: '返回详情', exact: true }).click();
      assert.equal(await page.getByTestId('reward-balance').innerText(), '120');
      await page.getByRole('button', { name: '演示兑换', exact: true }).click();
      await page.getByRole('button', { name: '确认演示兑换', exact: true }).click();
      await page.getByText('演示兑换成功', { exact: true }).waitFor();
      await page.getByRole('button', { name: '返回礼品', exact: true }).click();
      assert.equal(await page.getByTestId('reward-balance').innerText(), '80');
      await page.getByRole('tab', { name: '兑换记录', exact: true }).click();
      await page.getByText('演示兑换成功（不发货）').waitFor();
      await page.getByRole('tab', { name: '徽章', exact: true }).click();
      await page.getByRole('button', { name: '查看徽章详情' }).first().click();
      await page.getByText('此状态由演示配置预置，正式条件待制定。').waitFor();
      await page.getByRole('button', { name: /关\s*闭/, exact: true }).last().click();
    });
    await t.test('真实学习闭环：回顾、一次作答、卡片、报告草稿与提交', async () => {
      await page.goto(`${base}/courses/1/lessons/1/learn`);
      await page.getByRole('button', { name: '我已完成课堂回顾', exact: true }).click();
      await page.getByText('测试判断题', { exact: true }).waitFor();
      await page.getByRole('radio', { name: '正确', exact: true }).check();
      await page.getByRole('button', { name: '提交答案', exact: true }).click();
      await page.getByRole('button', { name: '我已学完本卡片', exact: true }).click();
      await page.getByLabel('学习总结', { exact: true }).fill('测试报告草稿，仅用于本地自动化验证。');
      await page.reload();
      await page.getByLabel('学习总结', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), '测试报告草稿，仅用于本地自动化验证。');
      await page.getByText('结构化反思（必填）', { exact: true }).click();
      await page.getByLabel('遇到的困难', { exact: true }).fill('测试困难');
      await page.getByRole('button', { name: '提交学习报告与反思', exact: true }).click();
      await page.getByRole('button', { name: /确\s*定/, exact: true }).click();
      await page.getByText('报告正在等待执行导师评审。', { exact: false }).waitFor();
      assert.equal(db.prepare('SELECT status FROM lesson_learning_reports WHERE student_id=4').get().status, 'submitted');
      assert.equal(db.prepare('SELECT count(*) AS n FROM works WHERE student_id=4').get().n, 0, '报告不会合并为作品');
    });
    await t.test('作品提交、附件失败和退回新版本', async () => {
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.getByLabel('作品名称', { exact: true }).fill('本地测试作品');
      await page.getByLabel('成果文字', { exact: true }).fill('测试作品正文');
      await page.locator('input[type=file]').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid signature') });
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.getByText('未能提交', { exact: true }).waitFor();
      assert.equal(db.prepare('SELECT count(*) AS n FROM works WHERE student_id=4').get().n, 0);
      await page.getByRole('button', { name: '删除文件' }).click();
      await page.getByRole('button', { name: '删除文件' }).waitFor({ state: 'hidden' });
      // 等待文件项移除和提交恢复后，以表单提交语义定位，不依赖图标文案。
      await page.locator('form button[type="submit"]:not(.ant-btn-loading)').click();
      await page.waitForURL('**/courses/1/lessons/1/learn');
      await page.getByText('本地测试作品', { exact: false }).waitFor();
      db.prepare("UPDATE works SET review_status='rejected', reject_reason='请补充依据' WHERE student_id=4").run();
      await page.reload();
      await page.getByRole('button', { name: '提交修改后的作品', exact: true }).click();
      await page.getByLabel('成果文字', { exact: true }).fill('测试新版本，已补充依据。');
      await page.getByRole('button', { name: '提交作品', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/1/learn');
      assert.equal(db.prepare('SELECT MAX(version) AS v FROM works WHERE student_id=4').get().v, 2);
    });
    await t.test('实验独立入口不伪造关联，课程入口恢复阶段，安全返回', async () => {
      await page.goto(`${base}/glider`);
      await page.getByText('关联课程 / 课时（可选）', { exact: true }).click();
      await page.getByText('关联课程（可选）', { exact: true }).waitFor();
      await page.getByText('独立实验（不关联课程）', { exact: true }).waitFor();
      await page.getByText('选择课时', { exact: true }).waitFor();
      await page.getByRole('button', { name: /开始试飞/ }).click();
      await page.getByText('结果：', { exact: false }).waitFor({ timeout: 60000 });
      const flight = db.prepare('SELECT status, course_id, lesson_id FROM glider_simulations WHERE student_id=4 ORDER BY id DESC LIMIT 1').get();
      assert.equal(flight.status, 'success');
      assert.equal(flight.course_id, null);
      assert.equal(flight.lesson_id, null);
      // 正式配置尚无关联，不在每个课时自动提供配套实验；合法旧来源链接仍兼容。
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=2`);
      assert.equal(await page.getByRole('button', { name: '进入滑翔机实验', exact: true }).count(), 0);
      await page.goto(`${base}/glider?course_id=1&lesson_id=1&returnTo=${encodeURIComponent('/courses/1/lessons/1/learn?stage=2')}`);
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/learn?stage=2');
      await page.getByText('第三阶段：学习报告与反思', { exact: true }).waitFor();
      await page.goto(`${base}/glider?returnTo=https://evil.test`);
      await page.getByRole('button', { name: /返回实验室/ }).click();
      await page.waitForURL('**/lab');
    });
    await t.test('伙伴收起重开、启用状态、奖励账号隔离', async () => {
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '收起学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '向灵境小智提问', exact: true }).click();
      await page.getByText('灵境小智暂未启用').waitFor();
      await login('student_chen');
      await page.goto(`${base}/archives/rewards`);
      await page.getByTestId('reward-balance').getByText('120', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('reward-balance').innerText(), '120');
    });
    await t.test('课程撤回、网络错误、账号停用清除失效内容', async () => {
      await page.goto(`${base}/courses/1`);
      await page.getByRole('button', { name: /第 1 关：认识月球环境/ }).waitFor();
      db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('当前内容已不可访问', { exact: true }).waitFor();
      assert.equal(await page.locator('.route-node').count(), 0);
      await page.goto(`${base}/explore`);
      await page.getByText('老师还没有为你分配已发布的课程，请联系老师。').waitFor();
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('权限检查暂未完成', { exact: true }).waitFor();
      await context.setOffline(false);
      await page.getByRole('button', { name: '重新检查', exact: true }).click();
      await page.getByRole('heading', { name: '探索地图', exact: true }).waitFor();
      db.prepare('UPDATE users SET is_active=0 WHERE id=5').run();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForURL('**/login');
      assert.equal(await page.locator('.route-node').count(), 0);
    });
    assert.deepEqual(errors, [], '无浏览器未捕获异常');
  } catch (error) { console.error(logs.slice(-5000)); throw error; }
  finally { await browser?.close(); server.kill(); vite.kill(); db.close(); }
});

mkdirSync(path.join(root, 'test-results'), { recursive: true });
if (!existsSync(env.GLIDER_PYTHON)) delete env.GLIDER_PYTHON;
