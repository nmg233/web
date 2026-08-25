import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { archiveAPI } from '../../api';

const { Title, Text } = Typography;

export default function Reflection() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await archiveAPI.submitReflection(values);
      message.success('反思日志提交成功');
      form.resetFields();
      navigate('/dashboard');
    } catch { /* handled */ }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>✏️ 反思日志</Title>
      </Space>
      <Card>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          记录今天的学习收获、遇到的困难和下一步计划。每天可提交一次。
        </Text>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="difficulty" label="遇到的困难" rules={[{ required: true, message: '请填写遇到的困难' }]}>
            <Input.TextArea rows={3} placeholder="今天学习中最难理解或完成的部分" />
          </Form.Item>
          <Form.Item name="solution" label="解决方式">
            <Input.TextArea rows={3} placeholder="你是如何思考、查资料或向他人求助解决的" />
          </Form.Item>
          <Form.Item name="improvement" label="改进收获">
            <Input.TextArea rows={3} placeholder="今天有哪些收获，以及明天可以改进的地方" />
          </Form.Item>
          <Form.Item name="new_question" label="新问题">
            <Input.TextArea rows={3} placeholder="还想继续探究的问题" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>提交反思日志</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
