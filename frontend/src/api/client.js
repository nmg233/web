import {copyText as siteText} from "../content/systemText.js";
import axios from 'axios';
import { message } from 'antd';
import { accessCheckForError, STUDENT_ACCESS_CHECK } from '../student/accessPolicy';
import { readAuthSession, saveAuthSession, sessionRevision, isSessionStopped, stopAuthSession, authStoppedError, publishSessionEvent, AUTH_SESSION_STATE, AUTH_PENDING, AUTH_SESSION_ENDED } from '../utils/authSession';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const settings = { baseURL: API_BASE, timeout: 15000, headers: { 'Content-Type': 'application/json' } };
const client = axios.create(settings);
const authClient = axios.create(settings);
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
let refreshPromise = null;
const publicAuth = (url = '') => /^\/auth\/(login|refresh|logout)$/.test(url);
const readSession = () => readAuthSession(() => window.localStorage);
async function readStableSession() {
  try { return readSession(); } catch (error) {
    if (error.stage !== 'incomplete') throw error;
    // Storage notifications may arrive after a different tab releases its lock.
    // Wait for the actual stable save, not a fixed delay or a second lock read.
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('storage', changed);
        window.removeEventListener(AUTH_SESSION_ENDED, ended);
      };
      const check = () => {
        try { const saved = readSession(); cleanup(); resolve(saved); }
        catch (next) { if (next.stage !== 'incomplete') { cleanup(); reject(next); } }
      };
      const changed = event => { if ([AUTH_SESSION_STATE, AUTH_PENDING, null].includes(event.key)) check(); };
      const ended = () => { cleanup(); reject(authStoppedError()); };
      // Bound a crashed/failed writer; never treat timeout as a successful save.
      const timeout = setTimeout(() => { cleanup(); reject(error); }, settings.timeout);
      window.addEventListener('storage', changed);
      window.addEventListener(AUTH_SESSION_ENDED, ended);
      check();
    });
  }
}
function tokenPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}
function isTokenExpiringSoon(token) {
  if (!token) return false;
  try {
    const payload = tokenPayload(token);
    return payload?.exp && payload.exp * 1000 - Date.now() < REFRESH_THRESHOLD_MS;
  } catch { return false; }
}
async function doRefresh() {
  const revision = sessionRevision();
  const initial = await readStableSession();
  // A token string is replaced as a whole, unlike a multi-key save marker.
  // This comparison only rejects a changed scope; the server still verifies tokens.
  const owner = tokenPayload(initial.token);
  const sameOwner = () => {
    const current = tokenPayload(window.localStorage.getItem('token'));
    return !!owner && !!current && ['id', 'role', 'school_id', 'class_id'].every(key => String(owner[key] ?? '') === String(current[key] ?? ''));
  };
  const rotate = async () => {
    if (revision !== sessionRevision() || isSessionStopped() || !sameOwner()) throw authStoppedError();
    const { token, refresh_token } = await readStableSession();
    // Another tab may have rotated the one-use refresh token while this request waited.
    if (token && refresh_token && refresh_token !== initial.refresh_token) return token;
    if (!refresh_token) throw Object.assign(new Error(siteText("site.cdbfa03ab37f5248")), { code: 'NO_REFRESH' });
    let res;
    try { res = await authClient.post('/auth/refresh', { refresh_token }); }
    catch (error) {
      // Without cross-tab locks, reuse an already saved rotation once; never loop refreshes.
      const latest = await readStableSession();
      if (error.response?.status === 401 && revision === sessionRevision() && !isSessionStopped()
        && sameOwner() && latest.token && latest.refresh_token && latest.refresh_token !== refresh_token) return latest.token;
      throw error;
    }
    if (revision !== sessionRevision() || isSessionStopped()) throw authStoppedError();
    // Also fence a newer login before its queued storage event reaches this tab.
    if (!sameOwner() || (await readStableSession()).refresh_token !== refresh_token) throw authStoppedError();
    try { saveAuthSession(() => window.localStorage, res.data, 'rotation'); }
    catch (error) {
      stopAuthSession(siteText("site.44956f109806ba2a"));
      authClient.post('/auth/logout', { refresh_token: res.data.refresh_token }).catch(() => {});
      throw error;
    }
    return res.data.token;
  };
  let locks;
  try { locks = window.navigator.locks; } catch { /* Preserve the existing single-tab path. */ }
  // This lock serializes network refreshes only. Reward persistence uses IndexedDB transactions.
  return locks?.request ? locks.request('star-voyage-auth-refresh', rotate) : rotate();
}
function refresh() {
  if (!refreshPromise || refreshPromise.revision !== sessionRevision()) {
    const revision = sessionRevision();
    const promise = doRefresh().finally(() => { if (refreshPromise?.promise === promise) refreshPromise = null; });
    refreshPromise = { revision, promise };
  }
  return refreshPromise.promise;
}
function handleRefreshFailure(error, revision) {
  if (revision === sessionRevision() && (error.response?.status === 401 || error.code === 'NO_REFRESH')) {
    stopAuthSession(siteText("site.d81c1a6f086ac4a7"));
  }
}
client.interceptors.request.use(async (config) => {
  if (publicAuth(config.url)) return config;
  if (isSessionStopped() || (config._authRevision !== undefined && config._authRevision !== sessionRevision())) throw authStoppedError();
  config._authRevision = sessionRevision();
  let { token } = await readStableSession();
  if (!config._retry && isTokenExpiringSoon(token)) {
    try { token = await refresh(); }
    catch (error) {
      handleRefreshFailure(error, config._authRevision);
      // A transient proactive refresh failure can still use an unexpired access token.
      if (isSessionStopped() || error.code === 'AUTH_STORAGE' || error.code === 'AUTH_STOPPED') throw error;
    }
  }
  if (config._authRevision !== sessionRevision()) throw authStoppedError();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use(
  (response) => {
    if (!publicAuth(response.config.url) && response.config._authRevision !== sessionRevision()) throw authStoppedError();
    return response.data;
  },
  async (error) => {
    const { config, response } = error;
    if (error.code === 'AUTH_STORAGE' || error.code === 'AUTH_STOPPED') return Promise.reject(error);
    if (!publicAuth(config?.url) && config?._authRevision !== sessionRevision()) return Promise.reject(authStoppedError());
    if (typeof Blob !== 'undefined' && response?.data instanceof Blob && response.data.size < 65536) {
      try { response.data = JSON.parse(await response.data.text()); } catch { /* Not a JSON error. */ }
    }
    if (!publicAuth(config?.url) && config?._authRevision !== sessionRevision()) return Promise.reject(authStoppedError());
    if (response?.status === 401 && !publicAuth(config?.url)) {
      if (!config._retry) {
        config._retry = true;
        try {
          const persisted = (await readStableSession()).token;
          // A concurrent request may already have rotated credentials before this 401 arrived.
          const token = persisted && config.headers.Authorization !== `Bearer ${persisted}` ? persisted : await refresh();
          config.headers.Authorization = `Bearer ${token}`;
          return client(config);
        } catch (refreshError) {
          handleRefreshFailure(refreshError, config._authRevision);
          return Promise.reject(refreshError);
        }
      }
      stopAuthSession(siteText("site.d81c1a6f086ac4a7"));
      return Promise.reject(error);
    }
    if (response?.status === 403 && response.data?.code === 'FORCE_RESET') {
      publishSessionEvent('force-reset');
      window.dispatchEvent(new CustomEvent('auth-force-reset'));
      return Promise.reject(error);
    }
    const accessCheck = accessCheckForError(error);
    if (accessCheck) window.dispatchEvent(new CustomEvent(STUDENT_ACCESS_CHECK, { detail: accessCheck }));
    if (!config?.silent) message.error(response?.data?.error || response?.data?.message || siteText("site.3b3c92d4e9519297"));
    return Promise.reject(error);
  }
);
export default client;
