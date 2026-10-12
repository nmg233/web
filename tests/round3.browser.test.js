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
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round3-'));
// Historical deliverables stay immutable; later regressions write disposable output.
const shots = path.join(root, 'test-results/round3/screenshots');
const base = 'http://127.0.0.1:5184';
const apiBase = 'http://127.0.0.1:3122';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round3.db'),
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: apiBase,
  VITE_STUDENT_TEST_CONFIG: '1', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };
const localPython = path.join(root, '.venv/Scripts/python.exe');
if (existsSync(localPython)) Object.assign(env, { GLIDER_BACKEND: 'reference', GLIDER_PYTHON: localPython, GLIDER_RENDERER: 'mpl' });

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Service did not start: ${url}`);
}

async function readyImageLayout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
    }).map((image) => image.complete
      ? Promise.resolve() : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
  });
  await page.waitForTimeout(200);
}

async function noHorizontalOverflow(page) {
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(result.scrollWidth <= result.width + 1, `页面不横向溢出：${JSON.stringify(result)}`);
}

async function noPartnerObstruction(page, target) {
  await target.scrollIntoViewIfNeeded();
  const clear = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return center === element || element.contains(center);
  });
  assert.ok(clear, '伙伴或公共布局不能遮住主要操作中心');
}

async function popupInViewport(page, selector) {
  await page.waitForFunction((query) => [...document.querySelectorAll(query)].some((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0
      && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
  }), selector);
}

test('第三轮：原创像素双页样板和公共布局验收', { timeout: 240000 }, async (t) => {
  mkdirSync(shots, { recursive: true });
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  execFileSync(process.execPath, ['database/init.js'], { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
  const db = new Database(env.DB_PATH);
  // 所有课程材料与学习状态只写入此次 mkdtemp 隔离库；开发库不参与验收。
  db.prepare("UPDATE courses SET title='功能验收课程（测试数据）', theme='探索与实践', grade_level='junior', description='这是一门合成验收课程，用于查看地图、学习入口和实验往返。正式星海远航教学内容尚未提供。', driving_question='怎样记录观察、验证想法并改进设计？（测试问题）', story_line='仅用于验证课程说明展示，不代表正式教学情境。', materials_needed='测试记录纸' WHERE id=1").run();
  db.prepare("UPDATE lessons SET start_at='2026-10-10T14:00',end_at='2026-10-10T14:45',location='测试实验室 A',instructor_id=2 WHERE id=1").run();
  db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration) VALUES(4,1,'无作品任务的测试课时','验证没有作品任务仍能学习。',4,45),(5,1,'未分组测试课时','未提供章节的课时仍然可访问。',5,30)").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES(1,1,'测试知识卡一','用于视觉验收的知识卡片。',1,'published',2),(2,1,'测试知识卡二','这张卡片配置了测试实验入口。',2,'published',2)").run();
  db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,1)').run();
  db.prepare('INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,1,CURRENT_TIMESTAMP),(4,2,CURRENT_TIMESTAMP)').run();
  db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,enrollment_id,summary,status,version) VALUES(4,1,1,'测试报告已通过','approved',1)").run();
  db.prepare('INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(4,1,100),(4,2,25),(4,4,25)').run();
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,reject_reason,version) VALUES(1,4,1,1,'退回的测试作品','测试文字','rejected','请补充实验依据',1)").run();
  const server = spawn(process.execPath, ['-e', "require('./app').listen(3122,'127.0.0.1')"], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' });
  const vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { cwd: path.join(root, 'frontend'), env, windowsHide: true, stdio: 'pipe' });
  let logs = '';
  for (const child of [server, vite]) { child.stdout.on('data', (chunk) => { logs += chunk; }); child.stderr.on('data', (chunk) => { logs += chunk; }); }
  let browser;
  try {
    await Promise.all([waitFor(base), waitFor(`${apiBase}/api/health`)]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.afterEach(async (subtest) => {
      if (!subtest.passed) {
        console.error(subtest.name, page.url(), (await page.locator('body').innerText()).slice(0, 6000));
        await page.screenshot({ path: path.join(root, 'test-results/round3-failure.png'), fullPage: true, animations: 'disabled' });
      }
    });
    const home = async () => {
      await page.goto(`${base}/explore`);
      await page.getByTestId('home-course-card').first().waitFor();
      await readyImageLayout(page);
      await page.getByText('登录成功', { exact: true }).waitFor({ state: 'hidden' });
    };
    await page.goto(`${base}/login`);
    await page.getByPlaceholder('账号', { exact: true }).fill('student_wang');
    await page.getByPlaceholder('密码', { exact: true }).fill('student123');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/explore');

    await t.test('登录后三入口、一个主待办，1440×900课程卡与CTA位于默认首屏', async () => {
      await page.getByTestId('home-course-card').first().waitFor();
      await readyImageLayout(page);
      const navigation = page.getByRole('navigation', { name: '学生主导航' });
      assert.equal(await navigation.getByRole('link').count(), 3);
      for (const name of ['探索地图', '实验室', '成长档案']) await navigation.getByRole('link', { name: new RegExp(name) }).waitFor();
      const primary = page.getByTestId('home-primary-todo');
      await primary.getByRole('button', { name: '修改作品', exact: true }).waitFor();
      await primary.getByText('报告已通过', { exact: true }).waitFor();
      const more = page.getByRole('button', { name: /还有 \d+ 项学习或作品待办/ });
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
      const course = page.getByTestId('home-course-card').first();
      assert.equal(await course.getByRole('progressbar').getAttribute('aria-valuenow'), '30', '首页课程摘要采用真实详情进度');
      const button = course.getByRole('button', { name: '进入课程地图', exact: true });
      const [cardBox, actionBox, todoBox] = await Promise.all([course.boundingBox(), button.boundingBox(), primary.boundingBox()]);
      assert.ok(cardBox.y >= 0 && cardBox.y < 900, '第一张课程卡主内容进入首屏');
      assert.ok(actionBox.y >= 0 && actionBox.y + actionBox.height <= 900, '进入课程地图按钮完整位于默认1440×900首屏');
      assert.ok(todoBox.y >= 0 && todoBox.y < actionBox.y, '下一次闯关位于课程前');
      const bodyFontSize = await primary.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(bodyFontSize >= 16, '正文不缩小以塞入首屏');
      await noHorizontalOverflow(page);
      await page.getByText('登录成功', { exact: true }).waitFor({ state: 'hidden' });
      await page.screenshot({ path: path.join(shots, '01-home-desktop-1440.png'), fullPage: false, animations: 'disabled' });
    });

    await t.test('具体待办跳转保留，其他待办展开仍逐项可操作', async () => {
      await page.getByTestId('home-primary-todo').getByRole('button', { name: '修改作品', exact: true }).click();
      await page.waitForURL('**/works/1');
      await page.getByRole('button', { name: '修改后重新提交', exact: true }).waitFor();
      await home();
      await page.getByText(/还有 \d+ 项学习或作品待办/).click();
      const noWork = page.locator('.ant-list-item').filter({ hasText: '无作品任务的测试课时' });
      await noWork.getByRole('button', { name: '继续学习', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/4/learn');
      await page.getByRole('heading', { name: '无作品任务的测试课时', exact: true }).waitFor();
    });

    await t.test('地图真实节点、章节、选择详情、键盘进入与课程信息资源', async () => {
      await page.goto(`${base}/courses/1`);
      await page.locator('.route-node').first().waitFor();
      await readyImageLayout(page);
      assert.equal(await page.locator('.route-node').count(), 5);
      assert.equal(await page.locator('.route-group').count(), 3);
      assert.equal(await page.locator('.route-node[aria-current="step"]').count(), 1);
      await page.screenshot({ path: path.join(shots, '02-map-desktop-1440.png'), fullPage: false, animations: 'disabled' });
      await page.locator('[data-lesson-id="1"] .route-node').click();
      const details = page.getByTestId('lesson-details');
      for (const text of ['2026-10-10 14:00', '2026-10-10 14:45', '测试实验室 A', '张导师', '45 分钟']) await details.getByText(text, { exact: true }).waitFor();
      await details.getByRole('link', { name: /月球环境调研/ }).waitFor();
      await page.screenshot({ path: path.join(shots, '03-map-selected-lesson-1440.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: '课程信息', exact: true }).click();
      await page.getByText('课程说明与准备', { exact: true }).click();
      await page.getByText('测试记录纸', { exact: true }).waitFor();
      await page.getByRole('button', { name: '课程资源', exact: true }).click();
      await page.getByRole('link', { name: '查看课程回放与完整回顾', exact: true }).waitFor();
      await page.locator('[data-lesson-id="5"] .route-node').focus();
      await page.keyboard.press('Enter');
      await details.getByRole('button', { name: '进入课时', exact: true }).click();
      await page.waitForURL('**/courses/1/lessons/5/learn');
      await page.getByRole('heading', { name: '未分组测试课时', exact: true }).waitFor();
    });

    await t.test('768与390默认首屏截图，地图纵向、导航及主要操作无遮挡', async () => {
      for (const [width, height, label] of [[768, 1024, 'tablet-768'], [390, 844, 'mobile-390']]) {
        await page.setViewportSize({ width, height });
        await home();
        await noHorizontalOverflow(page);
        await page.screenshot({ path: path.join(shots, `04-home-${label}.png`), fullPage: false, animations: 'disabled' });
        await noPartnerObstruction(page, page.getByTestId('home-course-card').first().getByRole('button', { name: '进入课程地图', exact: true }));
        await page.getByRole('button', { name: '打开导航', exact: true }).click();
        await page.getByRole('navigation', { name: '学生主导航' }).getByRole('link', { name: /实验室/ }).click();
        await page.waitForURL('**/lab');
        await page.getByRole('heading', { name: '实验室', exact: true }).waitFor();
        await page.goto(`${base}/courses/1`);
        await page.locator('.route-node').first().waitFor();
        await readyImageLayout(page);
        await noHorizontalOverflow(page);
        await page.screenshot({ path: path.join(shots, `05-map-${label}.png`), fullPage: false, animations: 'disabled' });
        await page.locator('[data-lesson-id="5"] .route-node').click();
        await noPartnerObstruction(page, page.getByTestId('lesson-details').getByRole('button', { name: '进入课时', exact: true }));
        await noHorizontalOverflow(page);
        await page.screenshot({ path: path.join(shots, `06-map-details-${label}.png`), fullPage: false, animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await t.test('顶栏演示积分来自适配器，真实兑换流程更新余额；通知个人中心和帮助可达', async () => {
      await home();
      const adapterBalance = () => page.evaluate(async () => {
        const { createRewardAdapter } = await import('/src/student/rewardAdapter.js');
        return (await createRewardAdapter(localStorage, 4).load()).balance;
      });
      const before = await adapterBalance();
      assert.match(await page.getByTestId('header-demo-points').innerText(), new RegExp(String(before)));
      assert.match(await page.getByTestId('header-demo-points').innerText(), /演示/);
      await page.getByTestId('header-demo-points').click();
      await page.waitForURL('**/archives/rewards');
      await page.getByRole('button', { name: '查看礼品详情', exact: true }).first().click();
      await page.getByRole('button', { name: '演示兑换', exact: true }).click();
      await page.getByRole('button', { name: '确认演示兑换', exact: true }).click();
      await page.getByText('演示兑换成功', { exact: true }).waitFor();
      await page.getByRole('button', { name: '返回礼品', exact: true }).click();
      const after = await adapterBalance();
      assert.ok(after < before);
      await page.getByTestId('header-demo-points').getByText(String(after), { exact: true }).waitFor();
      await home();
      assert.match(await page.getByTestId('header-demo-points').innerText(), new RegExp(String(after)));
      await page.getByTestId('header-demo-points').click();
      await page.getByRole('button', { name: '重置演示数据', exact: true }).click();
      await page.getByRole('button', { name: '确认重置演示数据', exact: true }).click();
      await page.getByTestId('header-demo-points').getByText(String(before), { exact: true }).waitFor();
      assert.equal(await adapterBalance(), before, '重置成功后同页顶栏也由适配器恢复余额');
      await home();
      await page.getByRole('button', { name: '通知', exact: true }).click();
      await page.getByText('最近通知', { exact: true }).waitFor();
      await popupInViewport(page, '.ant-popover');
      await page.screenshot({ path: path.join(shots, '07-notification-popover.png'), fullPage: false, animations: 'disabled' });
      await page.getByRole('button', { name: '查看全部', exact: true }).click();
      await page.waitForURL('**/notifications');
      await page.getByRole('heading', { name: '通知中心', exact: true }).waitFor();
      await page.getByRole('button', { name: '个人中心', exact: true }).click();
      await page.getByRole('menuitem', { name: '修改密码', exact: true }).click();
      await page.waitForURL('**/change-password');
      await page.getByLabel('原密码', { exact: true }).waitFor();
      await page.getByRole('button', { name: '帮助与反馈', exact: true }).click();
      await page.waitForURL('**/feedback/new');
      await page.getByLabel('反馈标题', { exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await home();
      await page.getByRole('button', { name: '通知', exact: true }).click();
      await page.getByText('最近通知', { exact: true }).waitFor();
      await popupInViewport(page, '.ant-popover');
      await noHorizontalOverflow(page);
      await page.screenshot({ path: path.join(shots, '07b-notification-mobile.png'), fullPage: false, animations: 'disabled' });
      await page.getByRole('button', { name: '查看全部', exact: true }).click();
      await page.waitForURL('**/notifications');
      await page.getByRole('button', { name: '个人中心', exact: true }).click();
      await popupInViewport(page, '.ant-dropdown');
      await page.getByRole('menuitem', { name: '帮助与反馈', exact: true }).click();
      await page.waitForURL('**/feedback/new');
      await page.getByLabel('反馈标题', { exact: true }).waitFor();
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await t.test('伙伴收起重开与原助手入口，小屏报告表单保留且不被遮挡', async () => {
      await home();
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '收起学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '向灵境小智提问', exact: true }).click();
      await page.getByText('灵境小智暂未启用').waitFor();
      db.prepare("UPDATE lesson_learning_reports SET status='rejected',review_comment='视觉验收报告退回' WHERE student_id=4 AND lesson_id=1").run();
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=2`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByLabel('学习总结', { exact: true }).fill('第三轮视觉验收草稿；共用布局不能改变保存和提交规则。');
      await noPartnerObstruction(page, page.getByLabel('学习总结', { exact: true }));
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.getByRole('button', { name: '收起学习伙伴', exact: true }).click();
      await noPartnerObstruction(page, page.getByRole('button', { name: '提交学习报告与反思', exact: true }));
      await page.reload();
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), '第三轮视觉验收草稿；共用布局不能改变保存和提交规则。');
      await noHorizontalOverflow(page);
      await page.screenshot({ path: path.join(shots, '08-learning-form-mobile.png'), fullPage: false, animations: 'disabled' });
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await t.test('旧入口保持可达，课程知识卡片到实验再返回原卡片', async () => {
      for (const [href, name] of [['/dashboard', '探索地图'], ['/courses', '探索地图'], ['/tasks', '课后任务'], ['/works', '我的作品'], ['/courses/1/learn', '回看课程资料']]) {
        await page.goto(base + href);
        await page.getByRole('heading', { name, exact: true }).waitFor();
      }
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=1&cardId=2`);
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.waitForURL('**/glider?**');
      await page.getByRole('button', { name: /返回来源课程/ }).waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes('正在检测实验环境'));
      await page.screenshot({ path: path.join(shots, '09-experiment-regression.png'), fullPage: false, animations: 'disabled' });
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/learn?stage=1&cardId=2');
      await page.getByText('这张卡片配置了测试实验入口。', { exact: true }).waitFor();
      assert.equal(db.prepare('SELECT count(*) AS n FROM glider_simulations WHERE student_id=4').get().n, 0, '视觉验收不自动试飞或提交');
      assert.equal(db.prepare('SELECT count(*) AS n FROM works WHERE student_id=4').get().n, 1, '进入实验不自动提交新作品');
    });

    await t.test('后端已有课程封面优先，图片404降级仍保留真实名称与进入按钮', async () => {
      await home();
      const cover = page.getByTestId('home-course-card').first().locator('img').first();
      const placeholderSrc = await cover.getAttribute('src');
      assert.ok(placeholderSrc?.includes('/assets/pixel-v1/'));
      const suppliedSrc = `${placeholderSrc}?round3-server-cover=1`;
      db.prepare('UPDATE courses SET cover_image=? WHERE id=1').run(suppliedSrc);
      await home();
      assert.equal(await cover.getAttribute('src'), suppliedSrc, '后端封面优先于原创占位');
      await page.route('**/__round3-missing-cover.png', (route) => route.fulfill({ status: 404, body: '' }));
      db.prepare("UPDATE courses SET cover_image='/__round3-missing-cover.png' WHERE id=1").run();
      await home();
      const coverCard = page.getByTestId('home-course-card').first();
      const renderedFallback = await coverCard.locator('.pixel-image-fallback').count();
      const usableImage = await cover.evaluateAll((images) => images.some((image) => image.complete && image.naturalWidth > 0 && image.getAttribute('src') !== '/__round3-missing-cover.png'));
      assert.ok(renderedFallback > 0 || usableImage, '缺失图片显示稳定降级内容或替代素材');
      await page.getByTestId('home-course-card').first().getByText('功能验收课程（测试数据）', { exact: true }).waitFor();
      await page.getByTestId('home-course-card').first().getByRole('button', { name: '进入课程地图', exact: true }).waitFor();
      db.prepare('UPDATE courses SET cover_image=NULL WHERE id=1').run();
      await page.unroute('**/__round3-missing-cover.png');
    });

    await t.test('素材组件预览可浏览，学生主题不污染管理员页面', async () => {
      await page.goto(`${base}/__pixel-preview`);
      await page.getByRole('heading', { name: /素材|组件/ }).first().waitFor();
      // 网页预览按需加载派生图，原始母版通过独立链接保留。
      for (const figure of await page.locator('.pixel-preview-asset').all()) {
        await figure.scrollIntoViewIfNeeded();
        await readyImageLayout(page);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await readyImageLayout(page);
      const pixelImages = await page.locator('img[src*="/assets/pixel-v1/"]').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), ok: image.complete && image.naturalWidth > 0 })));
      for (const asset of ['hero-voyage.png', 'course-voyage.png', 'island-observatory.png', 'island-relay.png', 'planet-ring-v2.png', 'companion-cat.png']) {
        assert.ok(pixelImages.some((image) => image.src.includes(`/web/${asset.replace('.png', '')}-`)), `预览展示原创素材的网页版本：${asset}`);
        assert.equal(await page.locator(`a[href="/assets/pixel-v1/${asset}"]`).count(), 1, `原始母版仍可查看：${asset}`);
      }
      assert.ok(pixelImages.every((image) => image.ok), `预览图片加载成功：${JSON.stringify(pixelImages)}`);
      await page.screenshot({ path: path.join(shots, '10-asset-component-preview.png'), fullPage: true, animations: 'disabled' });
      const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await admin.goto(`${base}/login`);
      await admin.getByPlaceholder('账号', { exact: true }).fill('adminpbl');
      await admin.getByPlaceholder('密码', { exact: true }).fill('admin123');
      await admin.getByRole('button', { name: /登\s*录/ }).click();
      await admin.waitForURL('**/dashboard');
      await admin.getByRole('menuitem', { name: /课程管理/ }).waitFor();
      assert.equal(await admin.locator('.student-pixel').count(), 0, '管理员不挂载学生主题');
      assert.equal(await admin.locator('img[src*="/assets/pixel-v1/"]').count(), 0, '管理员不显示学生像素素材');
      await admin.screenshot({ path: path.join(shots, '11-admin-theme-regression.png'), fullPage: false, animations: 'disabled' });
      await admin.close();
    });
    assert.deepEqual(errors, [], '无浏览器未捕获异常');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { await browser?.close(); server.kill(); vite.kill(); db.close(); }
});
