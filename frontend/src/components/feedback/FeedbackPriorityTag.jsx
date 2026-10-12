import {copyText as siteText} from "../../content/copy";
import { Tag } from 'antd';
import { feedbackPriorities } from '../../constants/feedback';

export default function FeedbackPriorityTag({ priority }) {
  const item = feedbackPriorities[priority] || { label: priority || siteText("site.607a4db4272616e5"), color: 'default' };
  return <Tag color={item.color}>{item.label}</Tag>;
}
