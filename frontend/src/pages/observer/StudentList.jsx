import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Select, Space, Table, Tag } from 'antd';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverStudentList() {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [search, setSearch] = useState(params.get('search') || '');
  const [data, setData] = useState({ items: [], pagination: {}, filters: {} });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const values = Object.fromEntries(new URLSearchParams(query));
    setSearch(values.search || ''); setLoading(true); setError(''); // eslint-disable-line react-hooks/set-state-in-effect
    observerAPI.students({ ...values, page_size: 20 }).then((payload) => {
      if (active) setData(payload);
    }).catch((err) => {
      if (active) setError(err?.response?.data?.error || '无法加载负责学生');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, retry]);
  const change = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === '') next.delete(key); else next.set(key, String(value));
    if (key !== 'page') next.set('page', '1');
    if (key === 'school_id') next.delete('class_id');
    setParams(next);
  };
  const columns = [
    { title: '学生', render: (_, r) => <Space direction="vertical" size={0}><strong>{r.real_name}</strong><span>{r.username}</span></Space> },
    { title: '学校 / 班级', render: (_, r) => `${r.school_name || '-'} / ${r.class_name || '-'}` },
    { title: '近30天完成', dataIndex: 'completed_30d' }, { title: '学习中课时', dataIndex: 'pending_lessons' },
    { title: '关注项', dataIndex: 'risk_tags', render: (tags) => tags.map((tag) => <Tag color="orange" key={tag}>{tag}</Tag>) },
    { title: '操作', render: (_, r) => <Button type="link" onClick={() => navigate(`/observer/students/${r.id}`, { state: { returnTo: `/observer/students?${query}` } })}>查看学情</Button> },
  ];
  return <PageContainer title="负责学生" description="仅查看明确分配给你的学生；同一学生可同时存在学习中和已结课课程。">
    <Space wrap style={{ marginBottom: 16 }}>
      <Input.Search style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} onSearch={() => change('search', search.trim())} placeholder="姓名或账号" allowClear />
      {['school_id', 'class_id', 'course_id'].map((key, i) => <Select key={key} style={{ width: 180 }} allowClear placeholder={['学校', '班级', '课程'][i]} value={params.get(key) ? Number(params.get(key)) : undefined} onChange={(v) => change(key, v)} options={(data.filters?.[['schools','classes','courses'][i]] || []).filter((o) => key !== 'class_id' || !params.get('school_id') || o.school_id === Number(params.get('school_id')))} />)}
      <Select allowClear style={{ width: 160 }} placeholder="学习状态" value={params.get('learning_status') || undefined} onChange={(v) => change('learning_status',v)} options={[{value:'not_started',label:'尚未开始'}, {value:'learning',label:'有未结课课程'}, {value:'completed',label:'有已结课课程'}, {value:'revision',label:'报告需修改'}]} />
    </Space>
    <Card className="content-card"><AsyncPageState loading={loading} error={error} onRetry={() => setRetry((v) => v + 1)} empty={!data.items.length} emptyText="没有符合条件的负责学生">
      <Table rowKey="id" columns={columns} dataSource={data.items} scroll={{ x: 800 }} pagination={{ current: data.pagination.page, total: data.pagination.total, pageSize: 20, onChange: (p) => change('page', p) }} />
    </AsyncPageState></Card>
  </PageContainer>;
}
