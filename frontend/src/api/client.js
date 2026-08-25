import axios from 'axios';
import { message } from 'antd';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 纯凭据实例：不带业务拦截器，用于无感刷新，避免递归触发 401 处理
const authClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // access token 剩余不足 5 分钟时主动刷新
let refreshPromise = null; // 并发去重：同一时间只进行一次刷新

const isRefreshOrLogin = (url = '') => url.includes('/auth/refresh') || url.includes('/auth/login');

// 解码 JWT payload 中的 exp（秒），判断是否即将过期
function isTokenExpiringSoon() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < REFRESH_THRESHOLD_MS;
  } catch {
    return false;
  }
}

// 无感刷新：用 refresh_token 换取新的一对 token
async function doRefresh() {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) throw new Error('缺少 refresh_token');
  const res = await authClient.post('/auth/refresh', { refresh_token });
  localStorage.setItem('token', res.data.token);
  localStorage.setItem('refresh_token', res.data.refresh_token);
  if (res.data.user) {
    localStorage.setItem('user', JSON.stringify(res.data.user));
  }
  return res.data.token;
}

function clearAuthAndRedirect() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// 请求拦截器：附加 token；token 即将过期时先无感刷新
client.interceptors.request.use(
  async (config) => {
    if (!isRefreshOrLogin(config.url) && isTokenExpiringSoon()) {
      try {
        refreshPromise = refreshPromise || doRefresh().finally(() => { refreshPromise = null; });
        await refreshPromise;
      } catch {
        refreshPromise = null;
      }
    }
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：
//  - 仅 HTTP 401 才尝试无感刷新并重试；刷新失败才登出
//  - 其余状态码（网络错误、4xx/5xx）只提示，不强制登出
client.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error;
    const url = config?.url || '';

    if (response?.status === 401) {
      // 登录接口自身的 401（密码错误）：提示即可，不刷新不登出
      if (url.includes('/auth/login')) {
        const msg = response?.data?.error || response?.data?.message || '登录失败';
        message.error(msg);
        return Promise.reject(error);
      }
      // 刷新接口自身的 401：刷新凭证已失效，直接登出
      if (url.includes('/auth/refresh')) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }
      // 普通业务请求 401：无感刷新后重试一次
      if (!config?._retry) {
        config._retry = true;
        try {
          refreshPromise = refreshPromise || doRefresh().finally(() => { refreshPromise = null; });
          await refreshPromise;
          const token = localStorage.getItem('token');
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
          return client(config); // 重试原请求
        } catch {
          refreshPromise = null;
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      }
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    // 强制修改密码（管理员已重置密码）：跳转到改密页
    if (response?.status === 403 && response?.data?.code === 'FORCE_RESET') {
      if (!window.location.pathname.startsWith('/change-password')) {
        window.location.href = '/change-password';
      }
      return Promise.reject(error);
    }

    // 非 401：只提示错误，不登出（网络波动、500 等不会把用户踢回登录页）
    const msg = response?.data?.error || response?.data?.message || '请求失败';
    message.error(msg);
    return Promise.reject(error);
  }
);

export default client;
