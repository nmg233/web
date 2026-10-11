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
    <Card title="通知投递监控（仅管理员）" style={{ marginTop: 16 }}
      extra={<Button loading={loading} onClick={load}>刷新队列</Button>}>
      <Alert type={queue.stats.quarantined ? 'warning' : 'info'} showIcon
        message={`未投递 ${queue.stats.pending || 0} 条，已隔离 ${queue.stats.quarantined || 0} 条`}
        description="失败事件会自动退避重试，连续失败 8 次后隔离。列表展示最早的 100 条；手动重放不重复创建已投递通知。" />
      <Table style={{ marginTop: 16 }} size="small" rowKey="event_key" loading={loading}
        dataSource={queue.items} pagination={{ pageSize: 10 }} scroll={{ x: 850 }} columns={[
          { title: '事件标识', dataIndex: 'event_key', width: 250, ellipsis: true },
          { title: '失败次数', dataIndex: 'attempts', width: 90 },
          { title: '状态／下次重试', render: (_, row) => <Space direction="vertical">
            <Tag color={row.quarantined_at ? 'red' : 'orange'}>{row.quarantined_at ? '已隔离' : '等待重试'}</Tag>
            {!row.quarantined_at && (row.next_retry_at || '下个重试周期')}
          </Space> },
          { title: '最近错误', dataIndex: 'last_error', ellipsis: true },
          { title: '操作', width: 100, render: (_, row) => <Button size="small"
            disabled={Boolean(replaying)} loading={replaying === row.event_key}
            onClick={() => replay(row.event_key)}>重放事件</Button> },
        ]} />
    </Card>
  );
}
