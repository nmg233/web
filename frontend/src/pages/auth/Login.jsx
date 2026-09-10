import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const user = await login(values.username, values.password);
      message.success('登录成功');
      // 若管理员重置过密码，强制先修改密码
      navigate(user?.force_reset_password ? '/change-password' : '/dashboard');
    } catch {
      // 错误已在拦截器中处理
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        inset: -20,
        background: "url('/images/beihang_building.jpg') center/cover no-repeat",
        filter: 'blur(8px) brightness(0.35) saturate(1.2)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(13,21,38,0.4) 0%, rgba(26,42,74,0.3) 50%, rgba(26,69,128,0.3) 100%)',
        zIndex: 0
      }} />
      <Card
        style={{
          position: 'relative',
          zIndex: 1,
          width: 480,
          maxWidth: '95vw',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
        styles={{ body: { padding: 40 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/images/beihang_logo_black.png"
            alt="北京航空航天大学"
            style={{ height: 52, width: 'auto', opacity: 0.9, marginBottom: 12 }}
          />
          <Title level={2} style={{ marginBottom: 4 }}>PBL 科创育人平台</Title>
          <Text type="secondary">大中小贯通 · 项目式学习数字化平台</Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, whitespace: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">还没有账号？请联系管理员创建。</Text>
        </div>
      </Card>
    </div>
  );
}
