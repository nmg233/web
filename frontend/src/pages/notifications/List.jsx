import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Pagination, Space } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import useNotifications from '../../hooks/useNotifications';
import useRemoteResource from '../../hooks/useRemoteResource';
import NotificationFilters from '../../components/notifications/NotificationFilters';
import NotificationItem from '../../components/notifications/NotificationItem';
import { ServicePage, ServicePanel, ReadState, ServiceModal, OperationNotice } from '../../components/ServiceUI';
import { requestError } from '../../utils/requestError';

function Results({ filters, setFilters, currentReadRef }) {
  const navigate = useNavigate();
  const read = useCallback(async () => (await notificationAPI.list(filters)).data, [filters]);
  const resource = useRemoteResource(read);
  useEffect(() => {
    const reload = resource.reload;
    currentReadRef.current = reload;
    return () => { if (currentReadRef.current === reload) currentReadRef.current = null; };
  }, [currentReadRef, resource.reload]);
  useEffect(() => {
    if (!resource.data) return;
    const last = Math.max(1, Math.ceil(resource.data.pagination.total / filters.pageSize));
    if (filters.page > last) setFilters(value => ({ ...value, page: last }));
  }, [resource.data, filters, setFilters]);
  const items = resource.data?.items || [], pagination = resource.data?.pagination;
  return <ReadState {...resource} object={siteText("site.405493918b74e7d2")} empty={!items.length} emptyText={filters.read || filters.category || filters.level ? siteText("site.71da1f4b3006d37d") : siteText("site.49ccba0c67a677b4")}>
    <div className="notification-list">{items.map(item => <NotificationItem key={item.id} notification={item} onClick={() => navigate(`/notifications/${item.id}`)} />)}</div>
    {pagination && <Pagination className="service-pagination" current={pagination.page} pageSize={pagination.pageSize} total={pagination.total} showSizeChanger showTotal={total => `共 ${total} 条`}
      onChange={(page, pageSize) => setFilters(value => ({ ...value, page, pageSize }))} />}
  </ReadState>;
}
function AccountList() {
  const location = useLocation(), { refreshUnread } = useNotifications();
  const [notice, setNotice] = useState(location.state?.notice || null), [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ page: 1, pageSize: 20 }), [confirm, setConfirm] = useState(false);
  const pending = useRef(false), alive = useRef(false), currentReadRef = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const readLatest = async () => {
    // A filter may change again while its read is in flight. Follow the currently mounted reader.
    for (let attempt = 0; attempt < 3 && alive.current; attempt++) {
      const read = currentReadRef.current;
      if (!read) return false;
      const ok = await read();
      if (read === currentReadRef.current) return ok;
    }
    return false;
  };
  const reread = async () => {
    const [list, count] = await Promise.all([readLatest(), refreshUnread().then(() => true, () => false)]);
    if (alive.current) setNotice(list && count ? null : { type: 'warning', text: siteText("site.3751e84dbff2566e"), retry: true });
    return list && count;
  };
  const run = async (action, success) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice(null);
    try {
      await action();
      if (!alive.current) return;
      setConfirm(false);
      setNotice({ type: 'success', text: success });
      const ok = await reread();
      if (alive.current) setNotice({ type: ok ? 'success' : 'warning', text: ok ? success : siteTemplate("site.56d627e208da56a1", {slot0: (success)}), retry: !ok });
    } catch (error) {
      if (alive.current) setNotice({ type: 'error', text: requestError(error, { action: siteText("site.c82af180cfd2ae07"), write: true }) });
    } finally { if (alive.current) { pending.current = false; setBusy(false); } }
  };
  return <ServicePage title={siteText("site.79416a8ce702704f")} eyebrow={siteText("site.f3a5908f35d5a8aa")} description={siteText("site.d3e87f5e79033aaa")}>
    <ServicePanel>
      <div className="service-toolbar"><NotificationFilters value={filters} onChange={setFilters} /><Space wrap>
        <Button disabled={busy || notice?.retry} onClick={() => run(notificationAPI.markAllRead, siteText("site.3a6ffa684c57a9b6"))}>{siteText("site.76c5c80ccc07591e")}</Button>
        <Button disabled={busy || notice?.retry} onClick={() => setConfirm(true)}>{siteText("site.12dd0a248334665f")}</Button>
      </Space></div>
      <p className="service-muted">{siteText("site.f086bf89a6f1a314")}</p>
      <OperationNotice value={notice} onRetry={reread} />
      <Results key={JSON.stringify(filters)} filters={filters} setFilters={setFilters} currentReadRef={currentReadRef} />
      <ServiceModal title={siteText("site.d9e95b15b0c22838")} open={confirm} onCancel={() => !busy && setConfirm(false)} okText={siteText("site.498398e07f0cba40")} cancelText={siteText("site.a7740a240aee5108")} confirmLoading={busy}
        onOk={() => run(notificationAPI.hideRead, siteText("site.83df7e0be066d32f"))}>
        <p>{siteText("site.94b33fc322781440")}</p>
        {confirm && <OperationNotice value={notice} />}
      </ServiceModal>
    </ServicePanel>
  </ServicePage>;
}
export default function NotificationList() {
  const { user } = useAuth();
  return <AccountList key={user.id} />;
}
