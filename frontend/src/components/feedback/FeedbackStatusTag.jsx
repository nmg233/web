import {copyText as siteText} from "../../content/copy";
import { Tag } from 'antd';
import { feedbackStatuses } from '../../constants/feedback';

export default function FeedbackStatusTag({ status }) {
  const item = feedbackStatuses[status] || { label: status || siteText("site.542d12d3d628ba48"), color: 'default' };
  return <Tag color={item.color}>{item.label}</Tag>;
}
