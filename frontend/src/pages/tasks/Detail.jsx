import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Descriptions, List, Result, Space, Spin, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { taskAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const statusText = { pending: '待完成', in_progress: '进行中', submitted: '已提交', completed: '已完结' };

export default function TaskDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(() => {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    setData(null);
    taskAPI.detail(id)
      .then((payload) => { if (request === sequence.current) setData(payload); })
      .catch((err) => { if (request === sequence.current) setError(err?.response?.data?.error || '任务不存在，或当前身份无权查看。'); })
      .finally(() => { if (request === sequence.current) setLoading(false); });
  }, [id]);
  // 路由参数变化时需立即清空上一任务，避免短暂展示无权访问的旧数据。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const cursor = sequence; load(); return () => { cursor.current++; }; }, [load]);
  if (loading || (data && data.task.id !== Number(id))) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <Result status="404" title="无法打开任务" subTitle={error} extra={<Space><Button onClick={() => navigate('/tasks')}>返回任务列表</Button><Button type="primary" onClick={load}>重新加载</Button></Space>} />;
  const { task, works } = data;
  return <div><Space style={{ marginBottom: 16 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>返回任务</Button><Typography.Title level={4} style={{ margin: 0 }}>{task.title}</Typography.Title></Space>
    <Card><Descriptions column={1} bordered><Descriptions.Item label="所属课程">{task.course_title}</Descriptions.Item><Descriptions.Item label="探究阶段">{task.lesson_title}</Descriptions.Item><Descriptions.Item label="任务状态"><Tag>{statusText[task.status]}</Tag></Descriptions.Item><Descriptions.Item label="截止时间">{task.deadline || '未设置'}</Descriptions.Item><Descriptions.Item label="任务目标与指引">{task.description || '暂无说明'}</Descriptions.Item></Descriptions>
      {user?.role === 'student' && <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(`/courses/${task.course_id}/lessons/${task.lesson_id}/learn`)}>进入课后学习</Button>}
    </Card>
    {user?.role === 'student' && (!works.length || works[0].review_status === 'rejected') && <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(`/works/upload?task_id=${task.id}&enrollment_id=${task.enrollment_id}${works[0] ? `&parent_work_id=${works[0].id}` : ''}`)}>{works.length ? '按导师意见重新提交成果' : '提交独立成果'}</Button>}
    {user?.role === 'student' && <Card title="我的提交与反馈" style={{ marginTop: 16 }}><List dataSource={works} locale={{ emptyText: '尚未提交成果' }} renderItem={(work) => <List.Item><List.Item.Meta title={`${work.title} · 第 ${work.version || 1} 版`} description={work.description || '附件成果'} /><Space><Tag color={work.review_status === 'approved' ? 'green' : work.review_status === 'rejected' ? 'red' : 'orange'}>{work.review_status === 'approved' ? '已通过' : work.review_status === 'rejected' ? '需修改' : '待评审'}</Tag>{work.review_comment && <Typography.Text>{work.review_comment}</Typography.Text>}</Space></List.Item>} /></Card>}
  </div>;
}
