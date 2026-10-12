import {copyText as siteText,copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Card, Button, Space, Input, Typography, Tag, Modal, Form, Select, message, Popconfirm, Radio } from 'antd';
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { studentAPI, dashboardAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { downloadAccounts } from '../../utils/accountExport';
import AccountImportModal from '../../components/AccountImportModal';
import TempPasswordModal from '../../components/TempPasswordModal';

const { Title, Text } = Typography;

const canManage = (role) => role === 'admin';
const accountStatus = (account) => account.archived_at ? 'archived' : account.is_active ? 'active' : 'disabled';
const usernameRules = [{ pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{3,159}$/, message: '请输入 4–160 位字母、数字、下划线或连字符，以字母或数字开头' }];

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
  const [createResult, setCreateResult] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active');
  const [accountPage, setAccountPage] = useState(1);
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
      message.success(siteText("site.95ef2d00209292e4"));
      loadData();
    } catch { /* handled */ }
  };

  // 管理员删除任意角色用户（学生/教师/导师）
  const handleDeleteUser = async (u) => {
    try {
      await studentAPI.deleteUser(u.id);
      message.success(siteTemplate("site.6ddbdcd2de13c412", {slot0: (u.real_name)}));
      loadData();
    } catch { /* handled */ }
  };

  // 管理员树视图中的用户标签（含删除按钮）
  const renderUserTag = (u, color, icon) => (
    <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginBottom: 4 }}>
      <Tag color={color} style={{ cursor: 'pointer', margin: 0 }} onClick={() => navigate(`/students/${u.id}`)}>
        {icon} {u.real_name}（{u.username}）
      </Tag>
      <Popconfirm title={siteTemplate("site.f02b39b760005d3a", {slot0: (u.real_name)})} description="有关联学习记录的账号无法删除，请保留其成长档案。" okText={siteText("site.bf315139efc4bd6b")} cancelText="取消" onConfirm={() => handleDeleteUser(u)}>
        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </span>
  );



  const handleSchoolChange = async (schoolId) => {
    form.setFieldsValue({ class_id: undefined });
    setClasses([]);
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
    const allAccounts = [
      ...(data.schools || []).flatMap((s) => (s.classes || []).flatMap((c) => [...(c.roles?.student || []), ...(c.roles?.teacher || [])])),
      ...(data.academicMentors || []),
      ...(data.unassigned?.teacher || []),
      ...(data.unassigned?.student || []),
    ];
    const accounts = allAccounts.filter((u) => statusFilter === 'all' || accountStatus(u) === statusFilter);
    const selectedAccounts = accounts.filter((u) => selectedAccountIds.includes(u.id));
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{siteText("site.0bb70a013282f249")}</Title>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>{siteText("site.d7ea606de22d9198")}</Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>{siteText("site.365fdbe0b91ea0b8")}</Button>
          </Space>
        </div>
        <Input.Search placeholder="搜索姓名或登录账号" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedAccountIds([]); setAccountPage(1); }} style={{ width: 300, marginBottom: 16 }} />
        <Card size="small" title="登录账号清单" style={{ marginBottom: 16 }} extra={
          <Space>
            <Button icon={<DownloadOutlined />} disabled={loading || !accounts.length} onClick={() => downloadAccounts(accounts)}>{siteText("site.b383c8e6ea42c837")}</Button>
            <Button icon={<DownloadOutlined />} disabled={loading || !selectedAccounts.length} onClick={() => downloadAccounts(selectedAccounts)}>{siteText("site.78e8e8f54a07320b")}{selectedAccounts.length}）</Button>
          </Space>
        }>
          <Space wrap style={{ marginBottom: 12 }}>
            <Radio.Group aria-label="账号状态筛选" value={statusFilter} onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedAccountIds([]);
              setAccountPage(1);
            }} optionType="button" buttonStyle="solid" options={[
              ['active', siteText("site.27bd684ecd70483e")], ['disabled', siteText("site.edf918cd0ad9a7fd")], ['archived', siteText("site.1e973eb3aa423e4e")], ['all', siteText("site.94f66c07732ad3f6")],
            ].map(([value, label]) => ({ value, label: `${label}（${allAccounts.filter(u => value === 'all' || accountStatus(u) === value).length}）` }))} />
            <Text type="secondary">{siteText("site.ff896a9fe3c75dbe")}</Text>
          </Space>
          <Table rowKey="id" dataSource={accounts} loading={loading} size="small" pagination={{ pageSize: 10, current: accountPage, onChange: setAccountPage }} scroll={{ x: 700 }}
            rowSelection={{ selectedRowKeys: selectedAccountIds, onChange: setSelectedAccountIds }}
            columns={[
              { title: siteText("site.a8cf4b3239348baf"), dataIndex: 'real_name', render: (text, r) => <Link to={`/students/${r.id}`}>{text}</Link> },
              { title: siteText("site.3e92d5d5f629c04e"), render: (_, r) => <Tag color={r.archived_at ? 'default' : r.is_active ? 'green' : 'red'}>{r.archived_at ? siteText("site.1e973eb3aa423e4e") : r.is_active ? siteText("site.27bd684ecd70483e") : siteText("site.edf918cd0ad9a7fd")}</Tag> },
              { title: siteText("site.7fe326d5f6b1a1e5"), dataIndex: 'username', render: (text) => <Text copyable>{text}</Text> },
              { title: siteText("site.f2a1e7f15c78c42f"), dataIndex: 'role', render: (role) => ({ student: siteText("site.bdba9afc2b4a2b4b"), teacher: siteText("site.ba006eaa7083e59c"), academic_mentor: siteText("site.39b0c0f95be4e85d") }[role] || role) },
              { title: siteText("site.a473450293a6c262"), dataIndex: 'school_name' },
              { title: siteText("site.f14bcc8e36d695f2"), dataIndex: 'class_name' },
            ]} />
        </Card>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{siteText("site.7313821fcdd6d8ed")}</Typography.Text>
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
            <Card title="⭐ 执行导师" style={{ marginBottom: 12 }} size="small">
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
        <Modal title={siteText("site.d7ea606de22d9198")} open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }} width={500}>
          <Form form={form} layout="vertical" onFinish={handleAddUser}>
            <Form.Item name="username" label={siteText("site.7fe326d5f6b1a1e5")} rules={usernameRules} extra="留空自动生成唯一账号；账号区分大小写，创建后保持不变"><Input placeholder="如 BJFX-2026-0001" /></Form.Item>
            <Form.Item name="real_name" label="真实姓名" rules={[{ required: true, message: siteText("site.fc4772b274556778") }]}><Input /></Form.Item>
            <Form.Item name="role" label={siteText("site.f2a1e7f15c78c42f")} rules={[{ required: true, message: siteText("site.bbe2d288e9964c1d") }]}>
              <Select options={[
                { label: siteText("site.bdba9afc2b4a2b4b"), value: 'student' }, { label: siteText("site.ba006eaa7083e59c"), value: 'teacher' },
                { label: siteText("site.39b0c0f95be4e85d"), value: 'academic_mentor' },
              ]} onChange={(v) => {
                if (v === 'academic_mentor') {
                  form.setFieldsValue({ school_id: undefined, class_id: undefined });
                  setClasses([]);
                }
              }} />
            </Form.Item>
            <p>账号留空按学校缩写_角色_姓名拼音_流水号生成；导师前缀 BUAA。初始密码为姓名拼音@123，首次登录必须改密。</p>
            <Form.Item name="school_id" label={siteText("site.a473450293a6c262")} dependencies={['role']}
              rules={[({ getFieldValue }) => ({
                required: ['student', 'teacher'].includes(getFieldValue('role')),
                message: siteText("site.3fe88797aba72636"),
              })]}>
              <Select onChange={handleSchoolChange} options={schools.map((s) => ({ label: s.name, value: s.id }))} />
            </Form.Item>
            <Form.Item name="class_id" label={siteText("site.f14bcc8e36d695f2")} dependencies={['role']}
              rules={[({ getFieldValue }) => ({
                required: ['student', 'teacher'].includes(getFieldValue('role')),
                message: siteText("site.2d8c42fce41d2d93"),
              })]}>
              <Select options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
            </Form.Item>
            <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          </Form>
        </Modal>

        <AccountImportModal open={importOpen} onClose={() => setImportOpen(false)} onChanged={loadData} />
      </div>
    );
  }

  // Non-admin: table view
  const columns = [
    { title: siteText("site.a8cf4b3239348baf"), dataIndex: 'real_name', render: (text, r) => <Link to={`/students/${r.id}`}>{text}</Link> },
    { title: siteText("site.a473450293a6c262"), dataIndex: 'school_name' },
    { title: siteText("site.f14bcc8e36d695f2"), dataIndex: 'class_name' },
    { title: siteText("site.3e92d5d5f629c04e"), render: (_, r) => <Tag color={r.archived_at ? 'default' : r.is_active ? 'green' : 'red'}>{r.archived_at ? siteText("site.1e973eb3aa423e4e") : r.is_active ? siteText("site.27bd684ecd70483e") : siteText("site.edf918cd0ad9a7fd")}</Tag> },
    ...(canManage(user?.role) ? [{
      title: siteText("site.8f6953186e262f7a"), render: (_, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>{siteText("site.bf315139efc4bd6b")}</Button>
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{siteText("site.6ef7e345fa0ab6b8")}</Title>
        {canManage(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>{siteText("site.8101bb5f63ade608")}</Button>
        )}
      </div>
      {user?.role === 'academic_mentor' && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{siteText("site.2a2f13a73dbaec91")}</Text>}
      <Card>
        <Input.Search placeholder="搜索学生" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300, marginBottom: 16 }} />
        <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
      </Card>

      <TempPasswordModal result={createResult} onClose={() => setCreateResult(null)} />
      <Modal title={siteText("site.8101bb5f63ade608")} open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }}>
        <Form form={form} layout="vertical" onFinish={handleAddStudent}>
          <Form.Item name="username" label={siteText("site.7fe326d5f6b1a1e5")} rules={usernameRules} extra="留空自动生成唯一账号"><Input placeholder="如 BJFX-2026-0001" /></Form.Item>
          <Form.Item name="real_name" label="真实姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <p>初始密码为姓名拼音@123，创建成功后请交付；用户首次登录必须改密。</p>
          <Form.Item name="school_id" label={siteText("site.a473450293a6c262")} rules={[{ required: true }]}>
            <Select onChange={handleSchoolChange} options={schools.map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="class_id" label={siteText("site.f14bcc8e36d695f2")} rules={[{ required: true }]}>
            <Select options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
