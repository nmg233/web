import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, List, Space, Statistic, Tag, Typography } from 'antd';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverDashboard() {
  const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState('');
  const load = () => { setError(''); observerAPI.dashboard().then(setData).catch((err) => setError(err?.response?.data?.error || '无法加载观察数据')); };
  useEffect(load, []); // eslint-disable-line react-hooks/set-state-in-effect
  if (!data) return <PageContainer title="学情观察"><AsyncPageState loading={!error} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const s = data.stats;
  return <PageContainer title="学情观察" description="只读查看明确分配给你的学生学习进展；课程教学与评审由执行导师负责。" extra={<Button type="primary" onClick={() => navigate('/observer/students')}>查看全部学生</Button>}>
    <div className="metric-grid" style={{ marginBottom: 20 }}><Card><Statistic title="负责学生" value={s.assigned_students} /></Card><Card><Statistic title="本周完成课时" value={s.weekly_completed} /></Card><Card><Statistic title="学习中学生" value={s.pending_students} /></Card><Card><Statistic title="需关注学生" value={s.risk_students} /></Card></div>
    <div className="learning-shell"><Card className="content-card" title="需关注学生"><List dataSource={data.risk_students} locale={{ emptyText: '暂无系统识别的关注项' }} renderItem={(item) => <List.Item actions={[<Button key="view" type="link" onClick={() => navigate(`/observer/students/${item.id}`)}>查看</Button>]}><List.Item.Meta title={item.real_name} description={<Space wrap>{item.school_name} · {item.class_name}{item.risk_tags.map((tag) => <Tag color="orange" key={tag}>{tag}</Tag>)}</Space>} /></List.Item>} /></Card>
      <Card className="content-card" title="近期学习报告"><List dataSource={data.recent_reports} locale={{ emptyText: '暂无学习报告' }} renderItem={(item) => <List.Item><List.Item.Meta title={`${item.student_name} · ${item.lesson_title}`} description={<Space><Typography.Text type="secondary">{item.course_title}</Typography.Text><Tag>{({submitted:'待评审',rejected:'需修改',approved:'已通过',draft:'草稿'})[item.status] || item.status} · 第 {item.version} 版</Tag></Space>} /></List.Item>} /></Card></div>
  </PageContainer>;
}
