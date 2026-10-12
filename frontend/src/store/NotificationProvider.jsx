import {copyText as siteText} from "../content/copy";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notificationAPI } from '../api';
import { useAuth } from './AuthContext';
import NotificationContext from './notificationContext';
import { requestError } from '../utils/requestError';

function AccountNotifications({ enabled, children }) {
  const [unreadCount, setUnreadCount] = useState(null);
  const [countError, setCountError] = useState('');
  const alive = useRef(true), sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refreshUnread = useCallback(async () => {
    if (!enabled) return null;
    const current = ++sequence.current;
    try {
      const response = await notificationAPI.unreadCount();
      if (alive.current && current === sequence.current) { setUnreadCount(response.data.count); setCountError(''); }
      return response.data.count;
    } catch (error) {
      if (alive.current && current === sequence.current) { setUnreadCount(null); setCountError(requestError(error, { action: siteText("site.96869c9fe4f00ac9") })); }
      throw error;
    }
  }, [enabled]);
  const reduceUnread = useCallback((amount = 1) => setUnreadCount((value) => value === null ? null : Math.max(0, value - amount)), []);
  useEffect(() => {
    alive.current = true;
    if (!enabled) return () => { alive.current = false; };
    const refresh = () => { void refreshUnread().catch(() => {}); };
    const initial = setTimeout(refresh, 0), timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { alive.current = false; invalidate(); clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [enabled, refreshUnread, invalidate]);
  const value = useMemo(() => ({ unreadCount, countError, refreshUnread, reduceUnread }), [unreadCount, countError, refreshUnread, reduceUnread]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
export default function NotificationProvider({ children }) {
  const { user } = useAuth();
  return <AccountNotifications key={`${user?.id || 'none'}:${!!user?.force_reset_password}`} enabled={!!user && !user.force_reset_password}>{children}</AccountNotifications>;
}
