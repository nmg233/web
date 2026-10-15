import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, message, Space, Table, Tag } from 'antd';
import { notificationAPI } from '../../api';

export default function OutboxPanel() {
  const [queue, setQueue] = useState({ stats: {}, items: [] });
  const [loading, setLoading] = useState(false);
  const [replaying, setReplaying] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setQueue((await notificationAPI.outbox()).data); }
    catch { /* 全局请求拦截器显示错误，保留上次列表。 */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const replay = async (key) => {
    setReplaying(key);
    try {
      const result = await notificationAPI.replayOutbox(key);
      message.success(result.data.message);
    } catch { /* 失败保留在队列，刷新展示最新退避记录。 */ }
    finally { await load(); setReplaying(null); }
  };
  return (
    <Card title={runtimeCopyText("student26.7e92dbb141feded7")} style={{ marginTop: 16 }}
      extra={<Button loading={loading} onClick={load}><StudentCopyText id="student26.eea64aad9d06a8de"/></Button>} data-copy-bindings={JSON.stringify(["student26.7e92dbb141feded7"])}>
      <Alert type={queue.stats.quarantined ? 'warning' : 'info'} showIcon
        message={`未投递 ${queue.stats.pending || 0} 条，已隔离 ${queue.stats.quarantined || 0} 条`}
        description={runtimeCopyText("student26.360c4afc5469b0f8")}  data-copy-bindings={JSON.stringify(["student26.360c4afc5469b0f8"])}/>
      <Table style={{ marginTop: 16 }} size="small" rowKey="event_key" loading={loading}
        dataSource={queue.items} pagination={{ pageSize: 10 }} scroll={{ x: 850 }} columns={[
          { title: runtimeCopyText("student26.61b6bf003fe21346"), dataIndex: 'event_key', width: 250, ellipsis: true },
          { title: runtimeCopyText("student26.85b6a199064426dc"), dataIndex: 'attempts', width: 90 },
          { title: runtimeCopyText("student26.2cd5659eb2e126b1"), render: (_, row) => <Space direction="vertical">
            <Tag color={row.quarantined_at ? 'red' : 'orange'}>{row.quarantined_at ? <StudentCopyText id="student26.900bea262c32cfa0"/> : <StudentCopyText id="student26.87b85ac9f39746b0"/>}</Tag>
            {!row.quarantined_at && (row.next_retry_at || <StudentCopyText id="student26.89b59dc5d386ac20"/>)}
          </Space> },
          { title: runtimeCopyText("student26.0bc13f492b36dde2"), dataIndex: 'last_error', ellipsis: true },
          { title: runtimeCopyText("student26.c3ce8447d7022376"), width: 100, render: (_, row) => <Button size="small"
            disabled={Boolean(replaying)} loading={replaying === row.event_key}
            onClick={() => replay(row.event_key)}><StudentCopyText id="student26.67f8ab0fdd4a4278"/></Button> },
        ]}  data-copy-bindings={JSON.stringify(["student26.61b6bf003fe21346","student26.85b6a199064426dc","student26.2cd5659eb2e126b1","student26.0bc13f492b36dde2","student26.c3ce8447d7022376"])}/>
    </Card>
  );
}
