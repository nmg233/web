import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Typography, Space, Spin, Modal, Form, Select, Input, InputNumber, message, Popconfirm } from 'antd';
import { ArrowLeftOutlined, EditOutlined, ReloadOutlined, FormOutlined } from '@ant-design/icons';
import { studentAPI, authAPI, archiveAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import TempPasswordModal from '../../components/TempPasswordModal';

const { Title } = Typography;

const roleMap = {
  admin: { label: siteText("site.2eca5884e555a16c"), color: 'red' },
  academic_mentor: { label: siteText("site.5e67b92082315a2e"), color: 'blue' },
  teacher: { label: siteText("site.1f503f9e99226e71"), color: 'green' },
  student: { label: siteText("site.c5ec741fa7352b9f"), color: 'cyan' },
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
    setStudent(null);
    setDetail({});
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
      message.success(siteText("site.8f56c499f177aab6"));
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
      message.success(siteText("site.55a84bcc0702dcf3"));
      evalForm.resetFields();
      setEvalOpen(false);
    } catch { /* handled */ } finally {
      setEvalLoading(false);
    }
  };

  const statusLabels = { disable: siteText("site.dbe57d9b5d258512"), archive: siteText("site.70d91732eae57355"), restore: siteText("site.4025dc7eb2058e7c") };
  const openStatus = (action) => { setStatusReason(''); setStatusAction(action); };
  const handleStatus = async () => {
    if (!statusReason.trim()) return message.warning(siteText("site.9fedb22b3d9f80b9"));
    setStatusSaving(true);
    try {
      const res = await studentAPI.changeStatus(student.id, { action: statusAction, reason: statusReason });
      message.success(res.message);
      setStatusAction(null);
      load();
    } catch { /* handled by API client */ } finally { setStatusSaving(false); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!student) return <p>{siteText("site.35206c4c39cd4011")}</p>;

  const roleInfo = roleMap[student.role] || { label: student.role, color: 'default' };
  const isStudentTarget = student.role === 'student';

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/students')}>{siteText("site.a3a7e79e9c0117ea")}</Button>
        <Title level={4} style={{ margin: 0 }}>{student.real_name}{siteText("site.5cafc3e864c57ae7")}</Title>
        <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
        {isAdmin && isStudentTarget && <>
          {!!student.is_active && !student.archived_at && <Button danger onClick={() => openStatus('disable')}>{siteText("site.ad2eb1a0a52bc808")}</Button>}
          {!student.archived_at && <Button onClick={() => openStatus('archive')}>{siteText("site.9acb57b8dabc214f")}</Button>}
          {(!student.is_active || student.archived_at) && <Button onClick={() => openStatus('restore')}>{siteText("site.b110bcddc634a8d0")}</Button>}
        </>}
        {isAdmin && isStudentTarget && (
            <Button type="primary" icon={<EditOutlined />} onClick={openAssign}>{siteText("site.6f7866258bd17991")}</Button>
        )}
        {isAdmin && student.role !== 'admin' && (
            <Popconfirm
              title={siteTemplate("site.ff28d04efac3d148", {slot0: (student.real_name)})}
              okText={siteText("site.be389c3ed83319fc")} cancelText={siteText("site.071c8ea2776b9723")}
              onConfirm={handleResetPassword}
            >
              <Button icon={<ReloadOutlined />} loading={resetting}>{siteText("site.9d05be0349a64673")}</Button>
            </Popconfirm>
        )}
        {canEvaluate && isStudentTarget && (
          <Button icon={<FormOutlined />} onClick={() => { evalForm.resetFields(); setEvalOpen(true); }}>{siteText("site.e49d0491c312a888")}</Button>
        )}
      </Space>
      <Card>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={siteText("site.b9449098cf2b37a0")}>{student.username}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.2ec337cfe75a0f15")}>{student.real_name}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.de575fe4403bb2a5")}>{student.email || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.c6ebcc8069646337")}>{student.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.449705fd36cf2441")}>{student.school_name || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.e40d1dfbb35ebb94")}>{student.class_name || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.e38b20e0d8bfe4e0")}>{student.teacher_name || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.2dac133e8e7b689c")}>{student.mentor_name || '—'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.d547baf128cc5a2c")}>
            <Tag color={student.archived_at ? 'default' : student.is_active ? 'green' : 'red'}>{student.archived_at ? siteText("site.0c956200186b85bf") : student.is_active ? siteText("site.6f33632543b17e68") : siteText("site.d06b6ec612882da1")}</Tag>
            {student.archived_at && <span>{siteText("site.f3746c0fda1d1105")}{student.archived_at}（UTC）</span>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {isAdmin && detail.statusEvents?.length > 0 && <Card title={siteText("site.428020abac1ef11a")} style={{ marginTop: 16 }}>
        {detail.statusEvents.map((event, index) => <p key={index}>
          {event.created_at}（UTC） · {statusLabels[event.action]}{siteText("site.1b8cc5cf81834add")}{event.actor_username}{siteText("site.1aa4bd63f9d7f1c1")}{event.reason}
        </p>)}
      </Card>}
      {!isStudentTarget && ((detail.taughtCourses?.length > 0) || (detail.managedCourses?.length > 0)) && (
        <Card title={student.role === 'teacher' ? siteText("site.b267745f6076fe28") : siteText("site.358882b58c684bd6")} style={{ marginTop: 16 }}>
          <Space wrap>
            {(detail.taughtCourses || detail.managedCourses || []).map((c) => (
              <Link key={c.id} to={`/courses/${c.id}`}>
                <Tag color={c.status === 'published' ? 'green' : 'orange'}>{c.title}</Tag>
              </Link>
            ))}
          </Space>
        </Card>
      )}

      <Modal title={siteText("site.d2907012a3a7ae21")} open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={() => form.submit()} width={500}>
        <Form form={form} layout="vertical" onFinish={handleAssign}>
          <Form.Item name="school_id" label={siteText("site.ac98df9ab3cf17f1")}>
            <Select allowClear placeholder={siteText("site.11d6abe40d751fb5")} onChange={handleSchoolChange}
              options={options.schools.map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="class_id" label={siteText("site.65ad5925217a14a2")}>
            <Select allowClear placeholder={siteText("site.38bf0736f254dbcb")}
              options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="teacher_id" label={siteText("site.e38b20e0d8bfe4e0")}>
            <Select allowClear placeholder={siteText("site.307c28d6b551f6ad")}
              options={options.teachers.map((t) => ({ label: t.real_name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="mentor_id" label={siteText("site.2dac133e8e7b689c")}>
            <Select allowClear placeholder={siteText("site.716a9dd9ec99dffa")}
              options={options.mentors.map((m) => ({ label: m.real_name, value: m.id }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={siteTemplate("site.702717da8644368b", {slot0: (student.real_name)})} open={evalOpen} onCancel={() => setEvalOpen(false)}
        onOk={() => evalForm.submit()} confirmLoading={evalLoading}>
        <Form form={evalForm} layout="vertical" onFinish={handleSubmitEvaluation}>
          <Form.Item name="enrollment_id" label={siteText("site.87475559ea9d66b7")} rules={[{ required: true, message: siteText("site.dc0d804b5c5962d8") }]}>
            <Select placeholder={siteText("site.eafdce4f1683973a")}
              options={(detail.courses || []).map((c) => ({ value: c.enrollment_id, label: c.title }))} />
          </Form.Item>
          <Form.Item name="eval_type" label={siteText("site.3a97ab5a41ba4fab")} initialValue="process">
            <Select options={[
              { value: 'process', label: siteText("site.7590464464bcc9fa") },
              { value: 'outcome', label: siteText("site.22f03f64a4a6d4db") },
            ]} />
          </Form.Item>
          <Form.Item name="score" label={siteText("site.2072b8a5b9a09cd0")}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="comment" label={siteText("site.d46eda932061802f")}>
            <Input.TextArea rows={4} placeholder={siteText("site.bb48ad159490efef")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={statusLabels[statusAction]} open={!!statusAction} onOk={handleStatus}
        onCancel={() => setStatusAction(null)} confirmLoading={statusSaving} closable={!statusSaving}
        maskClosable={!statusSaving} cancelButtonProps={{ disabled: statusSaving }} okText={siteText("site.cee1c63a27507816")} cancelText={siteText("site.071c8ea2776b9723")}>
        <p>{statusAction === 'restore' ? siteText("site.683b8ddb292cd015") : siteText("site.2cb610ce3f48e665")}</p>
        <Input.TextArea aria-label={siteText("site.cc7afcd52b704d2a")} value={statusReason} onChange={e => setStatusReason(e.target.value)} maxLength={500} showCount rows={3} placeholder={siteText("site.2f7022f0b9048b3f")} />
      </Modal>
      <TempPasswordModal title={siteText("site.aff7c6be5e5a818a")} result={resetResult} onClose={() => setResetResult(null)} />
    </div>
  );
}
