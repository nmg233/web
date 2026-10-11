import {copyText as siteText} from "../../content/copy";
import { Card, Tag, Timeline, Typography } from 'antd';
import { formatBeijingTime } from '../../utils/date';

const { Paragraph, Text } = Typography;

export default function FeedbackTimeline({ messages = [] }) {
  if (!messages.length) return <Text type="secondary">{siteText("site.c73066f99b41999f")}</Text>;

  return (
    <Timeline
      items={messages.map((message) => {
        const internal = Boolean(message.is_internal);
        const system = message.message_type === 'system';
        return {
          color: internal ? 'gold' : system ? 'gray' : 'blue',
          children: (
            <Card size="small" style={internal ? { background: '#fffbe6' } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <Text strong>{system ? siteText("site.f691e14a60a3498e") : message.sender_name || siteText("site.950bb3b9c2cdeb86")}</Text>
                <Text type="secondary">{formatBeijingTime(message.created_at)}</Text>
              </div>
              <div style={{ marginTop: 6 }}>
                {internal && <Tag color="gold">{siteText("site.5c64c534b55807ed")}</Tag>}
                <Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0 0' }}>{message.content}</Paragraph>
              </div>
            </Card>
          ),
        };
      })}
    />
  );
}
