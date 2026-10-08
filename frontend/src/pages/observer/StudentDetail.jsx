import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button, Card, Collapse, Descriptions, Empty, List, Progress, Space, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverStudentDetail() {
  const { studentId } = useParams(); const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState('');
  const sequence = useRef(0);
  const location = useLocation();
  const load = async () => {
    const request = ++sequence.current; setData(null); setError('');
    try { const payload = await observerAPI.student(studentId); if (request === sequence.current) setData(payload); }
    catch (err) { if (request === sequence.current) setError(err?.response?.data?.error || '无法加载学生学情'); }
  };
  useEffect(() => { load(); return () => { sequence.current++; }; }, [studentId]); // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  if (!data || data.student.id !== Number(studentId)) return <PageContainer title="学生学情"><AsyncPageState loading={!error} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const { student } = data;
  return <PageContainer title={student.real_name} description={`${student.school_name || '-'} · ${student.class_name || '-'} · 只读学情档案`} extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(location.state?.returnTo?.startsWith('/observer/students?') ? location.state.returnTo : '/observer/students')}>返回学生列表</Button>}>
    <Card className="content-card" style={{ marginBottom: 16 }}><Descriptions><Descriptions.Item label="登录账号">{student.username}</Descriptions.Item><Descriptions.Item label="年级">{student.grade || '-'}</Descriptions.Item><Descriptions.Item label="班级">{student.class_name || '-'}</Descriptions.Item></Descriptions></Card>
    <Card className="content-card" title="课程进展" style={{ marginBottom: 16 }}><List dataSource={data.courses} locale={{ emptyText: <Empty description="暂无课程" /> }} renderItem={(c) => <List.Item><List.Item.Meta title={c.title} description={c.completion?.completed ? `已结课 · ${c.completion.completed_at}` : `${c.completed_lessons}/${c.lesson_count} 个课时已完成`} /><Progress style={{ maxWidth: 240 }} percent={c.completion?.percent || 0} /></List.Item>} /></Card>
    <div className="learning-shell"><Card className="content-card" title="课时与学习报告"><List dataSource={data.lessons} locale={{ emptyText: '暂无课时学习记录' }} renderItem={(l) => <List.Item><List.Item.Meta title={`${l.course_title} · ${l.lesson_title}`} description={<Space direction="vertical"><Progress percent={l.progress || 0} size="small" /><Typography.Text>{l.summary || '尚未提交学习报告'}</Typography.Text>
      <Space wrap><Tag color={l.stages?.review_completed ? 'green' : 'default'}>课堂回顾{l.stages?.review_completed ? '已确认' : '未完成'}</Tag><Tag>卡片 {l.stages?.cards_completed || 0}/{l.stages?.cards_total || 0}</Tag><Tag color={['submitted','approved'].includes(l.report_status) ? 'green' : 'default'}>报告反思{['submitted','approved'].includes(l.report_status) ? '已提交' : l.report_status === 'rejected' ? '待修改' : '未提交'}</Tag><Tag>内容版本 {l.content_version || '尚未开始'}</Tag></Space>
      <Typography.Text type="secondary">最近更新：{l.updated_at || '尚无学习记录'}</Typography.Text>
      <Collapse size="small" items={[{key:'cards',label:'查看卡片与答题进度',children:l.cards?.map((c) => <Typography.Paragraph key={c.id}>{c.title} · {c.completed_at ? '已完成' : '未完成'} · 作答 {c.answered}/{c.exercise_count} · 客观题 {c.best_score === null ? '无评分题' : `${c.best_score} 分`}</Typography.Paragraph>)}]} />{l.review_comment && <Typography.Text type="secondary">导师意见：{l.review_comment}</Typography.Text>}</Space>} /><Tag>{({approved:'评审通过',submitted:'待评审',rejected:'需修改',draft:'草稿'})[l.report_status] || '未提交'}</Tag></List.Item>} /></Card>
      <Card className="content-card" title="近期成长轨迹"><Timeline items={data.timeline.map((event) => ({ children: <><Typography.Text>{event.description}</Typography.Text><br /><Typography.Text type="secondary">{event.created_at}</Typography.Text></> }))} /></Card></div>
    <Card className="content-card" title="已通过成果" style={{ marginTop: 16 }}><List dataSource={data.approved_works} locale={{ emptyText: '暂无已通过成果' }} renderItem={(work) => <List.Item><List.Item.Meta title={work.title} description={`${work.course_title || ''} · ${work.task_title || ''}`} /><Tag color="green">已通过</Tag></List.Item>} /></Card>
  </PageContainer>;
}
