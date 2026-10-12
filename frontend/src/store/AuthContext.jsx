/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI } from '../api';
import { saveAuthSession } from '../utils/authSession';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const generation = useRef(0);

  const logout = () => {
    generation.current++;
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) {
      authAPI.logout(refresh_token).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
    setLoading(false); setAuthError('');
  };

  const verify = async () => {
    const request = ++generation.current;
    setLoading(true); setAuthError('');
    if (!localStorage.getItem('token')) { setUser(null); setLoading(false); return null; }
    try {
      const res = await authAPI.me();
      if (request !== generation.current) return null;
      setUser(res.user); localStorage.setItem('user', JSON.stringify(res.user));
      return res.user;
    } catch (err) {
      if (request === generation.current) {
        setUser(null);
        if (localStorage.getItem('token')) setAuthError('暂时无法核实登录身份，请检查网络并重试。未清除你的登录凭据。');
      }
      throw err;
    } finally { if (request === generation.current) setLoading(false); }
  };
  useEffect(() => { verify().catch(() => {}); return () => { generation.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySession = (res) => {
    const nextUser = saveAuthSession(localStorage, res);
    setUser(nextUser);
    setLoading(false); setAuthError('');
    return nextUser;
  };

  const apply = async (operation) => {
    const request = ++generation.current;
    try {
      const res = await operation();
      if (request !== generation.current) throw new Error('登录操作已失效，请重试');
      return applySession(res);
    } finally { if (request === generation.current) setLoading(false); }
  };
  const login = (username, password) => apply(() => authAPI.login(username, password));

  // 改密已撤销旧会话，先保存新凭证再继续请求业务接口。
  const changePassword = (data) => apply(() => authAPI.changePassword(data));


  // 重新拉取当前用户（修改密码后用于清除 force_reset_password 标志）
  const refreshUser = verify;

  return (
    <AuthContext.Provider value={{ user, loading, authError, retryAuth: verify, login, logout, refreshUser, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
