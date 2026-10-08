import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Descriptions, Empty, List, Progress, Space, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverStudentDetail() {
  const { studentId } = useParams(); const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState('');
  const load = () => { setError(''); observerAPI.student(studentId).then(setData).catch((err) => setError(err?.response?.data?.error || '无法加载学生学情')); };
  useEffect(load, [studentId]); // eslint-disable-line react-hooks/set-state-in-effect
  if (!data) return <PageContainer title="学生学情"><AsyncPageState loading={!error} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const { student } = data;
  return <PageContainer title={student.real_name} description={`${student.school_name || '-'} · ${student.class_name || '-'} · 只读学情档案`} extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/observer/students')}>返回学生列表</Button>}>
    <Card className="content-card" style={{ marginBottom: 16 }}><Descriptions><Descriptions.Item label="登录账号">{student.username}</Descriptions.Item><Descriptions.Item label="年级">{student.grade || '-'}</Descriptions.Item><Descriptions.Item label="班级">{student.class_name || '-'}</Descriptions.Item></Descriptions></Card>
    <Card className="content-card" title="课程进展" style={{ marginBottom: 16 }}><List dataSource={data.courses} locale={{ emptyText: <Empty description="暂无课程" /> }} renderItem={(c) => <List.Item><List.Item.Meta title={c.title} description={<Space direction="vertical"><Typography.Text>{c.completed_lessons}/{c.lesson_count} 个课时已完成</Typography.Text><Space wrap>{(c.lessons || []).map((lesson) => <Button key={lesson.id} size="small" onClick={() => navigate(`/courses/${c.id}/lessons/${lesson.id}/preview`)}>预览：{lesson.title}</Button>)}</Space></Space>} /><Progress style={{ maxWidth: 240 }} percent={c.lesson_count ? Math.round(c.completed_lessons / c.lesson_count * 100) : 0} /></List.Item>} /></Card>
    <div className="learning-shell"><Card className="content-card" title="课时与学习报告"><List dataSource={data.lessons} locale={{ emptyText: '暂无课时学习记录' }} renderItem={(l) => <List.Item><List.Item.Meta title={`${l.course_title} · ${l.lesson_title}`} description={<Space direction="vertical"><Progress percent={l.progress || 0} size="small" /><Typography.Text>{l.summary || '尚未提交学习报告'}</Typography.Text>{l.review_comment && <Typography.Text type="secondary">导师意见：{l.review_comment}</Typography.Text>}</Space>} /><Tag>{l.report_status || '未提交'}</Tag></List.Item>} /></Card>
      <Card className="content-card" title="近期成长轨迹"><Timeline items={data.timeline.map((event) => ({ children: <><Typography.Text>{event.description}</Typography.Text><br /><Typography.Text type="secondary">{event.created_at}</Typography.Text></> }))} /></Card></div>
    <Card className="content-card" title="已通过成果" style={{ marginTop: 16 }}><List dataSource={data.approved_works} locale={{ emptyText: '暂无已通过成果' }} renderItem={(work) => <List.Item><List.Item.Meta title={work.title} description={`${work.course_title || ''} · ${work.task_title || ''}`} /><Tag color="green">已通过</Tag></List.Item>} /></Card>
  </PageContainer>;
}
