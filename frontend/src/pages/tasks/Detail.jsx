import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import {useCourseApis} from '../../student/useCourseApis';
import StudentTaskRedirect from '../../student/StudentTaskRedirect';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Descriptions, List, Result, Space, Spin, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/AuthContext';

const statusText = { pending: siteText("site.e9cfd75f14af41c6"), in_progress: siteText("site.3404030dc9d3add4"), submitted: siteText("site.8306bf4e372ae934"), completed: siteText("site.903e90ec52c5b925") };

export default function TaskDetail() {
  const { user } = useAuth();
  return user?.role === 'student' ? <StudentTaskRedirect key={user.id} /> : <LegacyTaskDetail />;
}

function LegacyTaskDetail() {
 const {taskAPI}=useCourseApis();
  const { id } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    setData(null);
    taskAPI.detail(id)
      .then(setData)
      .catch((err) => setError(err?.response?.data?.error || siteText("site.505f5c83e82ca25e")))
      .finally(() => setLoading(false));
  }, [id,taskAPI]);
  // 路由参数变化时需立即清空上一任务，避免短暂展示无权访问的旧数据。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <Result status="404" title={siteText("site.8976208a831ef892")} subTitle={error} extra={<Space><Button onClick={() => navigate('/tasks')}>{siteText("site.01dece7607f62205")}</Button><Button type="primary" onClick={load}>{siteText("site.3583ed28fd7a5e7a")}</Button></Space>} />;
  const { task, works } = data;
  if (user?.role === 'student') return <Navigate to={`/courses/${task.course_id}/lessons/${task.lesson_id}/learn`} replace />;
  return <div><Space style={{ marginBottom: 16 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>{siteText("site.66734f78a8c494f9")}</Button><Typography.Title level={4} style={{ margin: 0 }}>{task.title}</Typography.Title></Space>
    <Card><Descriptions column={1} bordered><Descriptions.Item label={siteText("site.dd6f6b3f0bbc9787")}>{task.course_title}</Descriptions.Item><Descriptions.Item label={siteText("site.ed96f367f520caed")}>{task.lesson_title}</Descriptions.Item><Descriptions.Item label={siteText("site.937bfad0e6dde8d2")}><Tag>{statusText[task.status]}</Tag></Descriptions.Item><Descriptions.Item label={siteText("site.2703539c75d20bc5")}>{task.deadline || siteText("site.b4a8c5adf06dc577")}</Descriptions.Item><Descriptions.Item label={siteText("site.af8b9aa09100c534")}>{task.description || siteText("site.34405bc6ddaf6762")}</Descriptions.Item></Descriptions>
      {user?.role === 'student' && <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(`/courses/${task.course_id}/lessons/${task.lesson_id}/learn`)}>{siteText("site.7cbb6c6c21808410")}</Button>}
    </Card>
    {user?.role === 'student' && <Card title={siteText("site.b076077dafd61010")} style={{ marginTop: 16 }}><List dataSource={works} locale={{ emptyText: siteText("site.4b68c6891c40a45f") }} renderItem={(work) => <List.Item><List.Item.Meta title={siteTemplate("site.d073faa86de0f6d9", {slot0: (work.title), slot1: (work.version || 1)})} description={work.description || siteText("site.e1ac2460e522b965")} /><Space><Tag color={work.review_status === 'approved' ? 'green' : work.review_status === 'rejected' ? 'red' : 'orange'}>{work.review_status === 'approved' ? siteText("site.900033a01a94c6ff") : work.review_status === 'rejected' ? siteText("site.fa2eca51c2816d33") : siteText("site.8c677c9d78f18798")}</Tag>{work.review_comment && <Typography.Text>{work.review_comment}</Typography.Text>}</Space></List.Item>} /></Card>}
  </div>;
}
