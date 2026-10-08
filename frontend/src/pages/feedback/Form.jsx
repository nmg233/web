import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Select, Space, Switch, Typography, Upload, message } from 'antd';
import { ArrowLeftOutlined, InboxOutlined } from '@ant-design/icons';
import { feedbackAPI } from '../../api';
import { feedbackModuleOptions, feedbackTypeOptions } from '../../constants/feedback';
import { useAuth } from '../../store/AuthContext';
import { requestKey } from '../../utils/requestKey';

const { Title, Paragraph } = Typography;

export default function FeedbackForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState([]);
  const request = useRef({ fingerprint: '', key: '' });

  const submit = async (values) => {
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null) data.append(key, value);
      });
      data.set('source_path', location.state?.from || '/feedback/new');
      data.set('client_info', navigator.userAgent);
      const fingerprint = JSON.stringify([values, fileList.map((f) => [f.name, f.size, f.uid, (f.originFileObj || f).lastModified])]);
      if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: requestKey() };
      data.set('request_key', request.current.key);
      fileList.forEach((file) => data.append('attachments', file.originFileObj || file));

      const response = await feedbackAPI.create(data);
      const feedback = response.data.feedback;
      message.success(`反馈已提交：${feedback.feedback_no}`);
      navigate(`/feedback/${feedback.id}`);
    } catch {
      // API 拦截器统一展示错误。
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/feedback')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>提交反馈</Title>
      </Space>

      <Card>
        <Paragraph type="secondary">
          请尽量说明操作步骤、实际结果和期望结果。管理员处理后，你可以在“我的反馈”中查看进度。
        </Paragraph>
        <Form
          layout="vertical"
          initialValues={{ allow_contact: true, contact: user?.email || user?.phone || '' }}
          onFinish={submit}
        >
          <Space align="start" wrap style={{ width: '100%' }}>
            <Form.Item name="type" label="反馈类型" rules={[{ required: true, message: '请选择反馈类型' }]}>
              <Select options={feedbackTypeOptions} placeholder="请选择" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="module" label="关联模块">
              <Select allowClear options={feedbackModuleOptions} placeholder="请选择" style={{ width: 220 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="title"
            label="反馈标题"
            rules={[
              { required: true, message: '请输入反馈标题' },
              { min: 5, max: 100, message: '标题长度为5到100字' },
            ]}
          >
            <Input showCount maxLength={100} placeholder="用一句话概括问题或建议" />
          </Form.Item>

          <Form.Item
            name="description"
            label="详细描述"
            rules={[
              { required: true, message: '请输入详细描述' },
              { min: 10, max: 5000, message: '描述长度为10到5000字' },
            ]}
          >
            <Input.TextArea
              rows={8}
              showCount
              maxLength={5000}
              placeholder={'建议包含：\n1. 进行了什么操作\n2. 实际出现什么情况\n3. 期望达到什么结果'}
            />
          </Form.Item>

          <Form.Item label="附件（最多3个，单个不超过10MB）">
            <Upload.Dragger
              multiple
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: next }) => setFileList(next.slice(-3))}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>上传截图或 PDF</p>
            </Upload.Dragger>
          </Form.Item>

          <Form.Item name="contact" label="联系方式">
            <Input maxLength={200} placeholder="选填，手机号或邮箱" />
          </Form.Item>
          <Form.Item name="allow_contact" label="允许管理员进一步联系" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={submitting}>提交反馈</Button>
        </Form>
      </Card>
    </div>
  );
}
