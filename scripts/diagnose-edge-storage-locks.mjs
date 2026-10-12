import { chromium } from 'playwright';

// Diagnostic only: no app, authentication, backend or user data is loaded.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext();
  await context.route('http://127.0.0.1:5199/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Storage timing check</title>',
  }));
  const first = await context.newPage(), second = await context.newPage();
  await first.goto('http://127.0.0.1:5199/a');
  await second.goto('http://127.0.0.1:5199/b');
  const failures = [];
  for (let i = 0; i < 25; i++) {
    const key = 'test-' + i;
    await second.evaluate(k => {
      window.ready = false;
      window.hold = navigator.locks.request(k, () => {
        window.ready = true;
        return new Promise(resolve => { window.release = resolve; });
      });
      localStorage.getItem(k);
    }, key);
    await second.waitForFunction(() => window.ready);
    await first.evaluate(k => {
      window.write = navigator.locks.request(k, () => localStorage.setItem(k, '80'));
    }, key);
    await second.waitForFunction(async () => (await navigator.locks.query()).pending.length === 1);
    await second.evaluate(k => {
      window.remove = navigator.locks.request(k, () => localStorage.removeItem(k));
    }, key);
    await second.waitForFunction(async () => (await navigator.locks.query()).pending.length === 2);
    await second.evaluate(() => { window.release(); });
    await first.evaluate(() => window.write);
    await second.evaluate(() => window.remove);
    await first.waitForTimeout(50);
    const firstValue = await first.evaluate(k => localStorage.getItem(k), key);
    const secondValue = await second.evaluate(k => localStorage.getItem(k), key);
    if (firstValue || secondValue) failures.push({ iteration: i, firstValue, secondValue });
  }
  console.log(JSON.stringify({ loops: 25, failures }));
} finally {
  await browser.close();
}
