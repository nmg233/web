import {copyText as siteText} from "../../content/copy";
import { Tag } from 'antd';
import { notificationLevels } from '../../constants/notification';

export default function NotificationLevelTag({ level }) {
  const item = notificationLevels[level] || { label: level || siteText("site.afec8adc216fc469"), color: 'default' };
  return <Tag color={item.color}>{item.label}</Tag>;
}
