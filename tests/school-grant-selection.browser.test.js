import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareDeskFixture} from './staff-desk-fixture.mjs';
import {serveFixture, root} from './mentor-fixture.mjs';
import {assertGrantSelected, chooseGrantOption, settleGrantOverlay} from './school-grant-selection.mjs';

test('学校授权：重复原生鼠标和键盘选择，提交前保持真实选中值', {timeout: 180000}, async () => {
  const f = prepareDeskFixture(3587, 4617), runtime = await serveFixture(f, 3587, 4617);
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const p = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
  const out = path.join(root, 'docs/staff-desk/patch-feedback-guide/selection-regression', new Date().toISOString().replaceAll(/[:.]/g, '-'));
  fs.mkdirSync(out, {recursive: true});
  const records = [], pageErrors = [], posts = [];
  p.setDefaultTimeout(5000);
  p.on('pageerror', e => pageErrors.push(e.message));
  p.on('dialog', d => d.accept());
  p.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/mentor-workspace/school-grants') posts.push('POST'); });
  const keyboardSelect = async (modal, label, expected) => {
    const input = modal.getByLabel(label, {exact: true});
    await settleGrantOverlay(modal);
    await input.focus();
    await input.press('ArrowDown');
    await input.press('Home');
    let found = false;
    for (let i = 0; i < 20; i++) {
      const id = await input.getAttribute('aria-activedescendant');
      // Virtualized options expose the human label via aria-label; textContent is the numeric ID.
      if (id && await p.locator('[id="' + id + '"]').getAttribute('aria-label') === expected) { found = true; break; }
      await input.press('ArrowDown');
    }
    assert.ok(found, '键盘必须定位到指定选项：' + expected);
    await input.press('Enter');
  };
  try {
    await p.goto(runtime.base + '/login');
    await p.getByLabel('账号', {exact: true}).fill('mentor_review_admin');
    await p.getByLabel('密码', {exact: true}).fill(f.password);
    await p.getByRole('button', {name: '登录', exact: true}).click();
    await p.waitForURL(u => u.pathname !== '/login');
    await p.goto(runtime.base + '/admin/organization?section=school-grants');
    for (let attempt = 0; attempt < 24; attempt++) {
      const mode = attempt < 20 ? 'pointer' : 'keyboard';
      await p.getByRole('button', {name: '授予已有学校管理权', exact: true}).click();
      const modal = p.getByRole('dialog');
      for (const [label, expected] of [['已有学校', '合成验收学校7001 #7001'], ['授权导师', '合成验收noSchool #10007']]) {
        if (mode === 'keyboard') await keyboardSelect(modal, label, expected);
        else {
          // Wait for actual transitions; retain normal motion and native pointer clicks.
          await chooseGrantOption(p, modal, label, expected);
        }
        await assertGrantSelected(p, modal, label, expected);
      }
      await modal.getByLabel('操作原因', {exact: true}).fill('合成选择回归，不提交授权：' + attempt);
      await modal.getByRole('checkbox').check();
      await assertGrantSelected(p, modal, '已有学校', '合成验收学校7001 #7001');
      await assertGrantSelected(p, modal, '授权导师', '合成验收noSchool #10007');
      records.push({attempt: attempt + 1, mode, school: 7001, mentor: 10007, status: 'passed'});
      if (attempt === 0) await p.screenshot({path: path.join(out, 'confirmed-before-submit.png'), animations: 'disabled'});
      await modal.locator('.ant-modal-close').click();
      await modal.waitFor({state: 'hidden'});
    }
    assert.equal(records.length, 24);
    assert.deepEqual(posts, [], '选择探针不能偷偷提交授权');
    assert.deepEqual(pageErrors, []);
  } catch (e) {
    await p.screenshot({path: path.join(out, 'first-failure.png'), animations: 'disabled'});
    fs.writeFileSync(path.join(out, 'first-failure.json'), JSON.stringify({error: e.message, url: p.url(), text: await p.locator('body').innerText()}, null, 2), {flag: 'wx'});
    throw e;
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({records, pageErrors, posts, scope: 'Real Edge; synthetic isolated SQLite; normal motion enabled; no teaching data'}, null, 2));
    console.log('Evidence:', path.relative(root, out));
    await browser.close();
    await runtime.close();
  }
});
