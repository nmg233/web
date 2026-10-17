import {copyText as siteText} from "../../content/copy";
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
      title: siteText("site.802e4d31466b05d9"), key: 'actions', render: (_, r) => r.can_manage ? (
        <Space>
          {user?.role==='admin'&&<Button size="small" onClick={()=>navigate(`/courses/${r.id}?tab=students`)}>管理授权</Button>}
          <Button size="small" onClick={() => navigate(`/courses/${r.id}/edit`)}>{siteText("site.d735782323a6623c")}</Button>
          {r.status === 'draft' && (
            <Popconfirm
              title={siteText("site.66bfa752eed51c3b")}
              description={siteText("site.c5892bba73258d10")}
              okText={siteText("site.353238d6e634038d")} cancelText={siteText("site.5359f3f3d688c85f")}
              onConfirm={async () => {
                await courseAPI.delete(r.id);
                loadCourses();
              }}
            >
              <Button size="small" danger>{siteText("site.6b9aeead262da420")}</Button>
            </Popconfirm>
          )}
        </Space>
      ) : siteText("site.2aafda3179dfd6dc")
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{canManage(user?.role) ? siteText("site.e8852d20ff6054dc") : siteText("site.7f43419faac5a913")}</Title>
        {canManage(user?.role) && (
          <Button aria-label="新建课程" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/courses/create')}>新建课程</Button>
        )}
      </div>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索课程" value={search} onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => loadCourses({ search })} style={{ width: 250 }} />
          <Button onClick={() => { setSearch(''); loadCourses(); }}>{siteText("site.baf22062b7aecb92")}</Button>
        </Space>
        {user?.role === 'student' ? <div className="student-course-grid">{loading ? '正在加载课程…' : courses.length ? courses.map((course) => <Card key={course.id} title={course.title}><Space wrap><Tag>{({primary:'小学',junior:'初中',senior:'高中'})[course.grade_level] || course.grade_level}</Tag><Tag>{({basic:'基础',advanced:'进阶',challenge:'挑战'})[course.difficulty] || course.difficulty}</Tag><Tag color={course.completed ? 'green' : 'blue'}>{course.completed ? '已结课' : '学习中'}</Tag></Space><Progress percent={course.progress || 0}/><Button type="primary" onClick={() => navigate(`/courses/${course.id}`)}>查看课程与课时</Button></Card>) : '暂无已报名课程'}</div> : <Table dataSource={courses} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />}
      </Card>
    </div>
  );
}
