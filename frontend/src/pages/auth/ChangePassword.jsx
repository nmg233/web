import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, message } from 'antd';
import { LockOutlined, KeyOutlined } from '@ant-design/icons';
import { authAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const isForced = !!user?.force_reset_password;

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await authAPI.changePassword({ old_password: values.old_password, new_password: values.new_password });
      message.success('密码修改成功');
      // 清除 force_reset_password 标志（重新拉取用户信息）
      await refreshUser().catch(() => {});
      navigate('/dashboard', { replace: true });
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ marginBottom: 4 }}>
            <KeyOutlined /> 修改密码
          </Title>
          <Text type="secondary">{isForced ? '管理员已重置您的密码，首次登录请设置新密码' : '定期更换密码可以提升账号安全性'}</Text>
        </div>

        {isForced && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message="修改成功后，方可继续使用其他功能"
          />
        )}

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="old_password"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入原密码" />
          </Form.Item>

          <Form.Item
            name="new_password"
            label="新密码"
            extra="至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少 8 位' },
              () => ({
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  const classes = [
                    /[A-Z]/.test(value),
                    /[a-z]/.test(value),
                    /\d/.test(value),
                    /[^A-Za-z0-9]/.test(value),
                  ].filter(Boolean).length;
                  if (classes < 3) {
                    return Promise.reject(new Error('需包含大小写字母、数字、特殊字符中的至少 3 类'));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
