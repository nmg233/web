import { Card, Typography } from 'antd';

export default function ReplaySummary({ replay }) {
  if (!replay) return null;
  return <Card size="small" title="回放内容摘要" style={{ marginTop: 16 }}>
    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }} type={replay.summary ? undefined : 'secondary'}>
      {replay.summary || '课程结束后由导师补充回放内容摘要。'}
    </Typography.Paragraph>
  </Card>;
}
