import {copyText as siteText} from "../../content/copy";
import { Button, Empty, Result, Skeleton } from 'antd';

export default function AsyncPageState({ loading, error, empty = false, onRetry, emptyText = siteText("site.84e162787e6c9e99"), children }) {
  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (error) return <Result status="error" title={siteText("site.f47c0233662c1dec")} subTitle={error} extra={<Button type="primary" onClick={onRetry}>{siteText("site.98b0b2edd59a7678")}</Button>} />;
  if (empty) return <Empty description={emptyText} />;
  return children;
}
