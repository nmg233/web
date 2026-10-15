import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import { Card, Typography } from 'antd';
import MarkdownContent from './MarkdownContent';

export default function ReplaySummary({ replay }) {
  if (!replay) return null;
  return <Card size="small" title={runtimeCopyText("student26.e1200d0dfcb61f67")} style={{ marginTop: 16 }} data-copy-bindings={JSON.stringify(["student26.e1200d0dfcb61f67"])}>
    {replay.summary ? <MarkdownContent>{replay.summary}</MarkdownContent> :
      <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary"><StudentCopyText id="student26.e9748730d6c99a0f"/></Typography.Paragraph>}
  </Card>;
}
