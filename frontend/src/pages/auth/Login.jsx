import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/AuthContext';
import SeasonSwitcher from '../../components/SeasonSwitcher';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const user = await login(values.real_name, values.password);
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
    <div className="auth-screen">
      <div className="auth-season-rail">
        <SeasonSwitcher />
      </div>
      <Card className="auth-card auth-card--login">
        <div className="auth-intro">
          <img
            className="auth-logo"
            src="/images/beihang_logo_black.png"
            alt="北京航空航天大学"
            width="1537"
            height="386"
            decoding="async"
            fetchPriority="high"
          />
          {/* 标题、副标题各自占一行，避免全局标题底板让两段文字挤在同一行。 */}
          <Title className="auth-title" level={2}>PBL 科创育人平台</Title>
          <Text className="auth-subtitle" type="secondary">
            大中小贯通 · 项目式学习数字化平台
          </Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="real_name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input prefix={<UserOutlined />} placeholder="姓名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div className="auth-links">
          <Text type="secondary">还没有账号？</Text>
          <Link to="/register">立即注册</Link>
        </div>
      </Card>
    </div>
  );
}
