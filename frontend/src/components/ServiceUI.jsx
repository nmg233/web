import {copyText as siteText} from "../content/copy";
import { Button, Card, Empty, Spin, Modal } from 'antd';
import Alert from '../content/RoleAlert';
import {displayText} from '../content/displayText';
import { useAuth } from '../store/AuthContext';
import { StudyHeader } from '../student/visual/StudyUI';
import { PixelPanel } from '../student/visual/PixelUI';
import { requestError, objectErrorTitle } from '../utils/requestError';
import '../student/visual/pixel-service.css';

export function ServicePage({ title, eyebrow, description, actions, children }) {
  const { user } = useAuth();
  return <div className={user?.role === 'student' ? 'service-page' : 'service-standard'}>
    {user?.role === 'student'
      ? <StudyHeader title={title} eyebrow={eyebrow} description={description}>{actions}</StudyHeader>
      : <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', marginBottom: 16 }}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</header>}
    {children}
  </div>;
}
export function ServicePanel({ children, className = '' }) {
  const { user } = useAuth();
  return user?.role === 'student' ? <PixelPanel className={`service-panel ${className}`}>{children}</PixelPanel> : <Card>{children}</Card>;
}
export function ReadState({ loading, error, reload, empty, emptyText, object = siteText("site.24ba41835efe9305"), children }) {
  const {user}=useAuth();
  if (loading) return <div className="service-loading" role="status"><Spin /><p>{siteText("site.94765e811629bb50")}{object}…</p></div>;
  if (error) return <Alert type="error" showIcon role="alert" title={objectErrorTitle(error, object)} description={requestError(error)} action={<Button onClick={reload}>{siteText("site.7feabb0598d67a06")}</Button>} />;
  if (empty) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={user?.role==='student'?displayText(emptyText || siteText("site.4d20298f951668f8")):emptyText || siteText("site.3672fb6cc4837964")} />;
  return children;
}
export function OperationNotice({ value, onRetry }) {
  return value ? <Alert role="status" showIcon type={value.type} title={value.text}
    action={value.retry && onRetry ? <Button onClick={onRetry}>{siteText("site.70ed99e14268715a")}</Button> : undefined} /> : null;
}
function containFocus(event) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget.closest('[role="dialog"]') || event.currentTarget;
  const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter((item) => item.getClientRects().length);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
export function ServiceModal(props) {
  const { user } = useAuth();
  return <Modal {...props} okButtonProps={{ ...props.okButtonProps, 'aria-label': props.okText || siteText("site.7c81fd3f8d3e1f70") }} rootClassName={user?.role === 'student' ? 'student-pixel student-interactions service-modal' : undefined}
    modalRender={(node) => <div onKeyDownCapture={containFocus}>{node}</div>} />;
}
