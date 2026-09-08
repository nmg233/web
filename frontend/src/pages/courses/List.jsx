import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Button, Tag, Space, Input, Card, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import StatusTag from '../../components/common/StatusTag';

const { Title } = Typography;

const canManage = (role) => ['admin', 'academic_mentor'].includes(role);

export default function CourseList() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const loadCourses = async (params = {}) => {
    setLoading(true);
    try {
      const res = await courseAPI.list(params);
      setCourses(res.courses || []);
    } catch { /* handled */ }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadCourses(); }, []);

  const columns = [
    { title: '课程名称', dataIndex: 'title', key: 'title', render: (text, r) => <Link to={`/courses/${r.id}`}>{text}</Link> },
    { title: '主题', dataIndex: 'theme', key: 'theme' },
    { title: '适用学段', dataIndex: 'grade_level', key: 'grade_level' },
    { title: '难度', dataIndex: 'difficulty', key: 'difficulty', render: (v) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v) => <StatusTag value={v} label={({ published: '已发布', draft: '草稿', archived: '已归档' })[v] || v} type={v === 'published' ? 'success' : v === 'archived' ? 'default' : 'warning'} /> },
    ...(user?.role !== 'student' ? [{ title: '学习进度', dataIndex: 'progress', key: 'progress', render: (v) => `${v || 0}%` }] : []),
    ...(user?.role !== 'student' ? [{ title: '学生数', dataIndex: 'student_count', key: 'student_count' }, { title: '创建者', dataIndex: 'creator_name', key: 'creator_name' }] : []),
    ...(canManage(user?.role) ? [{
      title: '操作', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/courses/${r.id}/edit`)}>编辑</Button>
          {['admin', 'academic_mentor'].includes(user?.role) && (
            <Button size="small" danger onClick={async () => {
              await courseAPI.delete(r.id);
              loadCourses();
            }}>删除</Button>
          )}
        </Space>
      )
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📚 课程管理</Title>
        {canManage(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/courses/create')}>创建课程</Button>
        )}
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索课程" value={search} onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => loadCourses({ search })} style={{ width: 250 }} />
          <Button onClick={() => { setSearch(''); loadCourses(); }}>重置</Button>
        </Space>
        <Table dataSource={courses} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
