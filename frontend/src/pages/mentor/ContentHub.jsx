import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Progress, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, SearchOutlined } from '@ant-design/icons';
import { learningManageAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ContentHub() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setLessons((await learningManageAPI.lessons()).lessons || []); }
    catch (err) { setError(err?.response?.data?.error || '无法加载可编排课时'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return keyword ? lessons.filter((item) => `${item.course_title} ${item.title}`.toLowerCase().includes(keyword)) : lessons;
  }, [lessons, search]);
  const columns = [
    { title: '课程', dataIndex: 'course_title', render: (value, row) => <Space direction="vertical" size={0}><Typography.Text strong>{value}</Typography.Text><Tag>{row.course_status === 'published' ? '已发布' : row.course_status === 'draft' ? '草稿' : '已归档'}</Tag></Space> },
    { title: '课时', dataIndex: 'title' },
    { title: '课后学习开放检查', render: (_, row) => <div style={{ minWidth: 160 }}><Progress percent={row.readiness?.ready ? 100 : 0} size="small" /><Typography.Text type="secondary">{row.readiness?.ready ? '内容完整，可学习' : row.readiness?.issues?.join('；')}</Typography.Text></div> },
    { title: '配套习题', dataIndex: 'exercise_count', render: (value) => `${value || 0} 题` },
    { title: '操作', render: (_, row) => <Button type="primary" icon={<EditOutlined />} disabled={row.course_status === 'archived' || row.status === 'cancelled'} onClick={() => navigate(`/courses/${row.course_id}/lessons/${row.id}/content`)}>{row.course_status === 'archived' ? '课程已归档' : row.status === 'cancelled' ? '课时已取消' : '设置知识卡片与习题'}</Button> },
  ];
  return <PageContainer title="学习内容编排" description="按课时设置知识卡片和配套习题，发布后学生才能在学习工作台中看到。" extra={<Input allowClear prefix={<SearchOutlined />} placeholder="搜索课程或课时" value={search} onChange={(e) => setSearch(e.target.value)} />}>
    <Card className="content-card"><AsyncPageState loading={loading} error={error} onRetry={load} empty={!visible.length} emptyText="暂无可编排课时，请先创建课程和课时"><Table rowKey="id" columns={columns} dataSource={visible} pagination={{ pageSize: 12 }} scroll={{ x: 760 }} /></AsyncPageState></Card>
  </PageContainer>;
}
