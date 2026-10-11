import {copyText as siteText} from "../content/copy";
import { Layout, Dropdown, Space, Avatar, Button, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, MessageOutlined, KeyOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import {copyText} from '../content/copy';
import NotificationBell from './notifications/NotificationBell';

const { Header } = Layout;

const roleMap = {
  admin: { label: siteText("site.914c8641600fe1aa"), color: 'red' },
  academic_mentor: { label: siteText("site.16b0922bf4440284"), color: 'blue' },
  teacher: { label: siteText("site.910bf83ce11120f1"), color: 'green' },
  student: { label: siteText("site.d4be2a2085611f19"), color: 'cyan' },
  media: { label: siteText("site.d84468ae4f97c91f"), color: 'orange' },
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
    <Header className="staff-header"><Button className="staff-back" aria-label={copyText('next2.staff.back')} onClick={()=>window.history.state?.idx? navigate(-1):navigate(user.role==='teacher'?'/observer':'/dashboard')}>← {copyText('next2.staff.back')}</Button>
      <Space size="middle">
        {!user?.force_reset_password && <NotificationBell />}
        <Button
          type="text"
          icon={<MessageOutlined />}
          onClick={() => navigate(user?.role === 'admin' ? '/feedback/manage' : '/feedback/new', { state: { from: location.pathname } })}
        >{siteText("site.6fab694c40086820")}</Button>
        <Dropdown menu={{
          items: [
            { key: 'feedback', label: siteText("site.09215898ed70a2e6"), onClick: () => navigate('/feedback') },
            { key: 'change-password', icon: <KeyOutlined />, label: siteText("site.85c6a7fd3b0ef803"), onClick: () => navigate('/change-password') },
            { key: 'logout', icon: <LogoutOutlined />, label: siteText("site.30675e8fab1b63f1"), onClick: handleLogout }
          ]
        }}>
          <Button type="text" className="staff-account"><Space>
            <Avatar size="small" icon={<UserOutlined />} />
            <span style={{ fontWeight: 500 }}>{user?.real_name}</span>
            <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
          </Space></Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
