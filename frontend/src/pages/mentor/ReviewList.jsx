import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { mentorReviewAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import { REPORT_STATUS } from '../../constants/status';

export default function ReviewList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sequence = useRef(0);
  const [data, setData] = useState({ items: [], pagination: {} });
  const status = ['submitted','approved','rejected'].includes(params.get('status')) ? params.get('status') : 'submitted';
  const page = Math.max(1, parseInt(params.get('page'),10) || 1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { const request = ++sequence.current; setLoading(true); setError(''); try { const result = await mentorReviewAPI.list({ status, page, page_size: 20 }); if (request === sequence.current) setData(result); } catch (err) { if(request === sequence.current) setError(err?.response?.data?.error || '无法加载评审队列'); } finally { if(request === sequence.current) setLoading(false); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); return () => { sequence.current++; }; }, [status, page]);
  const columns = [
    { title: '学生', dataIndex: 'student_name' },
    { title: '课程 / 课时', render: (_, r) => <Space direction="vertical" size={0}><Typography.Text strong>{r.course_title}</Typography.Text><Typography.Text type="secondary">{r.lesson_title}</Typography.Text></Space> },
    { title: '知识学习', render: (_, r) => `${r.cards_completed}/${r.cards_total} 张卡片已完成` },
    { title: '版本', dataIndex: 'version', render: (v) => `第 ${v} 版` },
    { title: '状态', dataIndex: 'status', render: (v) => <Tag color={REPORT_STATUS[v]?.color}>{REPORT_STATUS[v]?.label || v}</Tag> },
    { title: '评分', dataIndex: 'score', render: (value) => Number.isInteger(value) ? `${value} 分` : '-' },
    { title: '操作', render: (_, r) => <Button type="link" onClick={() => navigate(`/mentor/reviews/${r.id}`, { state: { returnTo: `/mentor/reviews?${params}` } })}>查看评审</Button> },
  ];
  return <PageContainer title="学习报告评审" description="集中查看学生课后学习闭环，给出通过或修改意见。" extra={<Select value={status} onChange={(value) => setParams({status:value,page:'1'})} options={[{ value: 'submitted', label: '待评审' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '需修改' }]} />}>
    <Card className="content-card"><AsyncPageState loading={loading} error={error} onRetry={load} empty={!data.items.length} emptyText="当前没有符合条件的学习报告"><Table rowKey="id" columns={columns} dataSource={data.items} scroll={{x:760}} pagination={{ current: page, total: data.pagination.total, pageSize: 20, onChange: (value) => setParams({status,page:String(value)}) }} /></AsyncPageState></Card>
  </PageContainer>;
}
