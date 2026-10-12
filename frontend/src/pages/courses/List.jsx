import {copyText as siteText} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Button, Tag, Space, Input, Card, Typography, Popconfirm } from 'antd';
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
    { title: siteText("site.a7b37507989cb9bc"), dataIndex: 'title', key: 'title', render: (text, r) => user?.role === 'media' ? text : <Link to={`/courses/${r.id}`}>{text}</Link> },
    { title: siteText("site.8ef2646bdcc1bff5"), dataIndex: 'theme', key: 'theme' },
    { title: siteText("site.8a0217e77cf8e02d"), dataIndex: 'grade_level', key: 'grade_level' },
    { title: siteText("site.e8b2df03b912eb21"), dataIndex: 'difficulty', key: 'difficulty', render: (v) => <Tag>{v}</Tag> },
    { title: siteText("site.6cd8d54f39a08720"), dataIndex: 'status', key: 'status', render: (v) => <StatusTag value={v} label={({ published: siteText("site.3835281eb0da37c4"), draft: siteText("site.c4822a69d1c33223"), archived: siteText("site.e1adc1105dc777ad") })[v] || v} type={v === 'published' ? 'success' : v === 'archived' ? 'default' : 'warning'} /> },
    ...(canViewOperationalStats(user?.role) ? [{ title: siteText("site.8f3c8807ed671814"), dataIndex: 'progress', key: 'progress', render: (v) => `${v || 0}%` }] : []),
    ...(canViewOperationalStats(user?.role) ? [{ title: siteText("site.15683f1b8f1ab133"), dataIndex: 'student_count', key: 'student_count' }, { title: siteText("site.dd4db7aacf0120c5"), dataIndex: 'creator_name', key: 'creator_name' }] : []),
    ...(canManage(user?.role) ? [{
      title: siteText("site.802e4d31466b05d9"), key: 'actions', render: (_, r) => r.can_manage ? (
        <Space>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/courses/create')}>{siteText("site.aa67584ea92a428b")}</Button>
        )}
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input prefix={<SearchOutlined />} placeholder={siteText("site.740f701c82b364d5")} value={search} onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => loadCourses({ search })} style={{ width: 250 }} />
          <Button onClick={() => { setSearch(''); loadCourses(); }}>{siteText("site.baf22062b7aecb92")}</Button>
        </Space>
        <Table dataSource={courses} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
