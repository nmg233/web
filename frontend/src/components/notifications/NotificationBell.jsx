import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Popover } from 'antd';
import Alert from '../../content/RoleAlert';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import useNotifications from '../../hooks/useNotifications';
import useRemoteResource from '../../hooks/useRemoteResource';
import NotificationItem from './NotificationItem';
import { useAuth } from '../../store/AuthContext';
import { canRoleAccessPath } from '../../utils/roleNavigation';
import { requestError } from '../../utils/requestError';
import { ReadState } from '../ServiceUI';

function Recent({ close }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refreshUnread, reduceUnread, countError } = useNotifications();
  const read = useCallback(async () => (await notificationAPI.recent(8)).data.items, []);
  const resource = useRemoteResource(read);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const handleClick = async (item) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (!item.is_read) { await notificationAPI.markRead(item.id); if (!resource.isCurrent()) return; reduceUnread(); }
      if (!resource.isCurrent()) return;
      void refreshUnread().catch(() => {});
      close();
      navigate(canRoleAccessPath(user.role, item.action_url) ? item.action_url : `/notifications/${item.id}`);
    } catch (err) { if (resource.isCurrent()) setError(requestError(err, { action: siteText("site.ecc77aa768aa6f3a"), write: true })); }
    finally { if (resource.isCurrent()) { pending.current = false; setBusy(false); } }
  };
  return <div className="notification-popover" role="region" aria-label={siteText("site.2ef554fb6b27874b")}>
    <header><strong>{siteText("site.ee45818595dc6fe2")}</strong><Button type="link" onClick={() => { close(); navigate('/notifications'); }}>{siteText("site.09ba1412b4de814e")}</Button><Button type="text" onClick={close} aria-label={siteText("site.300ec2ebfb8b03d3")}>×</Button></header>
    {countError && <Alert type="warning" title={siteText("site.f9ebb056d8ee1643")} action={<Button aria-label={siteText("site.dcaec150da9f1658")} onClick={() => refreshUnread().catch(() => {})}>{siteText("site.59aa273395083ca9")}</Button>} />}
    {error && <Alert type="error" role="alert" title={error} />}
    <div className="notification-popover-list"><ReadState {...resource} object={siteText("site.3328b96d26841f3b")} empty={!resource.data?.length} emptyText={siteText("site.cf9a095b8189d247")}>
      {resource.data?.map((item) => <NotificationItem key={item.id} notification={item} compact disabled={busy} onClick={handleClick} />)}
    </ReadState></div><footer>{siteText("site.6d082232dfb6a987")}</footer>
  </div>;
}
export default function NotificationBell({ icon, buttonClassName }) {
  const { user } = useAuth();
  const { unreadCount, countError } = useNotifications();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useEffect(() => {
    const escape = (event) => { if (event.key === 'Escape') close(); };
    if (open) window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, close]);
  if (!user || user.force_reset_password) return null;
  return <Popover fresh destroyOnHidden trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}
    rootClassName={user.role === 'student' ? 'student-pixel student-interactions service-popover' : undefined}
    content={<div>{open && <Recent key={user.id} close={close} />}</div>} styles={{ body: { padding: 0 } }}>
    <Badge count={countError ? '!' : unreadCount ?? '—'} overflowCount={99} size="small">
      <Button ref={trigger} type="text" shape="circle" className={buttonClassName} aria-label={siteText("site.39fb2788c08dbbd2")} aria-expanded={open}
        title={countError ? siteText("site.4f7b1541c989a4f5") : unreadCount === null ? siteText("site.42960e8fd4036930") : siteTemplate("site.b48ef5ea93b72806", {slot0: (unreadCount)})} icon={icon || <BellOutlined />} />
    </Badge>
  </Popover>;
}
