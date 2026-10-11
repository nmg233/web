import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Card, Button, Space, Input, Typography, Tag, Modal, Form, Select, message, Popconfirm, Upload, Radio } from 'antd';
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { studentAPI, dashboardAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { downloadAccounts, downloadTemporaryAccounts } from '../../utils/accountExport';
import TempPasswordModal from '../../components/TempPasswordModal';

const { Title, Text } = Typography;

const canManage = (role) => role === 'admin';
const accountStatus = (account) => account.archived_at ? 'archived' : account.is_active ? 'active' : 'disabled';
const usernameRules = [{ pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/, message: siteText("site.94d0ffc6a06ee53e") }];

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
      <Popconfirm title={siteTemplate("site.f02b39b760005d3a", {slot0: (u.real_name)})} description={siteText("site.c52f42a091fbd934")} okText={siteText("site.64549aea8f8b388b")} cancelText={siteText("site.a95e3c9cdc23d761")} onConfirm={() => handleDeleteUser(u)}>
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
      message.success(res.message || siteText("site.0278efc20078bdf8"));
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
        <Input.Search placeholder={siteText("site.004d131ea49a04f0")} value={search} onChange={(e) => { setSearch(e.target.value); setSelectedAccountIds([]); setAccountPage(1); }} style={{ width: 300, marginBottom: 16 }} />
        <Card size="small" title={siteText("site.c87a80072bb18659")} style={{ marginBottom: 16 }} extra={
          <Space>
            <Button icon={<DownloadOutlined />} disabled={loading || !accounts.length} onClick={() => downloadAccounts(accounts)}>{siteText("site.b383c8e6ea42c837")}</Button>
            <Button icon={<DownloadOutlined />} disabled={loading || !selectedAccounts.length} onClick={() => downloadAccounts(selectedAccounts)}>{siteText("site.78e8e8f54a07320b")}{selectedAccounts.length}）</Button>
          </Space>
        }>
          <Space wrap style={{ marginBottom: 12 }}>
            <Radio.Group aria-label={siteText("site.8e2cdac0ecd3bf8d")} value={statusFilter} onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedAccountIds([]);
              setAccountPage(1);
            }} optionType="button" buttonStyle="solid" options={[
              ['active', siteText("site.526198c6dd3a6e25")], ['disabled', siteText("site.fee10b33618e8dd9")], ['archived', siteText("site.ae0edc438850a377")], ['all', siteText("site.94f66c07732ad3f6")],
            ].map(([value, label]) => ({ value, label: `${label}（${allAccounts.filter(u => value === 'all' || accountStatus(u) === value).length}）` }))} />
            <Text type="secondary">{siteText("site.ff896a9fe3c75dbe")}</Text>
          </Space>
          <Table rowKey="id" dataSource={accounts} loading={loading} size="small" pagination={{ pageSize: 10, current: accountPage, onChange: setAccountPage }} scroll={{ x: 700 }}
            rowSelection={{ selectedRowKeys: selectedAccountIds, onChange: setSelectedAccountIds }}
            columns={[
              { title: siteText("site.a8cf4b3239348baf"), dataIndex: 'real_name', render: (text, r) => <Link to={`/students/${r.id}`}>{text}</Link> },
              { title: siteText("site.3e92d5d5f629c04e"), render: (_, r) => <Tag color={r.archived_at ? 'default' : r.is_active ? 'green' : 'red'}>{r.archived_at ? siteText("site.1e973eb3aa423e4e") : r.is_active ? siteText("site.27bd684ecd70483e") : siteText("site.edf918cd0ad9a7fd")}</Tag> },
              { title: siteText("site.7fe326d5f6b1a1e5"), dataIndex: 'username', render: (text) => <Text copyable>{text}</Text> },
              { title: siteText("site.f2a1e7f15c78c42f"), dataIndex: 'role', render: (role) => ({ student: siteText("site.f162b806a9bc3cc1"), teacher: siteText("site.a01198f7f082158a"), academic_mentor: siteText("site.265d5526ecb9d3b3") }[role] || role) },
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
            <Card title={siteText("site.84c4eb3b4c0f4cb2")} style={{ marginBottom: 12 }} size="small">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.academicMentors.map((m) => renderUserTag(m, 'purple', '⭐'))}
              </div>
            </Card>
          )}
          {data.unassigned && (data.unassigned.teacher?.length > 0 || data.unassigned.student?.length > 0) && (
            <Card title={siteText("site.eda66a81bea2f6fc")} style={{ marginBottom: 12 }} size="small">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.unassigned.teacher?.map((u) => renderUserTag(u, 'green', '👨‍🏫'))}
                {data.unassigned.student?.map((u) => renderUserTag(u, 'blue', null))}
              </div>
            </Card>
          )}
        </>

        <TempPasswordModal result={createResult} onClose={() => setCreateResult(null)} />
        <Modal title={siteText("site.b01c99418d687c61")} open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }} width={500}>
          <Form form={form} layout="vertical" onFinish={handleAddUser}>
            <Form.Item name="username" label={siteText("site.7fe326d5f6b1a1e5")} rules={usernameRules} extra={siteText("site.6b2839965644fdfd")}><Input placeholder={siteText("site.e4e1e36c5c7940f2")} /></Form.Item>
            <Form.Item name="real_name" label={siteText("site.82c12281514eb31b")} rules={[{ required: true, message: siteText("site.fc4772b274556778") }]}><Input /></Form.Item>
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
            <p>{siteText("site.129b07830a0f5ab9")}</p>
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
            <Form.Item name="email" label={siteText("site.c160a0051328632c")}><Input /></Form.Item>
            <Form.Item name="phone" label={siteText("site.e429d179db3b3dd0")}><Input /></Form.Item>
          </Form>
        </Modal>

        <Modal title={siteText("site.ac07d3be040aaf44")} open={importOpen} onCancel={() => { setImportOpen(false); setImportResult(null); }} closable={!importing} maskClosable={!importing} keyboard={!importing} destroyOnHidden footer={null} width={620}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">{siteText("site.c233119ff8a2b278")}<Text code>{siteText("site.e439b151099141fb")}</Text>{siteText("site.b3a460595f30ba87")}</Text>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>{siteText("site.abd00e377ad7f192")}</Button>
              <Upload
                disabled={importing || !!importResult}
                accept=".csv,.xlsx,.xls"
                showUploadList={false}
                beforeUpload={(file) => { handleImportFile(file); return false; }}
              >
                <Button type="primary" icon={<UploadOutlined />} loading={importing} disabled={!!importResult}>{siteText("site.022305bf1823aba3")}</Button>
              </Upload>
            </Space>
            {importResult && (
              <Card size="small" style={{ width: '100%' }}>
                <Button icon={<DownloadOutlined />} disabled={!importResult.accounts?.length} onClick={() => downloadAccounts(importResult.accounts, '本次导入账号.csv')}>{siteText("site.a22766f55eafeca6")}</Button>
                <Button icon={<DownloadOutlined />} disabled={!importResult.accounts?.length} onClick={() => downloadTemporaryAccounts(importResult.accounts)}>{siteText("site.c08c519200f05099")}</Button>
                <p style={{ marginBottom: 8 }}>{siteText("site.3a845114ef14488c")}<b style={{ color: '#52c41a' }}>{importResult.imported ?? 0}</b>
                  {'  '}{siteText("site.a0a3e4d051cd46a0")}<b style={{ color: '#ff4d4f' }}>{importResult.failed ?? 0}</b>
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
        <Input.Search placeholder={siteText("site.26ab936b8a2ce6af")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300, marginBottom: 16 }} />
        <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
      </Card>

      <TempPasswordModal result={createResult} onClose={() => setCreateResult(null)} />
      <Modal title={siteText("site.e916e08ee92b37bd")} open={addModal} onCancel={() => setAddModal(false)} onOk={() => form.submit()} confirmLoading={creating} closable={!creating} maskClosable={!creating} cancelButtonProps={{ disabled: creating }}>
        <Form form={form} layout="vertical" onFinish={handleAddStudent}>
          <Form.Item name="username" label={siteText("site.7fe326d5f6b1a1e5")} rules={usernameRules} extra={siteText("site.91b83e76a29a59c8")}><Input placeholder={siteText("site.e4e1e36c5c7940f2")} /></Form.Item>
          <Form.Item name="real_name" label={siteText("site.82c12281514eb31b")} rules={[{ required: true }]}><Input /></Form.Item>
          <p>{siteText("site.129b07830a0f5ab9")}</p>
          <Form.Item name="school_id" label={siteText("site.a473450293a6c262")} rules={[{ required: true }]}>
            <Select onChange={handleSchoolChange} options={schools.map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="class_id" label={siteText("site.f14bcc8e36d695f2")} rules={[{ required: true }]}>
            <Select options={classes.map((c) => ({ label: `${c.grade || ''} ${c.name}`, value: c.id }))} />
          </Form.Item>
          <Form.Item name="email" label={siteText("site.c160a0051328632c")}><Input /></Form.Item>
          <Form.Item name="phone" label={siteText("site.e429d179db3b3dd0")}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
