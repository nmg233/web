import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Modal, Form, Input, Typography, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { dashboardAPI } from '../../api';

const { Title } = Typography;

export default function SchoolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const res = await dashboardAPI.getSchool(id);
      setSchool(res.school);
      setClasses(res.classes);
    } catch { message.error('加载失败'); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [id]);

  const handleAddClass = async (values) => {
    try {
      await dashboardAPI.addClass(id, values);
      message.success('班级添加成功');
      setModalOpen(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleDeleteClass = async (classId) => {
    try {
      await dashboardAPI.deleteClass(id, classId);
      message.success('班级已删除');
      loadData();
    } catch { /* handled */ }
  };

  if (!school) return null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{school.name}</Title>
      </Space>

      <Card
        title="班级管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加班级</Button>}
      >
        <p>班级总数：{school.class_count} | 用户数：{school.user_count}</p>
        {school.region && <p>地区：{school.region}</p>}
        <Table dataSource={classes} rowKey="id" pagination={false}
          columns={[
            { title: '班级名称', dataIndex: 'name' },
            { title: '年级', dataIndex: 'grade' },
            { title: '学生数', dataIndex: 'student_count' },
            {
              title: '操作', render: (_, record) => (
                <Popconfirm title="确定删除？" onConfirm={() => handleDeleteClass(record.id)}>
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              )
            },
          ]}
        />
      </Card>

      <Modal title="添加班级" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddClass}>
          <Form.Item name="name" label="班级名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="grade" label="年级"><Input placeholder="如：三年级" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
