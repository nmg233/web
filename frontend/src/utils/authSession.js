import {copyText as siteText} from "../content/systemText.js";
// Browser persistence guards only; token protocol and server authorization are unchanged.
export const AUTH_SESSION_ENDED = 'auth-session-ended';
export const AUTH_KEYS = ['token', 'refresh_token', 'user'];
export const AUTH_SESSION_STATE = 'auth-session-state';
export const AUTH_PENDING = 'auth-session-pending';
const PENDING = AUTH_PENDING;
const BLOCKED = 'auth-session-blocked';
let revision = 0, stopped = false, memoryNotice = null;
export const sessionRevision = () => revision;
export const invalidateSessionRequests = () => { revision++; };
export const isSessionStopped = () => stopped;
const source = (value) => typeof value === 'function' ? value() : value;
function storageError(stage, message, cleanupFailed = false) {
  return Object.assign(new Error(message), { code: 'AUTH_STORAGE', stage, cleanupFailed });
}
export function clearAuthSession(storage) {
  const errors = [];
  let target;
  try { target = source(storage); } catch { return false; }
  // Attempt every key even if one removal fails.
  for (const key of AUTH_KEYS) {
    try { target.removeItem(key); } catch { errors.push(key); }
  }
  if (!errors.length) { try { target.removeItem(PENDING); } catch { errors.push(PENDING); } }
  if (errors.length) { try { target.setItem(PENDING, '1'); } catch { /* Browser may deny all persistence. */ } }
  return errors.length === 0;
}
export function readAuthSession(storage) {
  let target;
  try { target = source(storage); } catch { throw storageError('get', siteText("site.40cb08c76f9d4fa8")); }
  try {
    if (target.getItem(PENDING)) throw storageError('incomplete', siteText("site.7d75c1cdc658da11"));
    const result = { token: target.getItem('token'), refresh_token: target.getItem('refresh_token') };
    if (target.getItem(PENDING)) throw storageError('incomplete', siteText("site.7d75c1cdc658da11"));
    return result;
  } catch (error) {
    if (error.code === 'AUTH_STORAGE') throw error;
    throw storageError('read', siteText("site.cbf6d0c1a354bba7"));
  }
}
export function saveAuthSession(storage, session, kind = 'login') {
  if (!session?.token || !session?.refresh_token || !session?.user?.id) throw new Error(siteText("site.173416e7ee9f4432"));
  let target;
  try { target = source(storage); } catch { throw storageError('get', siteText("site.9b35c4d2497eec51")); }
  try {
    // A marker prevents a partially saved set from being restored on a later page load.
    target.setItem(PENDING, '1');
    target.setItem('token', session.token);
    target.setItem('refresh_token', session.refresh_token);
    target.setItem('user', JSON.stringify(session.user));
    target.removeItem(PENDING);
    target.setItem(AUTH_SESSION_STATE, JSON.stringify({ kind, accountId: session.user.id, nonce: globalThis.crypto.randomUUID() }));
    return session.user;
  } catch {
    // Keep the marker if cleanup cannot complete.
    let clean = true;
    for (const key of AUTH_KEYS) { try { target.removeItem(key); } catch { clean = false; } }
    if (clean) { try { target.removeItem(PENDING); } catch { clean = false; } }
    throw storageError('write', clean ? siteText("site.2ab9584105449e17") : siteText("site.276dedaabc287bf2"), !clean);
  }
}
export function setSessionNotice(text) {
  memoryNotice = text || '';
  try { if (text) window.sessionStorage.setItem('session-notice', text); else window.sessionStorage.removeItem('session-notice'); } catch { /* Notices are not identity credentials. */ }
}
export function getSessionNotice() {
  if (memoryNotice !== null) return memoryNotice;
  try { return window.sessionStorage.getItem('session-notice') || ''; } catch { return ''; }
}
export function persistentSessionBlocked() {
  try { return window.sessionStorage.getItem(BLOCKED) === '1'; } catch { return false; }
}
export function suspendAuthSession(reason) {
  stopped = true; revision++;
  try { window.sessionStorage.setItem(BLOCKED, '1'); } catch { /* Runtime fence remains. */ }
  setSessionNotice(reason);
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_ENDED));
}
export function publishSessionEvent(kind) {
  try { window.localStorage.setItem(AUTH_SESSION_STATE, JSON.stringify({ kind, nonce: globalThis.crypto.randomUUID() })); } catch { /* Identity keys and runtime fences remain the fallback. */ }
}
export function sharedSessionHint() {
  const storage = window.localStorage;
  if (storage.getItem(PENDING)) return { pending: true };
  return { token: storage.getItem('token'), user: JSON.parse(storage.getItem('user') || 'null'), event: JSON.parse(storage.getItem(AUTH_SESSION_STATE) || 'null') };
}
export function stopAuthSession(reason) {
  stopped = true; revision++;
  try { window.sessionStorage.setItem(BLOCKED, '1'); } catch { /* Runtime guard still stops this page. */ }
  const clean = clearAuthSession(() => window.localStorage);
  const notice = reason + (clean ? '' : siteText("site.4c71026bdf3111e1"));
  setSessionNotice(notice);
  publishSessionEvent('ended');
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_ENDED, { detail: { reason: notice } }));
  return clean;
}
export function resumeAuthSession() {
  stopped = false; revision++;
  try { window.sessionStorage.removeItem(BLOCKED); } catch { try { window.sessionStorage.setItem(BLOCKED, '0'); } catch { /* Credentials already persisted; this optional fence may require a new tab. */ } }
  setSessionNotice('');
}
export function authStoppedError() { return Object.assign(new Error(siteText("site.48e628c5631f410b")), { code: 'AUTH_STOPPED' }); }
