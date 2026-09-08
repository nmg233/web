import { Layout, Dropdown, Space, Avatar, Button, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, MessageOutlined, KeyOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import NotificationBell from './notifications/NotificationBell';

const { Header } = Layout;

const roleMap = {
  admin: { label: '管理员', color: 'red' },
  academic_mentor: { label: '学术导师', color: 'blue' },
  teacher: { label: '教师', color: 'green' },
  student: { label: '学生', color: 'cyan' },
  media: { label: '新媒体', color: 'orange' },
};

export default function HeaderBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleInfo = roleMap[user?.role] || { label: user?.role, color: 'default' };

  return (
    <Header style={{
      background: '#fff', padding: '0 24px', display: 'flex',
      alignItems: 'center', justifyContent: 'flex-end',
      borderBottom: '1px solid #f0f0f0', height: 56
    }}>
      <Space size="middle">
        <NotificationBell />
        <Button
          type="text"
          icon={<MessageOutlined />}
          onClick={() => navigate('/feedback/new', { state: { from: location.pathname } })}
        >
          意见反馈
        </Button>
        <Dropdown menu={{
          items: [
            { key: 'change-password', icon: <KeyOutlined />, label: '修改密码', onClick: () => navigate('/change-password') },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }
          ]
        }}>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} />
            <span style={{ fontWeight: 500 }}>{user?.real_name}</span>
            <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
}
