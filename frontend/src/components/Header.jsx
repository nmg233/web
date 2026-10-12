import { Layout, Dropdown, Space, Avatar, Button, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, MessageOutlined, KeyOutlined, MenuOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import NotificationBell from './notifications/NotificationBell';

const { Header } = Layout;

const roleMap = {
  admin: { label: '管理员', color: 'red' },
  academic_mentor: { label: '执行导师', color: 'blue' },
  teacher: { label: '教师', color: 'green' },
  student: { label: '学生', color: 'cyan' },
  media: { label: '新媒体', color: 'orange' },
};

export default function HeaderBar({mobile=false,onMenu}) {
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
      background: '#fff', padding: mobile ? '0 8px' : '0 24px', display: 'flex',
      alignItems: 'center', justifyContent: mobile ? 'space-between' : 'flex-end',
      borderBottom: '1px solid #f0f0f0', height: 56
    }}>
      {mobile && <Button type="text" aria-label="打开导航菜单" icon={<MenuOutlined />} onClick={onMenu} />}
      <Space size={mobile ? 4 : 'middle'}>
        <NotificationBell />
        <Button
          type="text"
          icon={<MessageOutlined />}
          onClick={() => navigate(user?.role === 'admin' ? '/feedback/manage' : '/feedback/new', { state: { from: location.pathname } })}
        >
          {mobile ? <span className="sr-only">意见反馈</span> : '意见反馈'}
        </Button>
        <Dropdown trigger={['click']} menu={{
          items: [
            { key: 'change-password', icon: <KeyOutlined />, label: '修改密码', onClick: () => navigate('/change-password') },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }
          ]
        }}>
          <Button type="text" aria-label="账户菜单" style={{height:'auto'}}><Space>
            <Avatar size="small" icon={<UserOutlined />} />
            <span style={{ fontWeight: 500, maxWidth:mobile ? 72 : 240, overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{user?.real_name}</span>
            {!mobile && <Tag color={roleInfo.color}>{roleInfo.label}</Tag>}
          </Space></Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
