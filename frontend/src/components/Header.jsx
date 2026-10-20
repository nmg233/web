import {copyText as siteText} from "../content/copy";
import { Layout, Dropdown, Space, Avatar, Button, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, MessageOutlined, KeyOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import {copyText} from '../content/copy';
import NotificationBell from './notifications/NotificationBell';
import StaffPixelIcon from './StaffPixelIcon';
import { useEffect, useRef } from 'react';

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
  const campusStaff = ['admin', 'academic_mentor'].includes(user?.role);
  const headerRef = useRef(null);
  useEffect(() => {
    if (!campusStaff || !headerRef.current) return;
    const header = headerRef.current, shell = header.closest('.staff-campus-ui');
    const measure = () => shell?.style.setProperty('--staff-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); shell?.style.removeProperty('--staff-header-height'); };
  }, [campusStaff]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleInfo = roleMap[user?.role] || { label: user?.role, color: 'default' };

  return (
    <Header ref={headerRef} className="staff-header"><Button className="staff-back" icon={campusStaff ? <StaffPixelIcon name="back" /> : undefined} aria-label={copyText('next2.staff.back')} onClick={()=>window.history.state?.idx? navigate(-1):navigate(user.role==='teacher'?'/observer':'/dashboard')}>{!campusStaff && '← '}{copyText('next2.staff.back')}</Button>
      <Space size="middle" className={campusStaff ? 'staff-campus-header-actions' : undefined}>
        {campusStaff&&<Button type="text" icon={<StaffPixelIcon name="guide"/>} onClick={()=>navigate('/mentor/guide',{state:{returnTo:location.pathname+location.search}})}>使用指南</Button>}
        {!user?.force_reset_password && <NotificationBell icon={campusStaff ? <StaffPixelIcon name="bell" /> : undefined} />}
        <Button
          type="text"
          icon={campusStaff ? <StaffPixelIcon name="message" /> : <MessageOutlined />}
          onClick={() => navigate(user?.role === 'admin' ? '/feedback/manage' : '/feedback/new', { state: { from: location.pathname } })}
        >{siteText("site.6fab694c40086820")}</Button>
        <Dropdown trigger={['click']} menu={{
          items: [
            { key: 'feedback', label: siteText("site.09215898ed70a2e6"), onClick: () => navigate('/feedback') },
            { key: 'change-password', icon: campusStaff ? <StaffPixelIcon name="key" /> : <KeyOutlined />, label: siteText("site.85c6a7fd3b0ef803"), onClick: () => navigate('/change-password') },
            { key: 'logout', icon: campusStaff ? <StaffPixelIcon name="logout" /> : <LogoutOutlined />, label: siteText("site.30675e8fab1b63f1"), onClick: handleLogout }
          ]
        }}>
          <Button type="text" className="staff-account" aria-label="账户菜单"><Space>
            <Avatar size="small" className={campusStaff ? 'staff-campus-avatar' : undefined} icon={campusStaff ? <StaffPixelIcon name="user" /> : <UserOutlined />} />
            <span style={{ fontWeight: 500 }}>{user?.real_name}</span>
            <Tag color={roleInfo.color}>{roleInfo.label}</Tag>
          </Space></Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
