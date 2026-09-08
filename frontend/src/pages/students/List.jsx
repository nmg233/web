import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Space, Input, Typography, Tag, Modal, Form, Select, message, Tabs, Popconfirm, Upload } from 'antd';
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { studentAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

const canManage = (role) => ['admin', 'academic_mentor', 'teacher'].includes(role);

export default function StudentList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await studentAPI.list({ search });
      if (user?.role === 'admin') {
        setData(res.tree || { schools: [], unassigned: { teacher: [], student: [] } });
      } else {
        setData(res.students || []);
        // 教师/导师：仅加载自己有权限的学校（后端 list 已按学校过滤）
        setSchools(res.schools || []);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [search]);

  // 非管理员：添加学生（无身份选择，固定为学生）
  const handleAddStudent = async (values) => {
    try {
      await studentAPI.create(values);
      message.success('添加成功');
      setAddModal(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  // 管理员：添加用户（支持学生/教师/学术导师）
  const handleAddUser = async (values) => {
    try {
      await studentAPI.createUser(values);
      message.success('用户添加成功');
      setAddModal(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleDelete = async (id) => {
    try {
      await studentAPI.delete(id);
      message.success('已删除');
      loadData();
    } catch { /* handled */ }
  };

  // 管理员删除任意角色用户（学生/教师/导师）
  const handleDeleteUser = async (u) => {
    try {
      await studentAPI.deleteUser(u.id);
      message.success(`已删除 ${u.real_name}`);
      loadData();
    } catch { /* handled */ }
  };

  // 管理员树视图中的用户标签（含删除按钮）
  const renderUserTag = (u, color, icon) => (
    <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginBottom: 4 }}>
      <Tag color={color} style={{ cursor: 'pointer', margin: 0 }} onClick={() => navigate(`/students/${u.id}`)}>
        {icon} {u.real_name}
      </Tag>
      <Popconfirm title={`确定删除 ${u.real_name}？`} okText="删除" cancelText="取消" onConfirm={() => handleDeleteUser(u)}>
        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </span>
  );

  // 批量导入：上传文件
  const handleImportFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    setImporting(true);
    setImportResult(null);
    try {
      const res = await studentAPI.importFile(formData);
      setImportResult(res);
      message.success(res.message || '导入完成');
      loadData();
    } catch { /* 错误已在拦截器提示 */ }
    finally { setImporting(false); }
  };

  // 批量导入：下载 CSV 模板
  const downloadTemplate = () => {
    const csv = '\uFEFF姓名,身份,学校名称,班级名称,邮箱,手机号\n' +
      '示例学生,学生,北航附属实验学校,四年级1班,example@xx.com,13800000000\n' +
      '示例教师,教师,北航附属实验学校,四年级1班,,\n' +
      '示例导师,学术导师,,,,';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '用户导入模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSchoolChange = async (schoolId) => {
    if (schoolId) {
      const res = await studentAPI.getClasses(schoolId);
      setClasses(res.classes || []);
    }
  };

  useEffect(() => {
    // Load schools for admin
    if (user?.role === 'admin') {
      import('../../api').then(({ dashboardAPI }) => {
        dashboardAPI.getSchools().then((res) => setSchools(res.schools || [])).catch(() => {});
      });
    }
  }, []);

  // Admin tree view
  if (user?.role === 'admin') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>👥 用户管理</Title>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>添加用户</Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>
          </Space>
        </div>
        <Input.Search placeholder="搜索用户" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300, marginBottom: 16 }} />
        <Tabs items={[
          {
            key: 'tree', label: '组织结构',
            children: (
              <>
                {data.schools ? data.schools.map((school) => (
                  <Card key={school.id} title={`🏫 ${school.name}`} style={{ marginBottom: 12 }} size="small">
                    {school.classes?.map((cls) => (
                      <div key={cls.id} style={{ marginBottom: 8 }}>
                        <strong>📚 {cls.grade ? `${cls.grade} - ` : ''}{cls.name}</strong>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                          {cls.roles?.student?.map((s) => renderUserTag(s, 'blue', null))}
                          {cls.roles?.teacher?.map((t) => renderUserTag(t, 'green', '👨‍🏫'))}
                        </div>
                      </div>
                    ))}
                    {data.academicMentors?.map((m) => renderUserTag(m, 'purple', '⭐'))}
                  </Card>
                )) : null}
                {data.unassigned && (data.unassigned.teacher?.length > 0 || data.unassigned.student?.length > 0) && (
                  <Card title="🚫 未分配（自行注册/无学校班级）" style={{ marginBottom: 12 }} size="small">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {data.unassigned.teacher?.map((u) => renderUserTag(u, 'green', '👨‍🏫'))}
                      {data.unassigned.student?.map((u) => renderUserTag(u, 'blue', null))}
                    </div>
                  </Card>
                )}
              </>
            ),
          },
        ]} />

        <Modal title="添加用户" open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} width={500}>
          <Form form={form} layout="vertical" onFinish={handleAddUser}>
            <Form.Item name="real_name" label="真实姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
            <Form.Item name="role" label="身份" rules={[{ required: true, message: '请选择身份' }]}>
              <Select options={[
                { label: '学生', value: 'student' }, { label: '教师', value: 'teacher' },
                { label: '学术导师', value: 'academic_mentor' },
              ]} onChange={(v) => {
                if (v === 'academic_mentor') {
                  form.setFieldsValue({ school_id: undefined, class_id: undefined });
                  setClasses([]);
                }
              }} />
            </Form.Item>
            <Form.Item name="password" label="密码"><Input.Password placeholder="默认 pbl123456" /></Form.Item>
            <Form.Item name="school_id" label="学校" dependencies={['role']}
              rules={[({ getFieldValue }) => ({
                required: ['student', 'teacher'].includes(getFieldValue('role')),
                message: '学生和教师必须选择学校',
              })]}>
              <Select onChange={handleSchoolChange} options={schools.map((s) => ({ label: s.name, value: s.id }))} />
            </Form.Item>
            <Form.Item name="class_id" label="班级" dependencies={['role']}
              rules={[({ getFieldValue }) => ({
                required: ['student', 'teacher'].includes(getFieldValue('role')),
                message: '学生和教师必须选择班级',
              })]}>
              <Select options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
            </Form.Item>
            <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          </Form>
        </Modal>

        <Modal title="批量导入用户" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={620}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              支持 .csv / .xlsx / .xls 文件。表头：<Text code>姓名,身份,学校名称,班级名称,邮箱,手机号</Text>
              ，身份可选：学生 / 教师 / 学术导师。
            </Text>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
              <Upload
                accept=".csv,.xlsx,.xls"
                showUploadList={false}
                beforeUpload={(file) => { handleImportFile(file); return false; }}
              >
                <Button type="primary" icon={<UploadOutlined />} loading={importing}>选择文件上传</Button>
              </Upload>
            </Space>
            {importResult && (
              <Card size="small" style={{ width: '100%' }}>
                <p style={{ marginBottom: 8 }}>
                  成功：<b style={{ color: '#52c41a' }}>{importResult.imported ?? 0}</b>
                  {'  '}失败：<b style={{ color: '#ff4d4f' }}>{importResult.failed ?? 0}</b>
                </p>
                {importResult.errors?.length > 0 && (
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ color: '#ff4d4f', fontSize: 12 }}>{e}</div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </Space>
        </Modal>
      </div>
    );
  }

  // Non-admin: table view
  const columns = [
    { title: '姓名', dataIndex: 'real_name', render: (text, r) => <a onClick={() => navigate(`/students/${r.id}`)}>{text}</a> },
    { title: '学校', dataIndex: 'school_name' },
    { title: '班级', dataIndex: 'class_name' },
    { title: '状态', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? '正常' : '禁用'}</Tag> },
    ...(canManage(user?.role) ? [{
      title: '操作', render: (_, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>👥 学生管理</Title>
        {canManage(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>添加学生</Button>
        )}
      </div>
      <Card>
        <Input.Search placeholder="搜索学生" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300, marginBottom: 16 }} />
        <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal title="添加学生" open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddStudent}>
          <Form.Item name="real_name" label="真实姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="密码"><Input.Password placeholder="默认 pbl123456" /></Form.Item>
          <Form.Item name="school_id" label="学校" rules={[{ required: true }]}>
            <Select onChange={handleSchoolChange} options={schools.map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="class_id" label="班级" rules={[{ required: true }]}>
            <Select options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
