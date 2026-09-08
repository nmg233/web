import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Typography, Space, Spin, Modal, Form, Select, message, Popconfirm, Alert } from 'antd';
import { ArrowLeftOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { studentAPI, authAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title } = Typography;

const roleMap = {
  admin: { label: '管理员', color: 'red' },
  academic_mentor: { label: '学术导师', color: 'blue' },
  teacher: { label: '教师', color: 'green' },
  student: { label: '学生', color: 'cyan' },
};

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [options, setOptions] = useState({ schools: [], teachers: [], mentors: [] });
  const [classes, setClasses] = useState([]);
  const [resetResult, setResetResult] = useState(null);
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'admin';

  const load = () => {
    setLoading(true);
    studentAPI.detail(id).then((res) => {
      if (res.user) setStudent(res.user);
      else if (res.student) setStudent(res.student);
      else setStudent(res);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  // 打开编辑分配弹窗：加载选项并回填当前值
  const openAssign = async () => {
    try {
      const res = await studentAPI.getAssignOptions();
      setOptions(res);
      if (student.school_id) {
        const c = await studentAPI.getClasses(student.school_id);
        setClasses(c.classes || []);
      }
      form.setFieldsValue({
        school_id: student.school_id,
        class_id: student.class_id,
        teacher_id: student.teacher_id,
        mentor_id: student.mentor_id,
      });
      setAssignOpen(true);
    } catch { /* handled */ }
  };

  const handleSchoolChange = async (sid) => {
    if (sid) {
      const c = await studentAPI.getClasses(sid);
      setClasses(c.classes || []);
      form.setFieldsValue({ class_id: undefined });
    } else {
      setClasses([]);
    }
  };

  const handleAssign = async (values) => {
    try {
      await studentAPI.assign(id, values);
      message.success('分配信息已更新');
      setAssignOpen(false);
      load();
    } catch { /* handled */ }
  };

  // 管理员重置用户密码：临时密码仅通过弹窗返回给管理员，由管理员线下转告
  const handleResetPassword = async () => {
    try {
      const res = await authAPI.adminResetPassword(student.id);
      setResetResult(res);
    } catch { /* 错误已由拦截器提示 */ }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!student) return <p>用户不存在</p>;

  const roleInfo = roleMap[student.role] || { label: student.role, color: 'default' };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/students')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{student.real_name} 的详细信息</Title>
        <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
        {isAdmin && (
          <>
            <Button type="primary" icon={<EditOutlined />} onClick={openAssign}>编辑分配</Button>
            <Popconfirm
              title={`确定重置 ${student.real_name} 的密码？`}
              okText="重置" cancelText="取消"
              onConfirm={handleResetPassword}
            >
              <Button icon={<ReloadOutlined />}>重置密码</Button>
            </Popconfirm>
          </>
        )}
      </Space>
      <Card>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="用户名">{student.username}</Descriptions.Item>
          <Descriptions.Item label="真实姓名">{student.real_name}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{student.email || '—'}</Descriptions.Item>
          <Descriptions.Item label="手机号">{student.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="学校">{student.school_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="班级">{student.class_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="负责教师">{student.teacher_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="负责导师">{student.mentor_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={student.is_active ? 'green' : 'red'}>{student.is_active ? '正常' : '禁用'}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal title="编辑分配" open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={() => form.submit()} width={500}>
        <Form form={form} layout="vertical" onFinish={handleAssign}>
          <Form.Item name="school_id" label="所属学校">
            <Select allowClear placeholder="选择学校" onChange={handleSchoolChange}
              options={options.schools.map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="class_id" label="所属班级">
            <Select allowClear placeholder="选择班级"
              options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="teacher_id" label="负责教师">
            <Select allowClear placeholder="选择负责教师"
              options={options.teachers.map((t) => ({ label: t.real_name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="mentor_id" label="负责导师">
            <Select allowClear placeholder="选择负责导师"
              options={options.mentors.map((m) => ({ label: m.real_name, value: m.id }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="密码已重置"
        open={!!resetResult}
        onCancel={() => setResetResult(null)}
        footer={<Button type="primary" onClick={() => setResetResult(null)}>我知道了</Button>}
      >
        <Alert
          type="success" showIcon
          message={`${student.real_name} 的密码已重置`}
          description="请将以下临时密码线下告知用户；该用户下次登录将被要求修改密码。临时密码不会写入日志。"
        />
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <Typography.Text copyable style={{ fontSize: 28, letterSpacing: 3, fontWeight: 600 }}>
            {resetResult?.temp_password}
          </Typography.Text>
        </div>
      </Modal>
    </div>
  );
}
