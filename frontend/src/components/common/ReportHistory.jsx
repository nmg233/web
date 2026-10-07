import { Button, Card, Space, Tag, Typography } from 'antd';

export default function ReportHistory({ history = [], reportId, onView }) {
  if (history.length < 2) return null;
  return <Card className="content-card" title="提交与评审历史" style={{ marginBottom: 16 }}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      {history.map((item) => <Card size="small" key={item.id}>
        <Space wrap>
          <Tag>第 {item.version} 版</Tag>
          <Typography.Text>{item.status === 'submitted' ? '待评审' : item.status === 'approved' ? '已通过' : '已退回'}</Typography.Text>
          <Button type="link" disabled={item.id === reportId} onClick={() => onView(item.id)}>查看该版本</Button>
        </Space>
        {item.review_comment && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{item.review_comment}</Typography.Paragraph>}
      </Card>)}
    </Space>
  </Card>;
}
