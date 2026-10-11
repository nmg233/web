import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAuthSession, readAuthSession, saveAuthSession, getSessionNotice, setSessionNotice } from '../src/utils/authSession.js';
import { feedbackFileError, FEEDBACK_MAX_SIZE } from '../src/utils/feedbackFiles.js';
import { canRoleAccessPath } from '../src/utils/roleNavigation.js';
import { requestError } from '../src/utils/requestError.js';
const next = { token: 'test-access', refresh_token: 'test-refresh', user: { id: 4, role: 'student' } };
const storage = () => {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
test('会话读取、getter 及方法故障均为可识别存储错误，不信任用户缓存', () => {
  const store = storage(); store.setItem('user', '{"id":1}');
  assert.deepEqual(readAuthSession(store), { token: null, refresh_token: null });
  assert.throws(() => readAuthSession(() => { throw Error(); }), { code: 'AUTH_STORAGE', stage: 'get' });
  store.getItem = () => { throw Error(); };
  assert.throws(() => readAuthSession(store), { code: 'AUTH_STORAGE', stage: 'read' });
});
test('保存完整凭据；部分写失败清理全部身份键；清理失败保留 pending，禁止恢复混合账号', () => {
  const store = storage(); saveAuthSession(store, next);
  assert.deepEqual(readAuthSession(store), { token: next.token, refresh_token: next.refresh_token });
  const write = store.setItem;
  store.setItem = (key, value) => { if (key === 'refresh_token') throw Error(); write(key, value); };
  assert.throws(() => saveAuthSession(store, { ...next, user: { id: 5 } }), { code: 'AUTH_STORAGE' });
  assert.equal(store.getItem('token'), null); assert.equal(store.getItem('user'), null);
  store.removeItem = (key) => { if (key === 'token') throw Error(); store.data.delete(key); };
  assert.throws(() => saveAuthSession(store, next), { cleanupFailed: true });
  assert.equal(store.getItem('auth-session-pending'), '1');
  assert.throws(() => readAuthSession(store), { stage: 'incomplete' });
});
test('退出清理逐项尝试；session notice 不依赖可用 sessionStorage', () => {
  const store = storage(); saveAuthSession(store, next);
  const removed = [];
  store.removeItem = (key) => { removed.push(key); if (key === 'token') throw Error(); };
  assert.equal(clearAuthSession(store), false);
  assert.ok(removed.includes('refresh_token') && removed.includes('user'));
  globalThis.window = {}; Object.defineProperty(window, 'sessionStorage', { get() { throw Error(); } });
  setSessionNotice('测试会话说明'); assert.equal(getSessionNotice(), '测试会话说明'); setSessionNotice(''); assert.equal(getSessionNotice(), '');
  delete globalThis.window;
});
test('反馈附件保留后端扩展名/MIME/数量/10MiB 边界，GIF 不支持', () => {
  assert.equal(feedbackFileError({ name: 'a.PNG', type: 'image/png', size: FEEDBACK_MAX_SIZE }, 2), '');
  assert.match(feedbackFileError({ name: 'a.png', type: 'image/png', size: 1 }, 3), /已保留/);
  for (const file of [{ name: 'a.gif', type: 'image/gif', size: 1 }, { name: 'a.jpg', type: 'image/png', size: 1 }]) assert.match(feedbackFileError(file, 0), /扩展名与类型/);
  assert.match(feedbackFileError({ name: 'a.pdf', type: 'application/pdf', size: FEEDBACK_MAX_SIZE + 1 }, 0), /10 MiB/);
});
test('通知路径只允许合法角色站内目标；请求超时不猜测写结果', () => {
  for (const path of ['//evil.test', '/\\evil.test', '/courses/1\n', '/courses/1?x=\r', 'https://evil.test', '/feedback/manage']) assert.equal(canRoleAccessPath('student', path), false);
  assert.equal(canRoleAccessPath('student', '/courses/1/lessons/2/learn?stage=cards&card=3'), true);
  assert.match(requestError({ code: 'ECONNABORTED' }, { action: '发送回复', write: true }), /结果暂未确认/);
  assert.match(requestError({ response: { data: { error: '实际服务端说明' } } }), /实际服务端说明/);
});
