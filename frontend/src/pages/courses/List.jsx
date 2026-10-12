import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Button, Tag, Space, Input, Card, Typography, Popconfirm, Progress } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import StatusTag from '../../components/common/StatusTag';

const { Title } = Typography;

const canManage = (role) => ['admin', 'academic_mentor'].includes(role);
const canViewOperationalStats = (role) => ['admin', 'academic_mentor'].includes(role);

export default function CourseList() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const sequence = useRef(0);

  const loadCourses = async (params = {}) => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const res = await courseAPI.list(params);
      if(request === sequence.current) setCourses(res.courses || []);
    } catch { /* handled */ }
    finally { if(request === sequence.current) setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const cursor=sequence; loadCourses(); return () => { cursor.current++; }; }, []);

  const columns = [
    { title: '课程名称', dataIndex: 'title', key: 'title', render: (text, r) => user?.role === 'media' ? text : <Link to={`/courses/${r.id}`}>{text}</Link> },
    { title: '主题', dataIndex: 'theme', key: 'theme' },
    { title: '适用学段', dataIndex: 'grade_level', key: 'grade_level', render: (v) => ({primary:'小学',junior:'初中',senior:'高中'})[v] || v },
    { title: '难度', dataIndex: 'difficulty', key: 'difficulty', render: (v) => <Tag>{({basic:'基础',advanced:'进阶',challenge:'挑战'})[v] || v}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v) => <StatusTag value={v} label={({ published: '已发布', draft: '草稿', archived: '已归档' })[v] || v} type={v === 'published' ? 'success' : v === 'archived' ? 'default' : 'warning'} /> },
    ...(canViewOperationalStats(user?.role) ? [{ title: '平均进度', dataIndex: 'progress', key: 'progress', render: (v) => `${v || 0}%` }] : []),
    ...(canViewOperationalStats(user?.role) ? [{ title: '学生数', dataIndex: 'student_count', key: 'student_count' }, { title: '创建者', dataIndex: 'creator_name', key: 'creator_name' }] : []),
    ...(canManage(user?.role) ? [{
      title: '操作', key: 'actions', render: (_, r) => r.can_manage ? (
        <Space>
          <Button size="small" onClick={() => navigate(`/courses/${r.id}/edit`)}>编辑</Button>
          {r.status === 'draft' && (
            <Popconfirm
              title="确定删除该草稿课程？"
              description="有报名记录或历史作品的课程将无法删除。"
              okText="删除" cancelText="取消"
              onConfirm={async () => {
                await courseAPI.delete(r.id);
                loadCourses();
              }}
            >
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ) : '只读'
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{canManage(user?.role) ? '课程管理' : '课程浏览'}</Title>
        {canManage(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/courses/create')}>创建课程</Button>
        )}
      </div>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索课程" value={search} onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => loadCourses({ search })} style={{ width: 250 }} />
          <Button onClick={() => { setSearch(''); loadCourses(); }}>重置</Button>
        </Space>
        {user?.role === 'student' ? <div className="student-course-grid">{loading ? '正在加载课程…' : courses.length ? courses.map((course) => <Card key={course.id} title={course.title}><Space wrap><Tag>{({primary:'小学',junior:'初中',senior:'高中'})[course.grade_level] || course.grade_level}</Tag><Tag>{({basic:'基础',advanced:'进阶',challenge:'挑战'})[course.difficulty] || course.difficulty}</Tag><Tag color={course.completed ? 'green' : 'blue'}>{course.completed ? '已结课' : '学习中'}</Tag></Space><Progress percent={course.progress || 0}/><Button type="primary" onClick={() => navigate(`/courses/${course.id}`)}>查看课程与课时</Button></Card>) : '暂无已报名课程'}</div> : <Table dataSource={courses} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />}
      </Card>
    </div>
  );
}
