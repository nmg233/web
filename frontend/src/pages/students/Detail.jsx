import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Typography, Space, Spin, Modal, Form, Select, Input, InputNumber, message, Popconfirm } from 'antd';
import { ArrowLeftOutlined, EditOutlined, ReloadOutlined, FormOutlined } from '@ant-design/icons';
import { studentAPI, authAPI, archiveAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import TempPasswordModal from '../../components/TempPasswordModal';

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
  const [detail, setDetail] = useState({});
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [options, setOptions] = useState({ schools: [], teachers: [], mentors: [] });
  const [classes, setClasses] = useState([]);
  const [resetResult, setResetResult] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [form] = Form.useForm();
  const [evalForm] = Form.useForm();
  const isAdmin = user?.role === 'admin';
  const canEvaluate = ['admin', 'academic_mentor'].includes(user?.role);

  const load = () => {
    setLoading(true);
    studentAPI.detail(id).then((res) => {
      setDetail(res);
      if (res.user) setStudent(res.user);
      else if (res.student) setStudent(res.student);
      else setStudent(res);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { setResetResult(null); load(); }, [id]);

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
    setResetting(true);
    setResetResult(null);
    try {
      const res = await authAPI.adminResetPassword(student.id);
      setResetResult(res);
    } catch { /* 错误已由拦截器提示 */ } finally { setResetting(false); }
  };

  const handleSubmitEvaluation = async (values) => {
    setEvalLoading(true);
    try {
      await archiveAPI.submitEvaluation({ student_id: student.id, ...values });
      message.success('评价提交成功');
      evalForm.resetFields();
      setEvalOpen(false);
    } catch { /* handled */ } finally {
      setEvalLoading(false);
    }
  };

  const statusLabels = { disable: '停用账号', archive: '归档账号', restore: '恢复账号' };
  const openStatus = (action) => { setStatusReason(''); setStatusAction(action); };
  const handleStatus = async () => {
    if (!statusReason.trim()) return message.warning('请填写操作原因');
    setStatusSaving(true);
    try {
      const res = await studentAPI.changeStatus(student.id, { action: statusAction, reason: statusReason });
      message.success(res.message);
      setStatusAction(null);
      load();
    } catch { /* handled by API client */ } finally { setStatusSaving(false); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!student) return <p>用户不存在</p>;

  const roleInfo = roleMap[student.role] || { label: student.role, color: 'default' };
  const isStudentTarget = student.role === 'student';

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/students')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{student.real_name} 的详细信息</Title>
        <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
        {isAdmin && isStudentTarget && <>
          {!!student.is_active && !student.archived_at && <Button danger onClick={() => openStatus('disable')}>停用账号</Button>}
          {!student.archived_at && <Button onClick={() => openStatus('archive')}>归档账号</Button>}
          {(!student.is_active || student.archived_at) && <Button onClick={() => openStatus('restore')}>恢复账号</Button>}
        </>}
        {isAdmin && isStudentTarget && (
            <Button type="primary" icon={<EditOutlined />} onClick={openAssign}>编辑分配</Button>
        )}
        {isAdmin && student.role !== 'admin' && (
            <Popconfirm
              title={`确定重置 ${student.real_name} 的密码？`}
              okText="重置" cancelText="取消"
              onConfirm={handleResetPassword}
            >
              <Button icon={<ReloadOutlined />} loading={resetting}>重置密码</Button>
            </Popconfirm>
        )}
        {canEvaluate && isStudentTarget && (
          <Button icon={<FormOutlined />} onClick={() => { evalForm.resetFields(); setEvalOpen(true); }}>提交评价</Button>
        )}
      </Space>
      <Card>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="登录账号">{student.username}</Descriptions.Item>
          <Descriptions.Item label="真实姓名">{student.real_name}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{student.email || '—'}</Descriptions.Item>
          <Descriptions.Item label="手机号">{student.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="学校">{student.school_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="班级">{student.class_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="负责教师">{student.teacher_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="负责导师">{student.mentor_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={student.archived_at ? 'default' : student.is_active ? 'green' : 'red'}>{student.archived_at ? '已归档' : student.is_active ? '正常' : '已停用'}</Tag>
            {student.archived_at && <span>归档时间：{student.archived_at}（UTC）</span>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {isAdmin && detail.statusEvents?.length > 0 && <Card title="账号状态记录" style={{ marginTop: 16 }}>
        {detail.statusEvents.map((event, index) => <p key={index}>
          {event.created_at}（UTC） · {statusLabels[event.action]} · 操作人：{event.actor_username} · 原因：{event.reason}
        </p>)}
      </Card>}
      {!isStudentTarget && ((detail.taughtCourses?.length > 0) || (detail.managedCourses?.length > 0)) && (
        <Card title={student.role === 'teacher' ? '授课课程' : '管理课程'} style={{ marginTop: 16 }}>
          <Space wrap>
            {(detail.taughtCourses || detail.managedCourses || []).map((c) => (
              <Link key={c.id} to={`/courses/${c.id}`}>
                <Tag color={c.status === 'published' ? 'green' : 'orange'}>{c.title}</Tag>
              </Link>
            ))}
          </Space>
        </Card>
      )}

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

      <Modal title={`提交评价：${student.real_name}`} open={evalOpen} onCancel={() => setEvalOpen(false)}
        onOk={() => evalForm.submit()} confirmLoading={evalLoading}>
        <Form form={evalForm} layout="vertical" onFinish={handleSubmitEvaluation}>
          <Form.Item name="enrollment_id" label="评价课程" rules={[{ required: true, message: '请选择评价课程' }]}>
            <Select placeholder="选择课程（该生有效报名）"
              options={(detail.courses || []).map((c) => ({ value: c.enrollment_id, label: c.title }))} />
          </Form.Item>
          <Form.Item name="eval_type" label="评价类型" initialValue="process">
            <Select options={[
              { value: 'process', label: '过程性评价' },
              { value: 'outcome', label: '成果评价' },
            ]} />
          </Form.Item>
          <Form.Item name="score" label="评分（1-100）">
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="comment" label="评语">
            <Input.TextArea rows={4} placeholder="记录该学生本阶段的表现、亮点与建议" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={statusLabels[statusAction]} open={!!statusAction} onOk={handleStatus}
        onCancel={() => setStatusAction(null)} confirmLoading={statusSaving} closable={!statusSaving}
        maskClosable={!statusSaving} cancelButtonProps={{ disabled: statusSaving }} okText="确认操作" cancelText="取消">
        <p>{statusAction === 'restore' ? '恢复后可重新登录，原密码和首次改密要求保持不变。' : '操作后禁止登录，当前会话失效，不再参与新选课；历史学习记录和成长档案仍保留。管理员可以恢复账号。'}</p>
        <Input.TextArea aria-label="操作原因" value={statusReason} onChange={e => setStatusReason(e.target.value)} maxLength={500} showCount rows={3} placeholder="请填写操作原因（必填）" />
      </Modal>
      <TempPasswordModal title="密码已重置" result={resetResult} onClose={() => setResetResult(null)} />
    </div>
  );
}
