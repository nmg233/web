import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const Database = require('better-sqlite3');
const scratch = mkdtempSync(path.join(tmpdir(), 'star-voyage-round4-'));
const deliverable = path.join(root, 'test-results/round4');
const shots = path.join(deliverable, 'screenshots');
const base = 'http://127.0.0.1:5185';
const apiBase = 'http://127.0.0.1:3123';
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(scratch, 'round4.db'),
  JWT_SECRET: randomBytes(32).toString('hex'), UPLOAD_PATH: path.join(scratch, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(scratch, 'feedback'), CORS_ORIGIN: base, API_PROXY_TARGET: apiBase,
  VITE_STUDENT_TEST_CONFIG: '1', LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_USER: '500' };
const localPython = path.join(root, '.venv/Scripts/python.exe');
if (existsSync(localPython)) Object.assign(env, { GLIDER_BACKEND: 'reference', GLIDER_PYTHON: localPython, GLIDER_RENDERER: 'mpl' });
const viewports = [[1440, 900, 'desktop-1440'], [768, 1024, 'tablet-768'], [390, 844, 'mobile-390']];

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Service did not start: ${url}`);
}

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
    }).map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));
  });
  await page.waitForTimeout(120);
}

async function compactPartner(page) {
  const collapse = page.getByRole('button', { name: '收起学习伙伴', exact: true });
  if (await collapse.count()) await collapse.click();
  await page.getByRole('button', { name: '打开学习伙伴', exact: true }).waitFor();
}

async function unobstructed(locator, { scroll = true } = {}) {
  await locator.waitFor({ state: 'visible' });
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const geometry = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const visible = box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth + 1
      && box.top >= 0 && box.bottom <= innerHeight + 1;
    const elementAtCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { visible, clear: elementAtCenter === element || element.contains(elementAtCenter), top: box.top, bottom: box.bottom, viewport: innerHeight };
  });
  assert.ok(geometry.visible && geometry.clear, `控件可见且原生可点击：${JSON.stringify(geometry)}`);
}

async function noOverflow(page) {
  const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1;
    }).slice(-10).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 40), right: element.getBoundingClientRect().right })) }));
  assert.ok(layout.document <= layout.viewport + 1, `页面无整体横向溢出：${JSON.stringify(layout)}`);
}

async function login(page) {
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('账号', { exact: true }).fill('student_wang');
  await page.getByPlaceholder('密码', { exact: true }).fill('student123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/explore');
  await page.getByTestId('home-course-card').first().waitFor();
  await page.getByText('登录成功', { exact: true }).waitFor({ state: 'hidden' });
}

async function resourceSnapshot(page, label) {
  const snapshot = await page.evaluate((name) => ({
    label: name, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, pathname: location.pathname,
    images: [...document.querySelectorAll('img')].filter((image) => image.currentSrc.includes('/assets/pixel-v1/') && /\.(?:png|webp|avif)(?:\?|$)/.test(image.currentSrc)).map((image) => {
      const rect = image.getBoundingClientRect();
      const resource = performance.getEntriesByName(image.currentSrc).at(-1);
      return { alt: image.alt, src: image.getAttribute('src'), srcset: image.getAttribute('srcset'), sizes: image.getAttribute('sizes'),
        currentSrc: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth,
        renderedWidth: Number(rect.width.toFixed(2)), renderedHeight: Number(rect.height.toFixed(2)),
        loading: image.loading, fetchPriority: image.fetchPriority,
        encodedBodySize: resource?.encodedBodySize ?? null, decodedBodySize: resource?.decodedBodySize ?? null,
        transferSize: resource?.transferSize ?? null };
    }),
    imageResources: performance.getEntriesByType('resource').filter((resource) => resource.name.includes('/assets/pixel-v1/') && /\.(?:png|webp|avif)(?:\?|$)/.test(resource.name))
      .map((resource) => ({ url: resource.name, encodedBodySize: resource.encodedBodySize, transferSize: resource.transferSize })),
  }), label);
  for (const image of snapshot.images) {
    const filename = path.join(root, 'frontend/public', decodeURIComponent(new URL(image.currentSrc).pathname));
    image.fileBytes = existsSync(filename) ? statSync(filename).size : null;
  }
  return snapshot;
}

test('第四轮：地图场景、随时可达伙伴与网页图片派生验收', { timeout: 300000 }, async (t) => {
  mkdirSync(shots, { recursive: true });
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  execFileSync(process.execPath, ['database/init.js'], { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
  const db = new Database(env.DB_PATH);
  // 完全隔离的合成验收库；初始五课时与第三轮一致，便于默认首屏逐图比较。
  db.prepare("UPDATE courses SET title='功能验收课程（测试数据）',theme='探索与实践',grade_level='junior',description='这是一门合成验收课程，用于查看地图、学习入口和实验往返。正式星海远航教学内容尚未提供。',driving_question='怎样记录观察、验证想法并改进设计？（测试问题）',story_line='仅用于验证课程说明展示，不代表正式教学情境。',materials_needed='测试记录纸' WHERE id=1").run();
  db.prepare("UPDATE lessons SET start_at='2026-10-10T14:00',end_at='2026-10-10T14:45',location='测试实验室 A',instructor_id=2 WHERE id=1").run();
  db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration) VALUES(4,1,'无作品任务的测试课时','验证没有作品任务仍能学习。',4,45),(5,1,'未分组测试课时','未提供章节的课时仍然可访问。',5,30)").run();
  db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,content,sort_order,status,created_by) VALUES(1,1,'测试知识卡一','用于视觉验收的知识卡片。',1,'published',2),(2,1,'测试知识卡二','这张卡片配置了测试实验入口。',2,'published',2)").run();
  db.prepare('INSERT INTO lesson_review_completions(student_id,lesson_id) VALUES(4,1)').run();
  db.prepare('INSERT INTO student_card_progress(student_id,card_id,completed_at) VALUES(4,1,CURRENT_TIMESTAMP),(4,2,CURRENT_TIMESTAMP)').run();
  db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,enrollment_id,summary,status,version) VALUES(4,1,1,'测试报告已通过','approved',1)").run();
  db.prepare('INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(4,1,100),(4,2,25),(4,4,25)').run();
  db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,reject_reason,version) VALUES(1,4,1,1,'退回的测试作品','测试文字','rejected','请补充实验依据',1)").run();
  const server = spawn(process.execPath, ['-e', "require('./app').listen(3123,'127.0.0.1')"], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' });
  const vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { cwd: path.join(root, 'frontend'), env, windowsHide: true, stdio: 'pipe' });
  let logs = '';
  for (const child of [server, vite]) { child.stdout.on('data', (chunk) => { logs += chunk; }); child.stderr.on('data', (chunk) => { logs += chunk; }); }
  let browser;
  const resources = [];
  try {
    await Promise.all([waitFor(base), waitFor(`${apiBase}/api/health`)]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.afterEach(async (subtest) => {
      if (!subtest.passed) {
        console.error(subtest.name, page.url(), (await page.locator('body').innerText()).slice(0, 5000));
        await page.screenshot({ path: path.join(root, 'test-results/round4-failure.png'), fullPage: true, animations: 'disabled' });
      }
    });
    const home = async () => {
      await page.goto(`${base}/explore`);
      await page.getByTestId('home-course-card').first().waitFor();
      await compactPartner(page);
      await ready(page);
    };
    const map = async () => {
      await page.goto(`${base}/courses/1`);
      await page.locator('.route-node').first().waitFor();
      await compactPartner(page);
      await ready(page);
    };
    await login(page);

    await t.test('三种默认首屏、当前与选中分离、原排课详情及无横向溢出', async () => {
      for (const [width, height, label] of viewports) {
        await page.setViewportSize({ width, height });
        await home();
        await noOverflow(page);
        await unobstructed(page.getByRole('button', { name: '打开学习伙伴', exact: true }), { scroll: false });
        const primary = page.getByTestId('home-primary-todo');
        await primary.getByRole('button', { name: '修改作品', exact: true }).waitFor();
        await primary.getByText('报告已通过', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: /还有 \d+ 项学习或作品待办/ }).getAttribute('aria-expanded'), 'false');
        if (width === 1440) {
          await unobstructed(primary.getByRole('button', { name: '修改作品', exact: true }), { scroll: false });
          await unobstructed(page.getByTestId('home-course-card').first().getByRole('button', { name: '进入课程地图', exact: true }), { scroll: false });
          assert.ok(await primary.evaluate((element) => parseFloat(getComputedStyle(element).fontSize) >= 16));
        }
        await page.screenshot({ path: path.join(shots, `01-home-${label}.png`), fullPage: false, animations: 'disabled' });
        resources.push(await resourceSnapshot(page, `home-${label}-1x`));
        await map();
        assert.equal(await page.locator('.route-node').count(), 5);
        assert.equal(await page.locator('.route-group').count(), 3);
        await noOverflow(page);
        await page.screenshot({ path: path.join(shots, `02-map-${label}.png`), fullPage: false, animations: 'disabled' });
        resources.push(await resourceSnapshot(page, `map-${label}-1x`));
        const currentLabel = await page.locator('.route-node[aria-current="step"]').getAttribute('aria-label');
        const first = page.locator('[data-lesson-id="1"] .route-node');
        await first.focus();
        await page.keyboard.press('Space');
        assert.equal(await first.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.route-node[aria-current="step"]').getAttribute('aria-label'), currentLabel, '选择不改写当前学习位置');
        const detail = page.getByTestId('lesson-details');
        for (const text of ['2026-10-10 14:00', '2026-10-10 14:45', '测试实验室 A', '张导师', '45 分钟']) await detail.getByText(text, { exact: true }).waitFor();
        await unobstructed(detail.getByRole('button', { name: '进入课时', exact: true }));
        await page.screenshot({ path: path.join(shots, `03-map-selected-${label}.png`), fullPage: false, animations: 'disabled' });
      }
    });

    await t.test('16课时长地图、长标题、未分组、取消课时和滚动时伙伴键盘开关', async () => {
      const insert = db.prepare('INSERT INTO lessons(id,course_id,title,description,sort_order,duration) VALUES(?,1,?,?,?,45)');
      for (let id = 6; id <= 16; id++) insert.run(id, `测试课时 ${id} · 观察记录与结果讨论`, '多课时滚动布局验收数据，不代表正式教学内容或章节归属。', id);
      const longTitle = '长标题测试课时：观察、记录、比较多轮实验结果，并说明修改方案时采用的证据与尚未解决的问题';
      db.prepare('UPDATE lessons SET title=? WHERE id=5').run(longTitle);
      db.prepare("UPDATE lessons SET status='cancelled',cancel_reason='测试取消原因：临时调整排课' WHERE id=13").run();
      for (const [width, height, label] of viewports) {
        await page.setViewportSize({ width, height });
        await map();
        assert.equal(await page.locator('.route-node').count(), 16);
        await page.getByRole('heading', { name: '其他课时', exact: true }).waitFor();
        assert.equal(await page.locator('[data-lesson-id="5"] .route-node strong').innerText(), longTitle);
        const longNode = page.locator('[data-lesson-id="5"] .route-node');
        await longNode.click();
        await unobstructed(longNode);
        await noOverflow(page);
        await ready(page);
        await page.screenshot({ path: path.join(shots, `11-long-title-${label}.png`), fullPage: false, animations: 'disabled' });
        const later = page.locator('[data-lesson-id="10"] .route-node');
        await later.focus();
        await page.keyboard.press('Enter');
        await later.scrollIntoViewIfNeeded();
        assert.equal(await later.getAttribute('aria-pressed'), 'true');
        assert.ok(await page.evaluate(() => scrollY > 200), '长地图截图确实为滚动后的状态');
        await unobstructed(later);
        await unobstructed(page.getByRole('button', { name: '打开学习伙伴', exact: true }), { scroll: false });
        await noOverflow(page);
        await ready(page);
        await page.screenshot({ path: path.join(shots, `04-long-map-compact-${label}.png`), fullPage: false, animations: 'disabled' });
        await page.getByRole('button', { name: '打开学习伙伴', exact: true }).focus();
        await page.keyboard.press('Enter');
        await unobstructed(page.getByRole('button', { name: '向灵境小智提问', exact: true }), { scroll: false });
        await unobstructed(later);
        await page.screenshot({ path: path.join(shots, `05-long-map-expanded-${label}.png`), fullPage: false, animations: 'disabled' });
        resources.push(await resourceSnapshot(page, `partner-expanded-${label}-1x`));
        await page.getByRole('button', { name: '收起学习伙伴', exact: true }).focus();
        await page.keyboard.press('Space');
        await unobstructed(page.getByRole('button', { name: '打开学习伙伴', exact: true }), { scroll: false });
        await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '打开学习伙伴', exact: true }).waitFor();
        await page.locator('[data-lesson-id="13"] .route-node').click();
        await page.getByTestId('lesson-details').getByText('测试取消原因：临时调整排课', { exact: true }).waitFor();
        assert.equal(await page.getByTestId('lesson-details').getByRole('button', { name: '进入课时', exact: true }).count(), 0);
        await page.locator('[data-lesson-id="16"] .route-node').focus();
        await page.keyboard.press('Enter');
        await unobstructed(page.getByTestId('lesson-details').getByRole('button', { name: '进入课时', exact: true }));
        await page.getByTestId('lesson-details').getByRole('button', { name: '进入课时', exact: true }).click();
        await page.waitForURL('**/courses/1/lessons/16/learn');
        await page.getByRole('heading', { name: '测试课时 16 · 观察记录与结果讨论', exact: true }).waitFor();
      }
    });

    await t.test('滚动后的通知和个人菜单不被伙伴拦截，帮助与密码入口保留', async () => {
      for (const [width, height, label] of [viewports[0], viewports[2]]) {
        await page.setViewportSize({ width, height });
        await map();
        await page.locator('[data-lesson-id="10"] .route-node').scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
        await page.getByRole('button', { name: '通知', exact: true }).click();
        await page.getByText('最近通知', { exact: true }).waitFor();
        await unobstructed(page.getByRole('button', { name: '查看全部', exact: true }), { scroll: false });
        await noOverflow(page);
        await page.screenshot({ path: path.join(shots, `06-notifications-${label}.png`), fullPage: false, animations: 'disabled' });
        await page.getByRole('button', { name: '查看全部', exact: true }).click();
        await page.waitForURL('**/notifications');
        await page.getByRole('heading', { name: '通知中心', exact: true }).waitFor();
        await page.getByRole('button', { name: '个人中心', exact: true }).click();
        await unobstructed(page.getByRole('menuitem', { name: '修改密码', exact: true }), { scroll: false });
        await page.getByRole('menuitem', { name: '修改密码', exact: true }).click();
        await page.waitForURL('**/change-password');
        await page.getByLabel('原密码', { exact: true }).waitFor();
        await page.getByRole('button', { name: '个人中心', exact: true }).click();
        await page.getByRole('menuitem', { name: '帮助与反馈', exact: true }).click();
        await page.waitForURL('**/feedback/new');
        await page.getByLabel('反馈标题', { exact: true }).waitFor();
      }
    });

    await t.test('报告表单与确认弹窗无遮挡，知识卡片实验返回不改变作品或课时', async () => {
      db.prepare("UPDATE lesson_learning_reports SET status='rejected',review_comment='第四轮布局验收退回' WHERE student_id=4 AND lesson_id=1").run();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=2`);
      const draft = '第四轮临时验收草稿：浮动伙伴不可挡住填写、确认和提交操作。';
      await page.getByLabel('学习总结', { exact: true }).fill(draft);
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await unobstructed(page.getByLabel('学习总结', { exact: true }));
      await page.getByText('结构化反思（必填）', { exact: true }).click();
      await page.getByLabel('遇到的困难', { exact: true }).fill('只验证前端布局，不确认真实报告提交。');
      const submit = page.getByRole('button', { name: '提交学习报告与反思', exact: true });
      await unobstructed(submit);
      await page.screenshot({ path: path.join(shots, '07-report-form-mobile-390.png'), fullPage: false, animations: 'disabled' });
      await submit.click();
      const cancel = page.getByRole('button', { name: /取\s*消/, exact: true });
      await unobstructed(cancel, { scroll: false });
      await unobstructed(page.getByRole('button', { name: /确\s*定/, exact: true }), { scroll: false });
      await page.screenshot({ path: path.join(shots, '08-report-confirm-mobile-390.png'), fullPage: false, animations: 'disabled' });
      await cancel.click();
      await page.reload();
      assert.equal(await page.getByLabel('学习总结', { exact: true }).inputValue(), draft, '布局和取消确认不清空草稿');
      await page.goto(`${base}/courses/1/lessons/1/learn?stage=1&cardId=2`);
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).waitFor();
      const progressBeforeExperiment = db.prepare('SELECT progress FROM lesson_progress WHERE student_id=4 AND lesson_id=1').get().progress;
      await page.getByRole('button', { name: '滑翔机实验（测试关联）', exact: true }).click();
      await page.waitForURL('**/glider?**');
      await page.getByRole('heading', { name: '滑翔机模拟实验室', exact: true }).waitFor();
      await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
      await page.waitForFunction(() => !document.body.innerText.includes('正在检测实验环境'));
      await unobstructed(page.getByRole('button', { name: /开始试飞/ }));
      await page.screenshot({ path: path.join(shots, '09-experiment-controls-mobile-390.png'), fullPage: false, animations: 'disabled' });
      await noOverflow(page);
      await page.getByRole('button', { name: /返回来源课程/ }).click();
      await page.waitForURL('**/learn?stage=1&cardId=2');
      await page.getByText('这张卡片配置了测试实验入口。', { exact: true }).waitFor();
      assert.equal(db.prepare('SELECT count(*) AS n FROM glider_simulations WHERE student_id=4').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM works WHERE student_id=4').get().n, 1);
      assert.equal(db.prepare('SELECT progress FROM lesson_progress WHERE student_id=4 AND lesson_id=1').get().progress, progressBeforeExperiment, '实验往返不改写后端课时进度');
    });

    await t.test('真实课程封面优先、404原创降级，标题与主操作保留', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await home();
      const card = page.getByTestId('home-course-card').first();
      const suppliedSrc = '/assets/pixel-v1/island-relay.png?round4-server-cover=1';
      db.prepare('UPDATE courses SET cover_image=? WHERE id=1').run(suppliedSrc);
      await home();
      assert.equal(await card.locator('img').first().getAttribute('src'), suppliedSrc);
      assert.equal(await card.locator('img').first().getAttribute('srcset'), null, '默认封面的srcset不得替换后端封面');
      await page.route('**/__round4-missing-cover.png', (route) => route.fulfill({ status: 404, body: '' }));
      db.prepare("UPDATE courses SET cover_image='/__round4-missing-cover.png' WHERE id=1").run();
      await home();
      await card.locator('.pixel-image-fallback img').waitFor();
      await ready(page);
      assert.ok(await card.locator('.pixel-image-fallback img').first().evaluate((image) => image.complete && image.naturalWidth > 0));
      await card.getByText('功能验收课程（测试数据）', { exact: true }).waitFor();
      await unobstructed(card.getByRole('button', { name: '进入课程地图', exact: true }));
      await page.screenshot({ path: path.join(shots, '10-cover-fallback-desktop-1440.png'), fullPage: false, animations: 'disabled' });
      db.prepare('UPDATE courses SET cover_image=NULL WHERE id=1').run();
      await page.unroute('**/__round4-missing-cover.png');
    });

    await t.test('1x与2x实际currentSrc、原始字节记录及首屏图片完整加载', async () => {
      for (const [width, height, label, dpr] of [viewports[0], viewports[2]].flatMap((viewport) => [1, 2].map((dpr) => [...viewport, dpr]))) {
        const highDensity = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
        const densityPage = await highDensity.newPage();
        await login(densityPage);
        await ready(densityPage);
        resources.push(await resourceSnapshot(densityPage, `fresh-context-home-${label}-${dpr}x`));
        await densityPage.goto(`${base}/courses/1`);
        await densityPage.locator('.route-node').first().waitFor();
        await ready(densityPage);
        resources.push(await resourceSnapshot(densityPage, `fresh-context-map-${label}-${dpr}x`));
        await densityPage.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
        await ready(densityPage);
        resources.push(await resourceSnapshot(densityPage, `fresh-context-partner-expanded-${label}-${dpr}x`));
        await highDensity.close();
      }
      const masters = ['hero-voyage.png', 'course-voyage.png', 'island-observatory.png', 'island-relay.png', 'planet-ring-v2.png', 'companion-cat.png']
        .map((filename) => ({ filename, bytes: statSync(path.join(root, 'frontend/public/assets/pixel-v1', filename)).size }));
      for (const snapshot of resources) {
        assert.ok(snapshot.images.some((image) => image.complete && image.naturalWidth > 0), `${snapshot.label}实际加载图片`);
        assert.ok(snapshot.images.every((image) => image.fileBytes !== null), `${snapshot.label}资源可追溯到网页文件`);
        assert.ok(snapshot.images.every((image) => image.currentSrc.includes('/assets/pixel-v1/web/')), `${snapshot.label}使用网页派生而非原始母版`);
      }
      writeFileSync(path.join(deliverable, 'resource-usage.json'), JSON.stringify({
        description: '真实 Edge 采样：图片文件字节与浏览器选择资源；不包含加载时延结论。transferSize=0可表示缓存，encodedBodySize不含HTTP响应头。',
        browser: await browser.version(), generatedAt: new Date().toISOString(), masters, snapshots: resources,
      }, null, 2) + '\n');
    });
    assert.deepEqual(errors, [], '无浏览器未捕获异常');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { await browser?.close(); server.kill(); vite.kill(); db.close(); }
});
