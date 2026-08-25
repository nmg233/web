import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Tag, Tabs, Form, Input, Modal, Space, Typography, message, Progress, Checkbox, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title } = Typography;

const canManage = (role) => ['admin', 'executive_mentor', 'academic_mentor'].includes(role);

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [progress, setProgress] = useState(0);
  const [lessonModal, setLessonModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [activeLesson, setActiveLesson] = useState(null);
  const [lessonForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  const loadData = async () => {
    try {
      const res = await courseAPI.detail(id);
      setCourse(res.course);
      setLessons(res.lessons || []);
      setResources(res.resources || []);
      setEnrollments(res.enrollments || []);
      setTasks(res.tasks || []);
      setProgress(res.progress || 0);
    } catch { message.error('加载失败'); }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleAddLesson = async (values) => {
    try {
      await courseAPI.addLesson(id, values);
      message.success('课时添加成功');
      setLessonModal(false);
      lessonForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleAddTask = async (values) => {
    try {
      await courseAPI.addTask(activeLesson.id, values);
      message.success('任务添加成功');
      setTaskModal(false);
      taskForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleStudentEnroll = async () => {
    try {
      await courseAPI.studentEnroll(id);
      message.success('选课成功');
      loadData();
    } catch { /* handled */ }
  };

  const downloadResource = async (r) => {
    try {
      const blob = await courseAPI.downloadResource(r.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = r.title || '课程资源';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };

  if (!course) return null;

  const isStudent = user?.role === 'student';
  const isEnrolled = isStudent && enrollments.some((e) => e.student_id === user.id);

  const tabItems = [
    {
      key: 'lessons', label: '课时安排',
      children: (
        <div>
          {canManage(user?.role) && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setLessonModal(true)} style={{ marginBottom: 16 }}>添加课时</Button>
          )}
          {lessons.map((lesson) => (
            <Card key={lesson.id} size="small" style={{ marginBottom: 8 }} title={lesson.title}
              extra={canManage(user?.role) && (
                <Button size="small" onClick={() => { setActiveLesson(lesson); setTaskModal(true); }}>+ 添加任务</Button>
              )}
            >
              {lesson.description && <p>{lesson.description}</p>}
              {lesson.duration && <Tag>{lesson.duration} 分钟</Tag>}
              {tasks.filter((task) => task.lesson_id === lesson.id).map((task) => <div key={task.id} style={{ marginTop: 8 }}><a onClick={() => navigate(`/tasks/${task.id}`)}>{task.title}</a>{task.deadline && <Tag style={{ marginLeft: 8 }}>截止 {task.deadline}</Tag>}</div>)}
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'resources', label: '课程资源',
      children: (
        <div>
          {resources.map((r) => (
            <Card key={r.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Tag>{r.resource_type}</Tag>
                <span>{r.title}</span>
                <Button size="small" type="link" icon={<DownloadOutlined />} onClick={() => downloadResource(r)}>下载</Button>
              </Space>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'students', label: `选课学生 (${enrollments.length})`,
      children: canManage(user?.role) ? (
        <Table dataSource={enrollments} rowKey="id" pagination={false} size="small"
          columns={[
            { title: '姓名', dataIndex: 'student_name' },
            { title: '学校', dataIndex: 'school_name' },
            { title: '班级', dataIndex: 'class_name' },
          ]}
        />
      ) : null,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/courses')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{course.title}</Title>
        {isStudent && !isEnrolled && <Button type="primary" onClick={handleStudentEnroll}>📝 选修此课</Button>}
        {isStudent && isEnrolled && <Tag color="green">已选修</Tag>}
        {isStudent && isEnrolled && <Button onClick={() => navigate(`/courses/${id}/learn`)}>开始学习</Button>}
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="主题">{course.theme || '—'}</Descriptions.Item>
          <Descriptions.Item label="适用学段">{course.grade_level}</Descriptions.Item>
          <Descriptions.Item label="难度">{course.difficulty}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={course.status === 'published' ? 'green' : 'orange'}>{course.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="创建者">{course.creator_name}</Descriptions.Item>
          <Descriptions.Item label="总课时">{course.total_hours || '—'}</Descriptions.Item>
        </Descriptions>
        {course.description && <p style={{ marginTop: 12 }}>{course.description}</p>}
        {isStudent && <Progress percent={Number(progress)} status={progress === 100 ? 'success' : 'active'} />}
      </Card>

      <Tabs items={tabItems} />

      {/* 添加课时 Modal */}
      <Modal title="添加课时" open={lessonModal} onCancel={() => setLessonModal(false)} onOk={() => lessonForm.submit()}>
        <Form form={lessonForm} layout="vertical" onFinish={handleAddLesson}>
          <Form.Item name="title" label="课时名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration" label="时长（分钟）"><Input type="number" /></Form.Item>
        </Form>
      </Modal>

      {/* 添加任务 Modal */}
      <Modal title="添加任务" open={taskModal} onCancel={() => setTaskModal(false)} onOk={() => taskForm.submit()}>
        <Form form={taskForm} layout="vertical" onFinish={handleAddTask}>
          <Form.Item name="title" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="task_type" label="任务类型" initialValue="inquiry">
            <Select options={[['inquiry', '调研'], ['experiment', '实验'], ['creation', '创作'], ['reflection', '反思'], ['presentation', '展示']].map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="require_upload" valuePropName="checked" initialValue>
            <Checkbox>要求上传附件</Checkbox>
          </Form.Item>
          <Form.Item name="deadline" label="截止时间"><Input type="datetime-local" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
