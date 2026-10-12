import {copyText as siteText} from "../../content/copy";
import RoleSentence from '../../content/RoleSentence';
import { useCallback, useRef, useState } from 'react';
import { Button, Space, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { notificationAPI } from '../../api';
import { notificationCategories } from '../../constants/notification';
import NotificationLevelTag from '../../components/notifications/NotificationLevelTag';
import useNotifications from '../../hooks/useNotifications';
import useRemoteResource from '../../hooks/useRemoteResource';
import { useAuth } from '../../store/AuthContext';
import { canRoleAccessPath } from '../../utils/roleNavigation';
import { formatBeijingTime } from '../../utils/date';
import { requestError } from '../../utils/requestError';
import { ServicePage, ServicePanel, ReadState, OperationNotice } from '../../components/ServiceUI';

function Detail({ id }) {
  const { user } = useAuth();
  const navigate = useNavigate(), { refreshUnread } = useNotifications();
  const read = useCallback(async () => {
    const data = (await notificationAPI.detail(id)).data.notification;
    void refreshUnread().catch(() => {});
    return data;
  }, [id, refreshUnread]);
  const resource = useRemoteResource(read);
  const [notice, setNotice] = useState(null), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refreshCount = async () => {
    try { await refreshUnread(); if (resource.isCurrent()) setNotice(null); }
    catch { if (resource.isCurrent()) setNotice({ type: 'warning', text: siteText("site.abe4a9e3baf7b941"), retry: true }); }
  };
  const run = async (hide = false) => {
    if (pending.current || !resource.data) return;
    pending.current = true; setBusy(true); setNotice(null);
    const nextRead = !resource.data.is_read;
    try {
      await (hide ? notificationAPI.hide(id) : nextRead ? notificationAPI.markRead(id) : notificationAPI.markUnread(id));
      if (!resource.isCurrent()) return;
      if (hide) {
        let ok = true;
        try { await refreshUnread(); } catch { ok = false; }
        if (resource.isCurrent()) navigate('/notifications', { state: { notice: { type: ok ? 'success' : 'warning', text: ok ? siteText("site.8dd5140f57a5b6e2") : siteText("site.86fb96bb8e7714ab"), retry: !ok } } });
      } else {
        // GET detail marks read. Never re-read it after marking unread.
        resource.update((data) => ({ ...data, is_read: nextRead ? 1 : 0 }));
        await refreshCount();
      }
    } catch (err) {
      if (resource.isCurrent()) {
        if ([403, 404].includes(err.response?.status)) void resource.reload();
        setNotice({ type: 'error', text: requestError(err, { action: siteText("site.e2016e0517101728"), write: true }) });
      }
    } finally { if (resource.isCurrent()) { pending.current = false; setBusy(false); } }
  };
  const item = resource.data;
  return <ServicePage title={siteText("site.00e92d5ffae3e594")} eyebrow={siteText("site.776047e5c6f71e3d")} actions={<Button onClick={() => navigate('/notifications')}>{siteText("site.38a5ca642992714b")}</Button>}>
    <ServicePanel><OperationNotice value={notice} onRetry={refreshCount} /><ReadState {...resource} object={siteText("site.0dac94af865d540e")}>
      {item && <article className="service-article">
        <div className="service-metadata"><Tag>{notificationCategories[item.category]?.label || item.category}</Tag><NotificationLevelTag level={item.level} /><span>{item.is_read ? siteText("site.eb8ad8fea97f0705") : siteText("site.cbac26b22887c555")}</span><time>{formatBeijingTime(item.published_at || item.received_at)}</time></div>
        <h1>{item.title}</h1><RoleSentence as="div" className="service-prose">{item.content}</RoleSentence>
        <Space wrap className="service-actions">
          {canRoleAccessPath(user.role, item.action_url) && <Button type="primary" onClick={() => navigate(item.action_url)}>{siteText("site.479672e870dca090")}</Button>}
          <Button disabled={busy} onClick={() => run()}>{siteText("site.106c52a5512cf0c6")}{item.is_read ? siteText("site.cbac26b22887c555") : siteText("site.eb8ad8fea97f0705")}</Button>
          <Button disabled={busy} onClick={() => run(true)}>{siteText("site.d17e0d76994b4440")}</Button>
        </Space>
      </article>}
    </ReadState></ServicePanel>
  </ServicePage>;
}
export default function NotificationDetail() {
  const { id } = useParams(), { user } = useAuth();
  return <Detail key={`${user.id}:${id}`} id={id} />;
}
