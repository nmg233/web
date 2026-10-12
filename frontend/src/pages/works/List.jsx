import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Card, Button, Tag, Space, Input, Typography, List, Select, Alert } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { workAPI } from '../../api';
import StudentWorks from '../../student/StudentWorks';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';
import useRemote from '../../student/useRemote';
import AsyncPageState from '../../components/common/AsyncPageState';

const { Title } = Typography;
const getStatus = (work) => work.review_status === 'rejected' && work.has_newer_version
  ? ['blue', siteText("site.2d23c87fc3b355e5")]
  : ({ pending: ['orange', siteText("site.a02633cc2c1488d8")], approved: ['green', siteText("site.ffaa0c790e11ee57")], rejected: ['red', siteText("site.fa8a73bedf5d6b6d")] }[work.review_status] || ['', work.review_status]);

export default function WorkList() {
  const { user } = useAuth();
  return user?.role === 'student' ? <StudentWorks /> : <StaffWorkList />;
}

function StaffWorkList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState();
  const fetcher = useCallback(async () => {
    const [works, tasks] = await Promise.all([workAPI.list({ search, course_id: courseId }), user?.role === 'student' ? workAPI.pendingTasks() : Promise.resolve({ tasks: [] })]);
    return { ...works, tasks: tasks.tasks || [] };
  }, [search, courseId, user?.role]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const { works = [], tasks = [], courses = [] } = data || {};

  const columns = [
    { title: siteText("site.563c9a3f9af2e15b"), dataIndex: 'title', render: (text, row) => <Link to={`/works/${row.id}`}>{text}</Link> },
    { title: siteText("site.d86a7934af9f54cb"), dataIndex: 'student_name' }, { title: siteText("site.9d6f620e92380c5c"), dataIndex: 'course_title' }, { title: siteText("site.27700a48b753e9ba"), dataIndex: 'task_title' },
    { title: siteText("site.357377033f9ab415"), dataIndex: 'review_status', render: (_, row) => <Tag color={getStatus(row)[0]}>{getStatus(row)[1]}</Tag> },
    { title: siteText("site.da1f1189cef33c54"), dataIndex: 'created_at', render: formatBeijingTime },
    { title: siteText("site.e0d4ef9a6e9892f6"), render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/works/${row.id}`)}>{siteText("site.773db9128220465f")}</Button> },
  ];

  if (error) return <AsyncPageState error={error} onRetry={retry} />;
  return <div className="page-container"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><Title level={4} style={{ margin: 0 }}>{user?.role === 'student' ? siteText("site.1dd3513dea197726") : siteText("site.6ce325b15833bba4")}</Title></div>
    {data?.filterInvalid && <Alert type="warning" showIcon title={siteText("site.d1761839cf656af1")} action={<Button onClick={() => setCourseId(undefined)}>{siteText("site.57f9833a8592e3ae")}</Button>} style={{ marginBottom: 16 }} />}
    {user?.role === 'student' && <Card size="small" title={siteTemplate("site.9c0b9d4fc0f8afcb", {slot0: (tasks.length)})} style={{ marginBottom: 16 }}><List dataSource={tasks} locale={{ emptyText: siteText("site.ba29dd750cfb06d5") }} renderItem={(task) => <List.Item actions={[<Button type="link" onClick={() => navigate(`/works/upload?task_id=${task.id}&enrollment_id=${task.enrollment_id}`)}>{siteText("site.ce668bf6da143dfd")}</Button>]}><List.Item.Meta title={task.title} description={`${task.course_title} · ${task.description || siteText("site.9ab727d12a10b24d")}`} /></List.Item>} /></Card>}
    <Card><Space style={{ marginBottom: 16 }}><Input.Search placeholder={siteText("site.c8c216bda986b643")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} /><Select allowClear placeholder={siteText("site.d1284c497b508f85")} value={data?.filterInvalid ? undefined : courseId} onChange={setCourseId} style={{ width: 200 }} options={courses.map((c) => ({ label: c.title, value: c.id }))} /></Space><Table dataSource={works} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} /></Card></div>;
}
