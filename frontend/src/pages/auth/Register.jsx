import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Select, Typography, message } from 'antd';
import { authAPI } from '../../api';
import SeasonSwitcher from '../../components/SeasonSwitcher';

const { Title, Text } = Typography;
const { Option } = Select;

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    authAPI.getSchools().then((res) => setSchools(res.schools)).catch(() => {});
  }, []);

  const handleSchoolChange = async (schoolId) => {
    setSelectedSchool(schoolId);
    if (schoolId) {
      const res = await authAPI.getClasses(schoolId);
      setClasses(res.classes || []);
    } else {
      setClasses([]);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await authAPI.register({ ...values, role: 'student' });
      message.success('注册成功，请登录');
      navigate('/login');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-season-rail">
        <SeasonSwitcher />
      </div>
      <Card className="auth-card">
        <div className="auth-intro">
          <Title className="auth-title" level={2}>📝 学生注册</Title>
          <Text className="auth-subtitle" type="secondary">注册后即可选课学习</Text>
        </div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="真实姓名" name="real_name" rules={[{ required: true, message: '请输入真实姓名' }]}>
            <Input placeholder="用于登录和显示" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item label="确认密码" name="password_confirm" dependencies={['password']}
            rules={[{ required: true }, ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次密码不一致'));
              },
            })]}>
            <Input.Password placeholder="再次输入密码" />
          </Form.Item>
          <Form.Item label="手机号" name="phone" rules={[{ required: true, pattern: /^\d{11}$/, message: '请输入正确的11位手机号' }]}>
            <Input placeholder="11位手机号" />
          </Form.Item>
          <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '请输入正确的邮箱' }]}>
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item label="学校" name="school_id" rules={[{ required: true, message: '请选择学校' }]}>
            <Select placeholder="选择学校" onChange={handleSchoolChange}>
              {schools.map((s) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="班级" name="class_id" rules={[{ required: true, message: '请选择班级' }]}>
            <Select placeholder="先选择学校" disabled={!selectedSchool}>
              {classes.map((c) => <Option key={c.id} value={c.id}>{c.grade ? `${c.grade} - ` : ''}{c.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>注册</Button>
          </Form.Item>
        </Form>
        <div className="auth-links">
          <Text type="secondary">已有账号？</Text>
          <Link to="/login">去登录</Link>
        </div>
      </Card>
    </div>
  );
}
