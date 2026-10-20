import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareMentorFixture, serveFixture, root, Database} from './mentor-fixture.mjs';

test('指南办理入口进入真实反馈受理队列，个人提交独立保留', {timeout: 120000}, async t => {
  const f = prepareMentorFixture(3577, 4607);
  const db = new Database(f.env.DB_PATH);
  const runtime = await serveFixture(f, 3577, 4607);
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const out = path.resolve(root, process.env.PBL_GUIDE_EVIDENCE || 'docs/staff-desk/patch-feedback-guide/evidence', new Date().toISOString().replaceAll(/[:.]/g, '-'));
  fs.mkdirSync(out, {recursive: true});
  const records = [], pageErrors = [], pages = {};
  const title = '指南入口验收：学生课程反馈';
  let feedbackId;
  const scene = async (name, fn) => {
    let failure;
    await t.test(name, async () => {
      try { await fn(); records.push({name, status: 'passed'}); }
      catch (e) {
        failure = e;
        records.push({name, status: 'failed', error: e.message});
        for (const [role, p] of Object.entries(pages)) {
          await p.screenshot({path: path.join(out, 'failure-' + role + '.png'), animations: 'disabled'});
          fs.writeFileSync(path.join(out, 'failure-' + role + '.json'), JSON.stringify({url: p.url(), text: await p.locator('body').innerText()}, null, 2));
        }
        throw e;
      }
    });
    if (failure) throw failure;
  };
  try {
    for (const role of ['student', 'mentor', 'admin']) {
      const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
      const p = pages[role] = await ctx.newPage();
      p.setDefaultTimeout(8000);
      p.on('pageerror', e => pageErrors.push(e.message));
      await p.goto(runtime.base + '/login');
      await p.getByLabel('账号', {exact: true}).fill('mentor_review_' + role);
      await p.getByLabel('密码', {exact: true}).fill(f.password);
      await p.getByRole('button', {name: '登录', exact: true}).click();
      await p.waitForURL(u => u.pathname !== '/login');
    }
    await scene('学生通过真实表单提交课程反馈', async () => {
      const p = pages.student;
      await p.goto(runtime.base + '/feedback/new?courseId=91001');
      await p.getByLabel('反馈所属课程', {exact: true}).selectOption('91001');
      await p.getByRole('combobox', {name: '反馈类型', exact: true}).click();
      await p.locator('.ant-select-item-option-content').filter({hasText: '程序错误'}).click();
      await p.getByLabel('反馈标题', {exact: true}).fill(title);
      await p.getByLabel('详细描述', {exact: true}).fill('隔离学生提交，验证指南办理入口进入课程受理队列。');
      await p.locator('button[type=submit]').click();
      await p.waitForURL(u => /^\/feedback\/\d+$/.test(u.pathname));
      feedbackId = Number(new URL(p.url()).pathname.split('/').at(-1));
      assert.equal(db.prepare('SELECT user_id FROM feedbacks WHERE id=?').get(feedbackId).user_id, 10004);
    });
    for (const role of ['mentor', 'admin']) {
      await scene(role + '：从指南点击进入学生反馈受理队列及原会话', async () => {
        const p = pages[role];
        await p.getByRole('button', {name: '使用指南', exact: true}).click();
        const topic = p.locator('#feedback');
        await topic.getByRole('link', {name: '去办理 →', exact: true}).click();
        // Assert both navigation and real queue content, rather than only a configured href.
        assert.equal(new URL(p.url()).pathname, role === 'mentor' ? '/mentor/feedback' : '/feedback/manage');
        const row = p.getByRole('row').filter({hasText: title});
        await row.waitFor();
        await row.getByText('合成验收student', {exact: true}).waitFor();
        await p.screenshot({path: path.join(out, role + '-reception-queue.png'), animations: 'disabled'});
        if (role === 'mentor') await row.getByRole('link', {name: title, exact: true}).click();
        else await row.getByRole('button').first().click();
        await p.waitForURL(u => u.pathname === '/feedback/' + feedbackId);
        await p.getByText(title, {exact: true}).waitFor();
      });
      await scene(role + '：指南明确区分个人提交，原个人反馈列表仍可访问', async () => {
        const p = pages[role];
        await p.getByRole('button', {name: '使用指南', exact: true}).click();
        await p.locator('#feedback').getByRole('link', {name: '提交个人反馈', exact: true}).click();
        await p.waitForURL(u => u.pathname === '/feedback/new');
        await p.getByLabel('反馈标题', {exact: true}).waitFor();
        await p.getByRole('button', {name: '账户菜单', exact: true}).click();
        const mine = p.waitForResponse(r => new URL(r.url()).pathname === '/api/feedback/mine' && r.request().method() === 'GET');
        await p.getByRole('menuitem', {name: '我的反馈', exact: true}).click();
        await p.waitForURL(u => u.pathname === '/feedback');
        const response = await mine;
        assert.equal(response.status(), 200);
        assert.deepEqual((await response.json()).data.items, []);
        await p.getByText(/^你还没有提交反馈/).waitFor();
        assert.equal(await p.getByText(title, {exact: true}).count(), 0, '个人列表不能冒充学生反馈受理队列');
      });
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({records, pageErrors, scope: 'Real Edge; isolated synthetic SQLite; no live writes'}, null, 2));
    console.log('Evidence:', path.relative(root, out));
    await browser.close();
    await runtime.close();
    db.close();
  }
});
