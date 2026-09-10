/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) {
      authAPI.logout(refresh_token).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // 初始加载：从 localStorage 恢复用户信息，并验证 token
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        // 静默验证 token 有效性；无效时拦截器会自动无感刷新或登出
        authAPI.me().then((res) => {
          setUser(res.user);
          localStorage.setItem('user', JSON.stringify(res.user));
        }).catch(() => {
          // 401 已被拦截器处理（刷新/跳登录）；网络错误不登出
          if (!localStorage.getItem('token')) setUser(null);
        });
      } catch {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const res = await authAPI.login(username, password);
    localStorage.setItem('token', res.token);
    localStorage.setItem('refresh_token', res.refresh_token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const register = async (data) => {
    return await authAPI.register(data);
  };

  // 重新拉取当前用户（修改密码后用于清除 force_reset_password 标志）
  const refreshUser = () => {
    return authAPI.me().then((res) => {
      setUser(res.user);
      localStorage.setItem('user', JSON.stringify(res.user));
      return res.user;
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
