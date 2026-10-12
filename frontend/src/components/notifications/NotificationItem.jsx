import {copyText as siteText} from "../../content/copy";
import { Tag } from 'antd';
import { notificationCategories } from '../../constants/notification';
import { formatBeijingTime } from '../../utils/date';
import NotificationLevelTag from './NotificationLevelTag';
import {useAuth} from '../../store/AuthContext';
import {displayText} from '../../content/displayText';

export default function NotificationItem({ notification, compact = false, onClick, disabled = false }) {
  const {user}=useAuth();const text=value=>user?.role==='student'?displayText(value):value;
  const category = notificationCategories[notification.category] || { label: notification.category || siteText("site.998f1e8c9bee2033") };
  return <button type="button" disabled={disabled} className={`notification-row ${notification.is_read ? 'is-read' : 'is-unread'} ${compact ? 'is-compact' : ''}`} onClick={() => onClick?.(notification)}>
    <span className="notification-row-marker" aria-hidden="true">{notification.is_read ? '✓' : '•'}</span>
    <span className="notification-row-main">
      <span className="notification-row-meta"><Tag>{category.label}</Tag>{!compact && <NotificationLevelTag level={notification.level} />}<span>{notification.is_read ? siteText("site.c28b3f1aabe9b241") : siteText("site.749304003831d3ff")}</span></span>
      <strong>{text(notification.title)}</strong><span className="notification-summary">{text(notification.summary || notification.content)}</span>
      <time>{formatBeijingTime(notification.received_at || notification.published_at)}</time>
    </span><span aria-hidden="true" className="notification-arrow">↗</span>
  </button>;
}
