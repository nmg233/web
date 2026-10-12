import {copyText as siteText} from "../../content/copy";
import {useCourseApis} from '../../student/useCourseApis';
import StudentTasks from '../../student/StudentTasks';
import { useCallback, useMemo, useState } from 'react';
import {useCourseNavigate as useNavigate} from '../../student/useCourseApis';

import { Button, Card, Empty, Progress, Select, Space, Tag, Typography } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/AuthContext';
import useRemote from '../../student/useRemote';
import AsyncPageState from '../../components/common/AsyncPageState';

const labels = { pending: [siteText("site.81690e915575e98a"), 'orange'], in_progress: [siteText("site.ac507991583426f4"), 'blue'], submitted: [siteText("site.51c8b040a89a7aa4"), 'gold'], completed: [siteText("site.60c9540b31fe0212"), 'green'] };
const statusPriority = { rejected: 0, in_progress: 1, pending: 2, submitted: 3, completed: 4 };

function studentState(task) {
  if (task.report_status === 'rejected') return { label: siteText("site.0c9756d838de3661"), color: 'red', action: siteText("site.29647e1fd71a616a") };
  const [label, color] = labels[task.status] || labels.pending;
  return { label, color, action: task.status === 'completed' ? siteText("site.30dd330508cbdd43") : task.status === 'submitted' ? siteText("site.3ee66776196b4651") : task.status === 'in_progress' ? siteText("site.b487f4a4aae4f0f6") : siteText("site.34780049413edd06") };
}

export default function TaskList() {
  const { user } = useAuth();
  return user?.role === 'student' ? <StudentTasks key={user.id} /> : <LegacyTaskList />;
}

function LegacyTaskList() {
 const {taskAPI}=useCourseApis();
  const [status, setStatus] = useState();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const fetcher = useCallback(() => taskAPI.list(status ? { status } : {}), [status,taskAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const tasks = useMemo(() => data?.tasks || [], [data]);
  const groups = useMemo(() => [...tasks]
    .sort((a, b) => (statusPriority[a.report_status || a.status] ?? 9) - (statusPriority[b.report_status || b.status] ?? 9))
    .reduce((all, task) => {
      const group = all[task.course_id] ||= { title: task.course_title, tasks: [] };
      group.tasks.push(task);
      return all;
    }, {}), [tasks]);
  const openTask = (task) => navigate(isStudent ? `/courses/${task.course_id}/lessons/${task.lesson_id}/learn` : `/tasks/${task.id}`);

  return <div className="page-container">
    <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
      <div><Typography.Title level={2} style={{ marginBottom: 4 }}>{isStudent ? siteText("site.2e6d00e03fdff015") : siteText("site.4d493a1ef4338195")}</Typography.Title><Typography.Text type="secondary">{isStudent ? siteText("site.0cd9e446a793f524") : siteText("site.267f58315499d755")}</Typography.Text></div>
      {isStudent && <Select allowClear placeholder={siteText("site.96e2862e63e2ff6c")} value={status} onChange={setStatus} style={{ minWidth: 150 }} options={Object.entries(labels).map(([value, [label]]) => ({ value, label }))} />}
    </div>
    <AsyncPageState loading={loading} error={error} onRetry={retry}>
    {Object.keys(groups).length === 0 ? <Card><Empty description={siteText("site.decde6297593cf5e")} /></Card> : Object.entries(groups).map(([courseId, group]) => <Card className="content-card" key={courseId} title={group.title} style={{ marginBottom: 16 }}>
      {group.tasks.map((task) => {
        const state = studentState(task);
        const progress = task.learning_progress ?? 0;
        return <Card.Grid key={task.id} hoverable onClick={() => openTask(task)} style={{ width: '100%', cursor: 'pointer' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap><Typography.Text strong style={{ fontSize: 16 }}>{task.title}</Typography.Text>{isStudent ? <Tag color={state.color}>{state.label}</Tag> : <Tag color="blue">{siteText("site.93359258003ca60c")}</Tag>}</Space>
            <Typography.Text type="secondary">{siteText("site.84b5b65bb61fa70c")}{task.lesson_title}{siteText("site.9151a558ad78a7f9")}{task.deadline || siteText("site.f3e7f9a072c268f2")}</Typography.Text>
            {isStudent && <><Progress percent={progress} size="small" /><Button type="primary" ghost icon={<RightOutlined />} onClick={(event) => { event.stopPropagation(); openTask(task); }}>{state.action}</Button></>}
          </Space>
        </Card.Grid>;
      })}
    </Card>)}
    </AsyncPageState>
  </div>;
}
