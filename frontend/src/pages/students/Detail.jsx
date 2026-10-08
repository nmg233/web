import { useState, useEffect,useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Typography, Space, Spin, Modal, Form, Select, Input, InputNumber, message, Popconfirm } from 'antd';
import { ArrowLeftOutlined, EditOutlined, ReloadOutlined, FormOutlined } from '@ant-design/icons';
import { studentAPI, authAPI, archiveAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import TempPasswordModal from '../../components/TempPasswordModal';
import {requestKey} from '../../utils/requestKey';

const { Title } = Typography;

const roleMap = {
  admin: { label: '管理员', color: 'red' },
  academic_mentor: { label: '学术导师', color: 'blue' },
  teacher: { label: '教师', color: 'green' },
  student: { label: '学生', color: 'cyan' },
};

export default function StudentDetail() {
  const {id}=useParams();
  return <StudentDetailContent key={id} />;
}

function StudentDetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [detail, setDetail] = useState({});
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false), [editing, setEditing] = useState(false);
  const [editSchools, setEditSchools] = useState([]), [editClasses, setEditClasses] = useState([]);
  const [editForm] = Form.useForm();
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
  const selectedSchool=Form.useWatch('school_id',form);
  const crossSchool=Boolean(student && selectedSchool && selectedSchool!==student.school_id);
  const assignmentKey=useRef(requestKey());
  const [assignSaving,setAssignSaving]=useState(false);
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
      assignmentKey.current=requestKey();
      setAssignOpen(true);
    } catch { /* handled */ }
  };

  const handleSchoolChange = async (sid) => {
    form.setFieldsValue({ class_id: undefined, teacher_id: undefined });
    setClasses([]);
    if (sid) {
      const c = await studentAPI.getClasses(sid);
      if(form.getFieldValue('school_id')===sid) setClasses(c.classes || []);
    } else {
      setClasses([]);
    }
  };

  const handleAssign = async (values) => {
    setAssignSaving(true);
    try {
      const moved=values.school_id!==student.school_id;
      await studentAPI.assign(id, {...values,class_id:values.class_id??null,teacher_id:values.teacher_id??null,
        mentor_id:moved ? student.mentor_id : values.mentor_id??null,request_key:assignmentKey.current,source_school_id:student.school_id});
      message.success('分配信息已更新');
      setAssignOpen(false);
      load();
    } catch { /* handled */ } finally {setAssignSaving(false);}
  };

  // 管理员重置用户密码：临时密码仅通过弹窗返回给管理员，由管理员线下转告
  const openEdit = async () => {
    try {
    const opts = await studentAPI.getAssignOptions(); setEditSchools(opts.schools);
    const cls = student.school_id ? await studentAPI.getClasses(student.school_id) : { classes: [] };
    setEditClasses(cls.classes); editForm.setFieldsValue({ real_name: student.real_name, role: student.role,
      school_id: student.school_id, class_id: student.class_id, email: student.email, phone: student.phone, profile: student.profile });
    setEditOpen(true);
    } catch { /* API 统一展示错误 */ }
  };
  const saveEdit = async values => {
    setEditing(true);
    try { await studentAPI.updateUser(id,values); setEditOpen(false); message.success('资料已更新，原登录账号保持不变'); load(); }
    catch { /* API 统一展示错误 */ }
    finally { setEditing(false); }
  };

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
        {isAdmin && student.role !== 'admin' && <Button icon={<EditOutlined />} onClick={openEdit}>编辑资料</Button>}
        {isAdmin && student.role !== 'admin' && <>
          {!!student.is_active && !student.archived_at && <Button danger onClick={() => openStatus('disable')}>停用账号</Button>}
          {isStudentTarget && !student.archived_at && <Button onClick={() => openStatus('archive')}>归档账号</Button>}
          {(!student.is_active || student.archived_at) && <Button onClick={() => openStatus('restore')}>恢复账号</Button>}
        </>}
        {isAdmin && isStudentTarget && (
            <Button type="primary" icon={<EditOutlined />} onClick={openAssign}>编辑分配</Button>
        )}
        {isAdmin && student.id !== user.id && (
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
      {isAdmin && detail.schoolTransfers?.length > 0 && <Card title="学生跨校迁移记录" style={{ marginTop: 16 }}>
        {detail.schoolTransfers.map((event) => <p key={event.id}>
          {event.created_at}（UTC） · {event.source_school_name || '原学校'} → {event.target_school_name || event.context.target_school_name}
          {' · '}新负责教师：{event.teacher_name} · 操作人：{event.actor_username} · 原因：{event.reason}
          {' · '}原账号：{event.context.username}，原导师 ID：{event.context.mentor_id || '未分配'}（保持不变）
        </p>)}
      </Card>}
      {!isStudentTarget && ((detail.taughtCourses?.length > 0) || (detail.managedCourses?.length > 0)) && (
        <Card title={student.role === 'teacher' ? '历史关联课程' : '管理课程'} style={{ marginTop: 16 }}>
          <Space wrap>
            {(detail.taughtCourses || detail.managedCourses || []).map((c) => (
              <Link key={c.id} to={`/courses/${c.id}`}>
                <Tag color={c.status === 'published' ? 'green' : 'orange'}>{c.title}</Tag>
              </Link>
            ))}
          </Space>
        </Card>
      )}

      <Modal title="编辑账号资料" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()} confirmLoading={editing} closable={!editing} maskClosable={!editing} cancelButtonProps={{disabled:editing}}>
        <Form form={editForm} layout="vertical" onFinish={saveEdit}>
          <Form.Item name="real_name" label="姓名" rules={[{required:true,whitespace:true}]}><Input maxLength={80}/></Form.Item>
          <Form.Item name="role" label="身份" rules={[{required:true}]}><Select options={[{value:'student',label:'学生'},{value:'teacher',label:'教师'},{value:'academic_mentor',label:'导师'}]} onChange={value=>{if(value==='academic_mentor'){editForm.setFieldsValue({school_id:null,class_id:null});setEditClasses([]);}}}/></Form.Item>
          <Form.Item name="school_id" label="学校" dependencies={['role']} rules={[({getFieldValue})=>({required:getFieldValue('role')!=='academic_mentor',message:'学生/教师必须选择学校'})]}><Select disabled={student.role==='student'} allowClear options={editSchools.map(s=>({value:s.id,label:s.name}))} onChange={async sid=>{editForm.setFieldsValue({class_id:null});setEditClasses([]);if(sid)setEditClasses((await studentAPI.getClasses(sid)).classes);}}/></Form.Item>
          <Form.Item name="class_id" label="班级" dependencies={['role']} rules={[({getFieldValue})=>({required:getFieldValue('role')!=='academic_mentor',message:'学生/教师必须选择班级'})]}><Select allowClear options={editClasses.map(c=>({value:c.id,label:`${c.grade || ''} ${c.name}`}))}/></Form.Item>
          <Form.Item name="email" label="邮箱"><Input/></Form.Item><Form.Item name="phone" label="手机号"><Input/></Form.Item><Form.Item name="profile" label="简介"><Input.TextArea/></Form.Item>
          <p>修改姓名不修改原用户名或现有密码；重置后使用新姓名拼音@123。已有业务历史的账号不能随意更改身份。</p>
          {student.role==='student' && <p>学生跨校请使用“编辑分配”，指定目标学校新教师并填写原因。</p>}
        </Form>
      </Modal>
      <Modal title="编辑分配" open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={() => form.submit()} confirmLoading={assignSaving} closable={!assignSaving} maskClosable={!assignSaving} cancelButtonProps={{disabled:assignSaving}} width={500}>
        <Form form={form} layout="vertical" onFinish={handleAssign} disabled={assignSaving} onValuesChange={()=>{assignmentKey.current=requestKey();}}>
          <Form.Item name="school_id" label="所属学校" rules={[{required:true}]}>
            <Select allowClear placeholder="选择学校" onChange={handleSchoolChange}
              options={options.schools.map((s) => ({ label: s.name, value: s.id,disabled:!s.is_active && s.id!==student.school_id }))} />
          </Form.Item>
          <Form.Item name="class_id" label="所属班级" rules={[{required:crossSchool,message:'跨校必须选择目标学校班级'}]}>
            <Select allowClear placeholder="选择班级"
              options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="teacher_id" label="负责教师" rules={[{required:crossSchool,message:'跨校必须选择目标学校新负责教师'}]}>
            <Select allowClear placeholder="选择负责教师"
              options={options.teachers.filter(t=>t.school_id===selectedSchool).map((t) => ({ label: t.real_name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="mentor_id" label="负责导师">
            <Select allowClear disabled={crossSchool || assignSaving} placeholder="选择负责导师"
              options={options.mentors.map((m) => ({ label: m.real_name, value: m.id }))} />
          </Form.Item>
          {crossSchool && <><Form.Item name="reason" label="跨校迁移原因" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={1000} /></Form.Item><p>跨校保留用户名、密码、负责导师、全部学习历史和已结课结果；仅变更学校、班级和负责教师。</p></>}
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
