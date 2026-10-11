import {copyText as siteText} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
      message.success(siteText("site.c612b6191419163d"));
      setAddSchoolOpen(false);
      schoolForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <Text type="danger">{siteText("site.16279ec1bdee4bdf")}</Text>;

  const { prompt, stats } = data;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>{siteText("site.75493d3a1d4919b6")}{user?.real_name}</Title>
        <Text type="secondary">{data.today}</Text>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card><Statistic title={user?.role === 'admin' ? siteText("site.6bd53bff0cade4bc") : siteText("site.1779ace1d1d111d7")} value={stats.schoolCount} prefix={<BankOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title={user?.role === 'admin' ? siteText("site.c1d4876d33408f87") : siteText("site.049f257b97e2144c")} value={stats.userCount} prefix={<TeamOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title={user?.role === 'admin' ? siteText("site.31180b7602e0e948") : siteText("site.0241cd4b8f7a74a4")} value={stats.courseCount} prefix={<BookOutlined />} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title={siteText("site.fa552b28516a8ce3")} value={stats.workCount} prefix={<FileTextOutlined />} /></Card></Col>
        </Row>
      )}

      {/* 今日项目提示（按角色） */}
      {prompt && (
        <Card style={{ marginBottom: 16, background: `linear-gradient(135deg, ${prompt.color}15, ${prompt.color}05)`, borderLeft: `4px solid ${prompt.color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>{prompt.emoji}</span>
            <div>
              <Text strong style={{ fontSize: 16, color: prompt.color }}>{siteText("site.bb38e12e8201834b")}</Text>
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
              title={<Space><MessageOutlined />{siteText("site.6b5dda31bdc685be")}</Space>}
              extra={<Button type="link" onClick={() => navigate('/feedback/manage')}>{siteText("site.c5f8b7526fc56f9a")}</Button>}
            >
              <Row gutter={16}>
                <Col xs={8}><Statistic title={siteText("site.329b48d945ade5b8")} value={data.feedbackStats.pending || 0} /></Col>
                <Col xs={8}><Statistic title={siteText("site.e4e05a01c3127270")} value={data.feedbackStats.processing || 0} /></Col>
                <Col xs={8}><Statistic title={siteText("site.7ac79c55829a7733")} value={data.feedbackStats.urgent || 0} valueStyle={{ color: data.feedbackStats.urgent ? '#cf1322' : undefined }} /></Col>
              </Row>
            </Card>
          </Col>
        )}

        {/* 管理员：学校列表 */}
        {user?.role === 'admin' && data.schools && (
          <Col span={24}>
            <Card title={siteText("site.6bd53bff0cade4bc")} extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddSchoolOpen(true)}>{siteText("site.bb89ab68b1ecb420")}</Button>}>
              <Table dataSource={data.schools} rowKey="id" pagination={false} size="small"
                columns={[
                  { title: siteText("site.212aa2cb72b9aeb6"), dataIndex: 'name', key: 'name', render: (text, r) => <Link to={`/dashboard/schools/${r.id}`}>{text}</Link> },
                  { title: siteText("site.5f503668858cd280"), dataIndex: 'class_count', key: 'class_count' },
                  { title: siteText("site.f42a737b0fb96f93"), dataIndex: 'user_count', key: 'user_count' },
                  { title: siteText("site.e4be2e7ce1a1aa9c"), dataIndex: 'region', key: 'region' },
                ]}
              />
            </Card>

            <Modal title={siteText("site.18746a6ddccc63aa")} open={addSchoolOpen} onCancel={() => setAddSchoolOpen(false)} onOk={() => schoolForm.submit()}>
              <Form form={schoolForm} layout="vertical" onFinish={handleAddSchool}>
                <Form.Item name="name" label={siteText("site.212aa2cb72b9aeb6")} rules={[{ required: true, message: siteText("site.0bb70fa347bf75a9") }]}>
                  <Input placeholder={siteText("site.97938c473576614b")} />
                </Form.Item>
                <Form.Item name="region" label={siteText("site.e4be2e7ce1a1aa9c")}><Input placeholder={siteText("site.6355ea2766b55799")} /></Form.Item>
                <Form.Item name="contact_person" label={siteText("site.736af10ea58bd5ae")}><Input /></Form.Item>
                <Form.Item name="contact_phone" label={siteText("site.5f46c39e7e8efeb5")}><Input /></Form.Item>
                <Form.Item name="description" label={siteText("site.1f4cbbbe80cef460")}><Input.TextArea rows={3} /></Form.Item>
              </Form>
            </Modal>
          </Col>
        )}

        {/* 教师/导师：我的课程和最近作品 */}
        {data.myCourses && data.myCourses.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title={siteText("site.fd67de636300817e")} style={{ marginBottom: 16 }}>
              <List dataSource={data.myCourses.slice(0, 5)} renderItem={(c) => (
                <List.Item extra={<Tag color="blue">{c.student_count}{siteText("site.d1f885aefbbe4967")}</Tag>}>
                  <Link to={`/courses/${c.id}`}>{c.title}</Link>
                </List.Item>
              )} />
            </Card>
          </Col>
        )}

        {data.recentWorks && data.recentWorks.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title={siteText("site.dd5f79c16186739a")} style={{ marginBottom: 16 }}>
              <List dataSource={data.recentWorks.slice(0, 5)} renderItem={(w) => (
                <List.Item>
                  <List.Item.Meta title={<Link to={`/works/${w.id}`}>{w.title}</Link>} description={`${w.student_name} · ${w.course_title || '—'} · ${w.review_status === 'pending' ? siteText("site.f7bb025c7a1ec661") : w.review_status === 'approved' ? siteText("site.9c74a2d81bfdd157") : siteText("site.5cb9d1c01b5cd79f")}`} />
                </List.Item>
              )} />
            </Card>
          </Col>
        )}

        {/* 学生：下一节课 + 待办 */}
        {user?.role === 'student' && (
          <Col xs={24} lg={12}>
            <Card title={siteText("site.7ff0d075e6b53c9d")} style={{ marginBottom: 16 }}>
              {data.nextLesson ? (
                <div>
                  <Text strong style={{ fontSize: 16 }}>{data.nextLesson.course_title} · {data.nextLesson.lesson_title}</Text>
                  <br />
                  <Text type="secondary">{siteText("site.9dd9e8b5d4c04541")}{data.nextLesson.start_at.replace('T', ' ')}
                    {data.nextLesson.location ? ` · 📍 ${data.nextLesson.location}` : ''}
                    {data.nextLesson.instructor_name ? ` · 👨‍🏫 ${data.nextLesson.instructor_name}` : ''}
                  </Text>
                  <br />
                  <Button size="small" type="link" style={{ paddingLeft: 0 }} onClick={() => navigate(`/courses/${data.nextLesson.course_id}`)}>{siteText("site.854a0c4f64aa838e")}</Button>
                </div>
              ) : (
                <Text type="secondary">{siteText("site.a712d99f0329d511")}</Text>
              )}
            </Card>
            <Card title={siteText("site.aa74ef8cc8161b6c")} style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>{data.pendingTasks?.length ?? 0}</Text>
                  <Text type="secondary">{siteText("site.9dbdd2478dc0cb76")}</Text>
                  {data.pendingTasks?.length > 0 && <Button size="small" type="link" onClick={() => navigate('/tasks')}>{siteText("site.1a30b4273301ce0e")}</Button>}
                </div>
                <div>
                  <Text strong>{data.revisions?.length ?? 0}</Text>
                  <Text type="secondary">{siteText("site.c2758e99601292c9")}</Text>
                  {data.revisions?.length > 0 && <Button size="small" type="link" onClick={() => navigate('/works')}>{siteText("site.70bbb4bfd659f6bb")}</Button>}
                </div>
              </Space>
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
                    <Text strong style={{ fontSize: 16 }}>{siteText("site.5756f0fb2b7b366d")}</Text>
                    <br />
                    <Text type="secondary">{siteText("site.326bddbbaff54a6c")}</Text>
                  </div>
                </Space>
                <Button type="primary" icon={<RocketOutlined />}>{siteText("site.526fa1b43097357b")}</Button>
              </Space>
            </Card>
          </Col>
        )}

        {/* 学生：我的课程 */}
        {user?.role === 'student' && data.myCourses && (
          <Col span={24}>
            <Card title={siteText("site.fd67de636300817e")} extra={data.canSubmitReflection && <Button type="link" onClick={() => navigate('/archives/reflection')}>{siteText("site.0ec9d9b3eec1c69e")}</Button>}>
              <Row gutter={16}>
                {data.myCourses.map((c) => (
                  <Col xs={24} sm={12} md={8} key={c.id} style={{ marginBottom: 16 }}>
                    <Card size="small" hoverable onClick={() => navigate(`/courses/${c.id}`)}>
                      <Title level={5}>{c.title}</Title>
                      <Text type="secondary">{siteText("site.d1c7b900046cebd3")}{c.my_work_count}{siteText("site.a618b20c2e8377b4")}{c.total_lessons}</Text>
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
