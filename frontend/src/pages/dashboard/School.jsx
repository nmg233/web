import {copyText as siteText} from "../../content/copy";
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
    } catch { message.error(siteText("site.f5af364b3b5834c7")); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [id]);

  const handleAddClass = async (values) => {
    try {
      await dashboardAPI.addClass(id, values);
      message.success(siteText("site.b9bab890fc891a62"));
      setModalOpen(false);
      form.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleDeleteClass = async (classId) => {
    try {
      await dashboardAPI.deleteClass(id, classId);
      message.success(siteText("site.6bbe70fe089ff380"));
      loadData();
    } catch { /* handled */ }
  };

  if (!school) return null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>{siteText("site.b73ce2dcf812a7a6")}</Button>
        <Title level={4} style={{ margin: 0 }}>{school.name}</Title>
      </Space>

      <Card
        title={siteText("site.83013cd4ebecf10a")}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>{siteText("site.22b061ce1adc5769")}</Button>}
      >
        <p>{siteText("site.bf0905ea17af8ae9")}{school.class_count}{siteText("site.99547bc35c5208d5")}{school.user_count}</p>
        {school.region && <p>{siteText("site.d482f31f2d70ab2f")}{school.region}</p>}
        <Table dataSource={classes} rowKey="id" pagination={false}
          columns={[
            { title: siteText("site.b6a7dd9d0c51ffb1"), dataIndex: 'name' },
            { title: siteText("site.8fbb38fb943dc6ac"), dataIndex: 'grade' },
            { title: siteText("site.89753b0be748da07"), dataIndex: 'student_count' },
            {
              title: siteText("site.78001350cfb800a2"), render: (_, record) => (
                <Popconfirm title={siteText("site.3a43735d4a5fdfa5")} onConfirm={() => handleDeleteClass(record.id)}>
                  <Button type="link" danger>{siteText("site.96840cf630e14480")}</Button>
                </Popconfirm>
              )
            },
          ]}
        />
      </Card>

      <Modal title={siteText("site.a01a5cc6b63e39cc")} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddClass}>
          <Form.Item name="name" label={siteText("site.b6a7dd9d0c51ffb1")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="grade" label={siteText("site.8fbb38fb943dc6ac")}><Input placeholder={siteText("site.5468756c5445b4a0")} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
