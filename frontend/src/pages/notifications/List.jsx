import { useCallback, useEffect, useState } from 'react';
import { Button, Card, List as AntList, message, Modal, Pagination, Space, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import NotificationFilters from '../../components/notifications/NotificationFilters';
import NotificationItem from '../../components/notifications/NotificationItem';
import useNotifications from '../../hooks/useNotifications';
import { useAuth } from '../../store/AuthContext';
import OutboxPanel from '../../components/notifications/OutboxPanel';

const { Title } = Typography;

export default function NotificationList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refreshUnread } = useNotifications();
  const [filters, setFilters] = useState({ page: 1, pageSize: 20 });
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await notificationAPI.list(filters);
      setItems(response.data.items);
      setPagination(response.data.pagination);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runBatchAction = async (action, successText) => {
    setActionLoading(true);
    try {
      await action();
      message.success(successText);
      await Promise.all([load(), refreshUnread()]);
    } finally {
      setActionLoading(false);
    }
  };

  const markAllRead = () => runBatchAction(notificationAPI.markAllRead, '已将全部通知标记为已读');
  const hideRead = () => Modal.confirm({
    title: '清理已读通知？',
    content: '已读通知将从列表中隐藏，不会影响对应业务数据。',
    okText: '确认清理',
    cancelText: '取消',
    onOk: () => runBatchAction(notificationAPI.hideRead, '已清理已读通知'),
  });

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>通知中心</Title>
        <Space>
          <Button icon={<CheckOutlined />} loading={actionLoading} onClick={markAllRead}>全部已读</Button>
          <Button icon={<DeleteOutlined />} loading={actionLoading} onClick={hideRead}>清理已读</Button>
        </Space>
      </Space>
      <Card>
        <NotificationFilters value={filters} onChange={setFilters} />
        <AntList
          style={{ marginTop: 16 }}
          loading={loading}
          dataSource={items}
          locale={{ emptyText: '暂无符合条件的通知' }}
          renderItem={(item) => (
            <NotificationItem
              notification={item}
              onClick={(notification) => navigate(`/notifications/${notification.id}`)}
            />
          )}
        />
        {pagination.total > pagination.pageSize && (
          <Pagination
            style={{ marginTop: 20, textAlign: 'right' }}
            current={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showSizeChanger
            showTotal={(total) => `共 ${total} 条`}
            onChange={(page, pageSize) => setFilters((current) => ({ ...current, page, pageSize }))}
          />
        )}
      </Card>
      {user?.role === 'admin' && <OutboxPanel />}
    </div>
  );
}
