import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import { Button, Card, Space, Tag, Typography } from 'antd';

export default function ReportHistory({ history = [], reportId, onView }) {
  if (history.length < 2) return null;
  return <Card className="content-card" title={runtimeCopyText("student26.4bf64b2f6a5e3e1e")} style={{ marginBottom: 16 }} data-copy-bindings={JSON.stringify(["student26.4bf64b2f6a5e3e1e"])}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      {history.map((item) => <Card size="small" key={item.id}>
        <Space wrap>
          <Tag><StudentCopyText id="student26.2892896e8fc118a7"/>{item.version}<StudentCopyText id="student26.fc7407252ab56dda"/></Tag>
          <Typography.Text>{item.status === 'submitted' ? <StudentCopyText id="student26.6c06df73225dcde6"/> : item.status === 'approved' ? <StudentCopyText id="student26.79a10d3675812db6"/> : <StudentCopyText id="student26.fb368c2452eb600b"/>}</Typography.Text>
          <Button type="link" disabled={item.id === reportId} onClick={() => onView(item.id)}><StudentCopyText id="student26.f194e3651a31f712"/></Button>
        </Space>
        {item.review_comment && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{item.review_comment}</Typography.Paragraph>}
      </Card>)}
    </Space>
  </Card>;
}
