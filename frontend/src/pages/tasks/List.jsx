import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Progress, Select, Space, Tag, Typography } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { taskAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import AsyncPageState from '../../components/common/AsyncPageState';

const labels = { pending: ['待完成', 'orange'], in_progress: ['进行中', 'blue'], submitted: ['待导师评审', 'gold'], completed: ['已完成', 'green'] };
const statusPriority = { rejected: 0, in_progress: 1, pending: 2, submitted: 3, completed: 4 };

function studentState(task) {
  if (task.report_status === 'rejected') return { label: '需修改', color: 'red', action: '根据意见修改' };
  const [label, color] = labels[task.status] || labels.pending;
  return { label, color, action: task.status === 'completed' ? '查看学习结果' : task.status === 'submitted' ? '查看评审状态' : task.status === 'in_progress' ? '继续学习' : '开始学习' };
}

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [works, setWorks] = useState([]);
  const [status, setStatus] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); // eslint-disable-line react-hooks/set-state-in-effect
    taskAPI.list(status ? { status } : {}).then((response) => {
      if (!active) return;
      setTasks(isStudent ? response.lessons || [] : response.tasks || []);
      setWorks(response.tasks || []);
    }).catch((err) => { if (active) setError(err?.response?.data?.error || '无法加载课后任务'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, isStudent, retry]);
  const groups = useMemo(() => [...tasks]
    .sort((a, b) => (statusPriority[a.report_status || a.status] ?? 9) - (statusPriority[b.report_status || b.status] ?? 9))
    .reduce((all, task) => {
      const group = all[task.course_id] ||= { title: task.course_title, tasks: [] };
      group.tasks.push(task);
      return all;
    }, {}), [tasks]);
  const openTask = (task) => {
    if (isStudent && !task.started && !task.readiness?.ready) return;
    navigate(isStudent ? `/courses/${task.course_id}/lessons/${task.lesson_id}/learn` : `/tasks/${task.id}`);
  };

  return <div className="page-container">
    <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
      <div><Typography.Title level={2} style={{ marginBottom: 4 }}>{isStudent ? '课后任务' : '任务总览'}</Typography.Title><Typography.Text type="secondary">{isStudent ? '按学习流程完成课堂回顾、知识卡片和学习报告。' : '查看已发布课程任务。'}</Typography.Text></div>
      {isStudent && <Select allowClear placeholder="按状态筛选" value={status} onChange={setStatus} style={{ minWidth: 150 }} options={Object.entries(labels).map(([value, [label]]) => ({ value, label }))} />}
    </div>
    <AsyncPageState loading={loading} error={error} onRetry={() => setRetry((v) => v + 1)}>
    {Object.keys(groups).length === 0 ? <Card><Empty description="暂无课后任务" /></Card> : Object.entries(groups).map(([courseId, group]) => <Card className="content-card" key={courseId} title={group.title} style={{ marginBottom: 16 }}>
      {group.tasks.map((task) => {
        const state = studentState(task);
        const locked = isStudent && !task.started && !task.readiness?.ready;
        const progress = task.learning_progress ?? (task.status === 'completed' ? 100 : task.status === 'submitted' ? 85 : task.status === 'in_progress' ? 25 : 0);
        return <Card.Grid key={task.id} hoverable onClick={() => openTask(task)} style={{ width: '100%', cursor: 'pointer' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap><Typography.Text strong style={{ fontSize: 16 }}>{task.title}</Typography.Text>{isStudent ? <Tag color={state.color}>{state.label}</Tag> : <Tag color="blue">已发布</Tag>}</Space>
            <Typography.Text type="secondary">课时：{task.lesson_title} · 截止：{task.deadline || '未设置'}</Typography.Text>
            {locked && <Typography.Text type="secondary">课后学习尚未开放：{task.readiness?.issues.join('；')}</Typography.Text>}
            {isStudent && <><Progress percent={progress} size="small" /><Button disabled={locked} type="primary" ghost icon={<RightOutlined />} onClick={(event) => { event.stopPropagation(); openTask(task); }}>{locked ? '等待导师补齐内容' : state.action}</Button></>}
          </Space>
        </Card.Grid>;
      })}
    </Card>)}
    {isStudent && <Card title="独立成果任务（不影响课后学习阶段）" style={{ marginTop: 16 }}>
      {works.length === 0 ? <Empty description="暂无独立成果任务" /> : works.map((task) => <Card key={task.id} size="small" style={{ marginBottom: 8 }}>
        <Space wrap><Typography.Text strong>{task.course_title} · {task.title}</Typography.Text><Tag>{labels[task.status]?.[0]}</Tag><Button onClick={() => navigate(`/tasks/${task.id}`)}>查看与提交成果</Button></Space>
      </Card>)}
    </Card>}
    </AsyncPageState>
  </div>;
}
