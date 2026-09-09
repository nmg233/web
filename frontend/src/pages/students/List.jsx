import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Card, Button, Space, Input, Typography, Tag, Modal, Form, Select, message, Popconfirm, Upload } from 'antd';
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { studentAPI, dashboardAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { downloadAccounts, downloadTemporaryAccounts } from '../../utils/accountExport';
import TempPasswordModal from '../../components/TempPasswordModal';

const { Title, Text } = Typography;

const canManage = (role) => ['admin', 'academic_mentor', 'teacher'].includes(role);
const usernameRules = [{ pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/, message: '请输入 4–64 位字母、数字、下划线或连字符，以字母或数字开头' }];

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
  const [createResult, setCreateResult] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
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

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [search]);

  // 非管理员：添加学生（无身份选择，固定为学生）
  const handleAddStudent = async (values) => {
    setCreating(true);
    try {
      const res = await studentAPI.create(values);
      setCreateResult(res);
      setAddModal(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ } finally { setCreating(false); }
  };

  // 管理员：添加用户（支持学生/教师/学术导师）
  const handleAddUser = async (values) => {
    setCreating(true);
    try {
      const res = await studentAPI.createUser(values);
      setCreateResult(res);
      setAddModal(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ } finally { setCreating(false); }
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
        {icon} {u.real_name}（{u.username}）
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
    const csv = '\uFEFF登录账号,姓名,身份,学校名称,班级名称,邮箱,手机号\n' +
      'BJFX-2026-0001,示例学生,学生,北航附属实验学校,四年级1班,example@xx.com,13800000000\n' +
      'T-BJFX-001,示例教师,教师,北航附属实验学校,四年级1班,,\n' +
      'M-0001,示例导师,学术导师,,,,';
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
      dashboardAPI.getSchools().then((res) => setSchools(res.schools || [])).catch(() => {});
    }
  }, [user?.role]);

  // Admin tree view
  if (user?.role === 'admin') {
    const accounts = [
      ...(data.schools || []).flatMap((s) => (s.classes || []).flatMap((c) => [...(c.roles?.student || []), ...(c.roles?.teacher || [])])),
      ...(data.academicMentors || []),
      ...(data.unassigned?.teacher || []),
      ...(data.unassigned?.student || []),
    ];
    const selectedAccounts = accounts.filter((u) => selectedAccountIds.includes(u.id));
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>👥 用户管理</Title>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>添加用户</Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>
          </Space>
        </div>
        <Input.Search placeholder="搜索姓名或登录账号" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedAccountIds([]); }} style={{ width: 300, marginBottom: 16 }} />
        <Card size="small" title="登录账号清单" style={{ marginBottom: 16 }} extra={
          <Space>
            <Button icon={<DownloadOutlined />} disabled={loading || !accounts.length} onClick={() => downloadAccounts(accounts)}>导出当前筛选结果</Button>
            <Button icon={<DownloadOutlined />} disabled={loading || !selectedAccounts.length} onClick={() => downloadAccounts(selectedAccounts)}>导出已选（{selectedAccounts.length}）</Button>
          </Space>
        }>
          <Table rowKey="id" dataSource={accounts} loading={loading} size="small" pagination={{ pageSize: 10 }} scroll={{ x: 700 }}
            rowSelection={{ selectedRowKeys: selectedAccountIds, onChange: setSelectedAccountIds }}
            columns={[
              { title: '姓名', dataIndex: 'real_name', render: (text, r) => <Link to={`/students/${r.id}`}>{text}</Link> },
              { title: '登录账号', dataIndex: 'username', render: (text) => <Text copyable>{text}</Text> },
              { title: '身份', dataIndex: 'role', render: (role) => ({ student: '学生', teacher: '教师', academic_mentor: '学术导师' }[role] || role) },
              { title: '学校', dataIndex: 'school_name' },
              { title: '班级', dataIndex: 'class_name' },
            ]} />
        </Card>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>组织结构</Typography.Text>
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
            </Card>
          )) : null}
          {data.academicMentors?.length > 0 && (
            <Card title="⭐ 学术导师" style={{ marginBottom: 12 }} size="small">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.academicMentors.map((m) => renderUserTag(m, 'purple', '⭐'))}
              </div>
            </Card>
          )}
          {data.unassigned && (data.unassigned.teacher?.length > 0 || data.unassigned.student?.length > 0) && (
            <Card title="🚫 未分配（自行注册/无学校班级）" style={{ marginBottom: 12 }} size="small">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.unassigned.teacher?.map((u) => renderUserTag(u, 'green', '👨‍🏫'))}
                {data.unassigned.student?.map((u) => renderUserTag(u, 'blue', null))}
              </div>
            </Card>
          )}
        </>

        <TempPasswordModal result={createResult} onClose={() => setCreateResult(null)} />
        <Modal title="添加用户" open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }} width={500}>
          <Form form={form} layout="vertical" onFinish={handleAddUser}>
            <Form.Item name="username" label="登录账号" rules={usernameRules} extra="留空自动生成唯一账号；账号区分大小写，创建后保持不变"><Input placeholder="如 BJFX-2026-0001" /></Form.Item>
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
            <p>系统将生成 12 位随机临时密码，创建成功后请记录；用户首次登录必须改密。</p>
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

        <Modal title="批量导入用户" open={importOpen} onCancel={() => { setImportOpen(false); setImportResult(null); }} closable={!importing} maskClosable={!importing} keyboard={!importing} destroyOnHidden footer={null} width={620}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              支持 .csv / .xlsx / .xls 文件。表头：<Text code>登录账号,姓名,身份,学校名称,班级名称,邮箱,手机号</Text>
              ，身份可选：学生 / 教师 / 学术导师。
              登录账号可留空自动生成，旧模板仍可使用；同名用户允许导入，重复账号会跳过。无账号的文件重复上传会创建新用户。
              每人自动生成随机临时密码，请在关闭结果前导出并妥善保管；关闭后无法再次查询。
            </Text>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
              <Upload
                disabled={importing || !!importResult}
                accept=".csv,.xlsx,.xls"
                showUploadList={false}
                beforeUpload={(file) => { handleImportFile(file); return false; }}
              >
                <Button type="primary" icon={<UploadOutlined />} loading={importing} disabled={!!importResult}>选择文件上传</Button>
              </Upload>
            </Space>
            {importResult && (
              <Card size="small" style={{ width: '100%' }}>
                <Button icon={<DownloadOutlined />} disabled={!importResult.accounts?.length} onClick={() => downloadAccounts(importResult.accounts, '本次导入账号.csv')}>导出本次成功导入账号</Button>
                <Button icon={<DownloadOutlined />} disabled={!importResult.accounts?.length} onClick={() => downloadTemporaryAccounts(importResult.accounts)}>导出本次临时密码</Button>
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
    { title: '姓名', dataIndex: 'real_name', render: (text, r) => <Link to={`/students/${r.id}`}>{text}</Link> },
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
        <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
      </Card>

      <TempPasswordModal result={createResult} onClose={() => setCreateResult(null)} />
      <Modal title="添加学生" open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }}>
        <Form form={form} layout="vertical" onFinish={handleAddStudent}>
          <Form.Item name="username" label="登录账号" rules={usernameRules} extra="留空自动生成唯一账号"><Input placeholder="如 BJFX-2026-0001" /></Form.Item>
          <Form.Item name="real_name" label="真实姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <p>系统将生成 12 位随机临时密码，创建成功后请记录；用户首次登录必须改密。</p>
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
