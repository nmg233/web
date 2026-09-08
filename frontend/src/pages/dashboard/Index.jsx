import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Table, Tag, List, Typography, Button, Space, Spin, Modal, Form, Input, message } from 'antd';
import { BookOutlined, TeamOutlined, FileTextOutlined, BankOutlined, MessageOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { dashboardAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [schoolForm] = Form.useForm();
  const navigate = useNavigate();

  const loadData = () => {
    dashboardAPI.getIndex().then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleAddSchool = async (values) => {
    try {
      await dashboardAPI.addSchool(values);
      message.success('学校添加成功');
      setAddSchoolOpen(false);
      schoolForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <Text type="danger">加载失败</Text>;

  const { prompt, stats } = data;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>👋 欢迎回来，{user?.real_name}</Title>
        <Text type="secondary">{data.today}</Text>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card><Statistic title="加盟学校" value={stats.schoolCount} prefix={<BankOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="平台用户" value={stats.userCount} prefix={<TeamOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="在线课程" value={stats.courseCount} prefix={<BookOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="学生作品" value={stats.workCount} prefix={<FileTextOutlined />} /></Card></Col>
        </Row>
      )}

      {/* 今日项目提示（按角色） */}
      {prompt && (
        <Card style={{ marginBottom: 16, background: `linear-gradient(135deg, ${prompt.color}15, ${prompt.color}05)`, borderLeft: `4px solid ${prompt.color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>{prompt.emoji}</span>
            <div>
              <Text strong style={{ fontSize: 16, color: prompt.color }}>今日项目提示</Text>
              <br />
              <Text type="secondary">{prompt.desc}</Text>
            </div>
          </div>
        </Card>
      )}

      <Row gutter={16}>
        {user?.role === 'admin' && data.feedbackStats && (
          <Col span={24} style={{ marginBottom: 16 }}>
            <Card
              title={<Space><MessageOutlined />用户反馈</Space>}
              extra={<Button type="link" onClick={() => navigate('/feedback/manage')}>进入反馈管理</Button>}
            >
              <Row gutter={16}>
                <Col xs={8}><Statistic title="待处理" value={data.feedbackStats.pending || 0} /></Col>
                <Col xs={8}><Statistic title="处理中" value={data.feedbackStats.processing || 0} /></Col>
                <Col xs={8}><Statistic title="紧急未结" value={data.feedbackStats.urgent || 0} valueStyle={{ color: data.feedbackStats.urgent ? '#cf1322' : undefined }} /></Col>
              </Row>
            </Card>
          </Col>
        )}

        {/* 管理员：学校列表 */}
        {user?.role === 'admin' && data.schools && (
          <Col span={24}>
            <Card title="加盟学校" extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddSchoolOpen(true)}>添加学校</Button>}>
              <Table dataSource={data.schools} rowKey="id" pagination={false} size="small"
                columns={[
                  { title: '学校名称', dataIndex: 'name', key: 'name', render: (text, r) => <a onClick={() => navigate(`/dashboard/schools/${r.id}`)}>{text}</a> },
                  { title: '班级数', dataIndex: 'class_count', key: 'class_count' },
                  { title: '用户数', dataIndex: 'user_count', key: 'user_count' },
                  { title: '地区', dataIndex: 'region', key: 'region' },
                ]}
              />
            </Card>

            <Modal title="添加加盟学校" open={addSchoolOpen} onCancel={() => setAddSchoolOpen(false)} onOk={() => schoolForm.submit()}>
              <Form form={schoolForm} layout="vertical" onFinish={handleAddSchool}>
                <Form.Item name="name" label="学校名称" rules={[{ required: true, message: '请输入学校名称' }]}>
                  <Input placeholder="如：北京市第一小学" />
                </Form.Item>
                <Form.Item name="region" label="地区"><Input placeholder="如：北京市海淀区" /></Form.Item>
                <Form.Item name="contact_person" label="联系人"><Input /></Form.Item>
                <Form.Item name="contact_phone" label="联系电话"><Input /></Form.Item>
                <Form.Item name="description" label="简介"><Input.TextArea rows={3} /></Form.Item>
              </Form>
            </Modal>
          </Col>
        )}

        {/* 教师/导师：我的课程和最近作品 */}
        {data.myCourses && data.myCourses.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title="我的课程" style={{ marginBottom: 16 }}>
              <List dataSource={data.myCourses.slice(0, 5)} renderItem={(c) => (
                <List.Item extra={<Tag color="blue">{c.student_count} 名学生</Tag>}>
                  <a onClick={() => navigate(`/courses/${c.id}`)}>{c.title}</a>
                </List.Item>
              )} />
            </Card>
          </Col>
        )}

        {data.recentWorks && data.recentWorks.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title="最近作品" style={{ marginBottom: 16 }}>
              <List dataSource={data.recentWorks.slice(0, 5)} renderItem={(w) => (
                <List.Item>
                  <List.Item.Meta title={<a onClick={() => navigate(`/works/${w.id}`)}>{w.title}</a>} description={`${w.student_name} · ${w.course_title || '—'}`} />
                </List.Item>
              )} />
            </Card>
          </Col>
        )}

        {/* 学生：滑翔机模拟实验室入口 */}
        {user?.role === 'student' && (
          <Col span={24} style={{ marginBottom: 16 }}>
            <Card
              hoverable
              onClick={() => navigate('/glider')}
              style={{ background: 'linear-gradient(135deg, #1a73e815, #00c2a315)', borderLeft: '4px solid #1a73e8' }}
            >
              <Space size="large" align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <span style={{ fontSize: 32 }}>🛩️</span>
                  <div>
                    <Text strong style={{ fontSize: 16 }}>滑翔机模拟实验室</Text>
                    <br />
                    <Text type="secondary">设计上反角、重心位置与初始速度，用物理引擎试飞你的滑翔机，看它能滑多远</Text>
                  </div>
                </Space>
                <Button type="primary" icon={<RocketOutlined />}>进入试飞</Button>
              </Space>
            </Card>
          </Col>
        )}

        {/* 学生：我的课程 */}
        {user?.role === 'student' && data.myCourses && (
          <Col span={24}>
            <Card title="我的课程" extra={data.canSubmitReflection && <Button type="link" onClick={() => navigate('/archives/reflection')}>✏️ 写反思日志</Button>}>
              <Row gutter={16}>
                {data.myCourses.map((c) => (
                  <Col xs={24} sm={12} md={8} key={c.id} style={{ marginBottom: 16 }}>
                    <Card size="small" hoverable onClick={() => navigate(`/courses/${c.id}`)}>
                      <Title level={5}>{c.title}</Title>
                      <Text type="secondary">作品: {c.my_work_count} | 课时: {c.total_lessons}</Text>
                      <br />
                      <Tag>{c.difficulty}</Tag>
                      <Tag>{c.grade_level}</Tag>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
