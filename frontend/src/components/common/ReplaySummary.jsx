import { Card, Typography } from 'antd';
import MarkdownContent from './MarkdownContent';

export default function ReplaySummary({ replay }) {
  if (!replay) return null;
  return <Card size="small" title="回放内容摘要" style={{ marginTop: 16 }}>
    {replay.summary ? <MarkdownContent>{replay.summary}</MarkdownContent> :
      <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">课程结束后由导师补充回放内容摘要。</Typography.Paragraph>}
  </Card>;
}
