import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Alert, Card, Table, Button, Modal, Form, Input, Select, Typography, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { dashboardAPI, studentAPI } from '../../api';
import { requestKey } from '../../utils/requestKey';
import { formatBeijingTime } from '../../utils/date';

const { Title } = Typography;

export default function SchoolDetail() {
  const { id } = useParams();
  return <SchoolDetailContent key={id} id={id} />;
}

function SchoolDetailContent({ id }) {
  const navigate = useNavigate();
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const [options, setOptions] = useState(null);
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();
  const targetSchool = Form.useWatch('target_school_id', transferForm);
  const live = useRef(true);
  const loadSequence = useRef(0);
  const modalSequence = useRef(0);
  const historySequence = useRef(0);
  const busy = useRef(false);
  const transferKey = useRef(null);

  const loadData = async () => {
    const seq = ++loadSequence.current;
    try {
      const res = await dashboardAPI.getSchool(id);
      if (!live.current || seq !== loadSequence.current) return;
      setSchool(res.school); setClasses(res.classes); setError(false);
    } catch { if (live.current && seq === loadSequence.current) setError(true); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { live.current = true; loadData(); return () => { live.current = false; }; }, []);

  const mutate = async (action, success) => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { await action(); if (live.current) { success(); await loadData(); } }
    catch { /* API层显示错误，失败保持表单便于重试。 */ }
    finally { busy.current = false; if (live.current) setSaving(false); }
  };

  const openTransfer = async (record) => {
    const seq = ++modalSequence.current;
    setTransfer(record); setOptions(null); transferForm.resetFields(); transferKey.current = requestKey();
    try {
      const data = await studentAPI.getAssignOptions();
      if (live.current && seq === modalSequence.current) setOptions(data);
    } catch { if (live.current && seq === modalSequence.current) setTransfer(null); }
  };
  const openHistory = async (record) => {
    const seq = ++historySequence.current;
    setHistory({ name: record.name, loading: true, rows: [] });
    try {
      const data = await studentAPI.classTransfers(record.id);
      if (live.current && seq === historySequence.current) setHistory({ name: record.name, rows: data.transfers });
    } catch { if (live.current && seq === historySequence.current) setHistory(null); }
  };
  const handleTransfer = (values) => {
    const record = transfer;
    return mutate(() => studentAPI.transferClass(record.id, { ...values, source_school_id: school.id,
      student_count: record.student_count, request_key: transferKey.current }), () => {
      message.success('已迁移 ' + record.student_count + ' 名学生，原账号和学习历史保留');
      setTransfer(null); transferForm.resetFields();
    });
  };

  if (!school) return error ? <Alert type="error" message="学校加载失败" action={<Button onClick={loadData}>重试</Button>} /> : <Card loading />;

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{school.name}</Title>
        <Popconfirm title={school.is_active ? '停用后只停止新建班级和账号，现有账号继续使用。确认停用？' : '确认恢复学校新增功能？'} onConfirm={() => mutate(
          () => studentAPI.schoolStatus(school.id, !school.is_active), () => message.success('学校状态已更新'))}>
          <Button disabled={saving}>{school.is_active ? '停用学校' : '恢复学校'}</Button>
        </Popconfirm>
      </Space>
      {error && <Alert type="error" showIcon message="刷新失败，当前可能是旧数据，请刷新后操作" action={<Button onClick={loadData}>刷新</Button>} />}
      <Card title="班级管理" extra={<Button disabled={!school.is_active || saving || error} type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加班级</Button>}>
        <p>班级总数：{school.class_count} | 用户数：{school.user_count}</p>
        <p>学校 ID：{school.id} | 建号缩写：{school.account_code || '首次创建账号时生成并固定'}；重名组织导入请使用 ID</p>
        {school.region && <p>地区：{school.region}</p>}
        <Table dataSource={classes} rowKey="id" pagination={false} columns={[
          { title: '班级 ID', dataIndex: 'id' }, { title: '班级名称', dataIndex: 'name' },
          { title: '年级', dataIndex: 'grade' }, { title: '学生数', dataIndex: 'student_count' },
          { title: '操作', render: (_, record) => <Space wrap>
            <Button type="link" disabled={saving || error} onClick={() => openTransfer(record)}>整班迁校</Button>
            <Button type="link" onClick={() => openHistory(record)}>迁移记录</Button>
            <Popconfirm title="确定删除？关联账号的班级不能直接删除。" onConfirm={() => mutate(
              () => dashboardAPI.deleteClass(id, record.id), () => message.success('班级已删除'))}>
              <Button type="link" danger disabled={saving || error}>删除</Button>
            </Popconfirm>
          </Space> },
        ]} />
      </Card>
      <Modal title="添加班级" open={modalOpen} confirmLoading={saving} onCancel={() => { if (!saving) setModalOpen(false); }} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" disabled={saving} onFinish={(values) => mutate(() => dashboardAPI.addClass(id, values), () => {
          message.success('班级添加成功'); setModalOpen(false); form.resetFields();
        })}>
          <Form.Item name="name" label="班级名称" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <Form.Item name="grade" label="年级"><Input placeholder="如：三年级" /></Form.Item>
        </Form>
      </Modal>
      <Modal title={'整班迁校：' + (transfer?.name || '')} open={Boolean(transfer)} confirmLoading={saving}
        okText="确认迁移" okButtonProps={{ disabled: !options || Boolean(transfer?.staff_count) }}
        onCancel={() => { if (!saving) { ++modalSequence.current; setTransfer(null); } }} onOk={() => transferForm.submit()}>
        <Alert type={transfer?.staff_count ? 'warning' : 'info'} showIcon style={{ marginBottom: 16 }}
          message={transfer?.staff_count ? '仍有 ' + transfer.staff_count + ' 个非学生账号绑定该班级，请先在用户管理调整其班级归属。' : '迁移全班 ' + (transfer?.student_count || 0) + ' 名学生（含停用／归档账号），班级 ID、用户名、密码、负责导师和学习历史均不变。'} />
        <Form form={transferForm} layout="vertical" disabled={saving || !options || Boolean(transfer?.staff_count)} onFinish={handleTransfer}
          onValuesChange={(changed) => { transferKey.current = requestKey(); if ('target_school_id' in changed) transferForm.setFieldValue('teacher_id', undefined); }}>
          <Form.Item name="target_school_id" label="目标学校" rules={[{ required: true }]}>
            <Select placeholder="选择已启用的目标学校" options={(options?.schools || []).filter(s => s.id !== school.id && s.is_active).map(s => ({ value: s.id, label: s.name + '（ID ' + s.id + '）' }))} />
          </Form.Item>
          <Form.Item name="teacher_id" label="目标学校新负责教师" rules={[{ required: true }]}>
            <Select placeholder="必须选择目标学校的有效教师" disabled={!targetSchool || saving} options={(options?.teachers || []).filter(t => t.school_id === targetSchool).map(t => ({ value: t.id, label: t.real_name + '（ID ' + t.id + '）' }))} />
          </Form.Item>
          <Form.Item name="reason" label="迁移原因" rules={[{ required: true, whitespace: true, max: 1000 }]}><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
          <p>学生换校后旧登录令牌失效，可用原用户名和密码重新登录。迁移完成后，本页移除该班级；可返回工作台进入目标学校，不会自动切换页面。</p>
        </Form>
      </Modal>
      <Modal title={(history?.name || '') + '：迁移记录'} open={Boolean(history)} footer={null} width={820} onCancel={() => { ++historySequence.current; setHistory(null); }}>
        <Table loading={history?.loading} dataSource={history?.rows || []} rowKey="id" pagination={{ pageSize: 5 }}
          expandable={{ expandedRowRender: row => <Table size="small" pagination={false} dataSource={row.members} rowKey="id" columns={[
            { title: '学生', dataIndex: 'real_name' }, { title: '原用户名（保持不变）', dataIndex: 'username' },
            { title: '原负责教师 ID', dataIndex: 'teacher_id' }, { title: '保留的导师 ID', dataIndex: 'mentor_id' },
          ]} /> }} columns={[
            { title: '时间（北京）', dataIndex: 'created_at', render: formatBeijingTime },
            { title: '学校变更', render: (_, r) => r.context.source_school_name + '（' + r.source_school_id + '） → ' + r.context.target_school_name + '（' + r.target_school_id + '）' },
            { title: '新教师', render: (_, r) => r.context.teacher_name + '（' + r.teacher_id + '）' },
            { title: '操作者', render: (_, r) => r.context.actor_name + '（' + r.actor_id + '）' }, { title: '原因', dataIndex: 'reason' },
          ]} />
      </Modal>
    </div>
  );
}
