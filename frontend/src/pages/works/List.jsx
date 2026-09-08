import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Card, Button, Tag, Space, Input, Typography, List, Select } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { workAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';

const { Title } = Typography;
const getStatus = (work) => work.review_status === 'rejected' && work.has_newer_version
  ? ['blue', '已修改']
  : ({ pending: ['orange', '待批改'], approved: ['green', '通过'], rejected: ['red', '需修改'] }[work.review_status] || ['', work.review_status]);

export default function WorkList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [works, setWorks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    workAPI.list({ search, course_id: courseId }).then((res) => { setWorks(res.works || []); setCourses(res.courses || []); }).finally(() => setLoading(false));
  }, [search, courseId]);
  useEffect(() => { if (user?.role === 'student') workAPI.pendingTasks().then((res) => setTasks(res.tasks || [])); }, [user]);

  const columns = [
    { title: '作品标题', dataIndex: 'title', render: (text, row) => <Link to={`/works/${row.id}`}>{text}</Link> },
    { title: '学生', dataIndex: 'student_name' }, { title: '课程', dataIndex: 'course_title' }, { title: '任务', dataIndex: 'task_title' },
    { title: '状态', dataIndex: 'review_status', render: (_, row) => <Tag color={getStatus(row)[0]}>{getStatus(row)[1]}</Tag> },
    { title: '提交时间', dataIndex: 'created_at', render: formatBeijingTime },
    { title: '操作', render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/works/${row.id}`)}>查看</Button> },
  ];

  return <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><Title level={4} style={{ margin: 0 }}>📫 作品管理</Title></div>
    {user?.role === 'student' && <Card size="small" title={`待办任务（${tasks.length}）`} style={{ marginBottom: 16 }}><List dataSource={tasks} locale={{ emptyText: '暂无待提交任务' }} renderItem={(task) => <List.Item actions={[<Button type="link" onClick={() => navigate(`/works/upload?task_id=${task.id}&enrollment_id=${task.enrollment_id}`)}>提交作品</Button>]}><List.Item.Meta title={task.title} description={`${task.course_title} · ${task.description || '暂无任务简介'}`} /></List.Item>} /></Card>}
    <Card><Space style={{ marginBottom: 16 }}><Input.Search placeholder="搜索作品" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} /><Select allowClear placeholder="按课程筛选" value={courseId} onChange={setCourseId} style={{ width: 200 }} options={courses.map((c) => ({ label: c.title, value: c.id }))} /></Space><Table dataSource={works} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} /></Card></div>;
}
