import {mentorModules,mentorModuleFor} from '../pages/mentor/navigation';
import {adminModules,adminModuleFor} from '../pages/admin/navigation';
import {copyText as siteText} from "../content/copy";
import { PLATFORM_NAME } from '../student/space/identity';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  TeamOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  BellOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useAuth } from '../store/AuthContext';
import StaffPixelIcon from './StaffPixelIcon';

const { Sider } = Layout;
const adminIcons = {
  dashboard: <StaffPixelIcon name="dashboard" />,
  book: <StaffPixelIcon name="book" />,
  learning: <StaffPixelIcon name="learning" />,
  team: <StaffPixelIcon name="team" />,
  settings: <StaffPixelIcon name="settings" />,
  guide: <StaffPixelIcon name="guide" />,
};

const menuItems = {
  admin: adminModules.map(({iconKey, ...item}) => ({
    ...item,
    icon: adminIcons[iconKey],
    title: item.label,
    'aria-label': item.label,
  })),
  academic_mentor: mentorModules.map(({iconKey,...item})=>({...item,icon:adminIcons[iconKey],title:item.label,'aria-label':item.label})),
  teacher: [
    { key: '/observer', icon: <DashboardOutlined />, label: siteText("site.c61b5a1d704612ec") },
    { key: '/observer/students', icon: <TeamOutlined />, label: siteText("site.438446d175a31f66") },
    { key: '/archives', icon: <FolderOpenOutlined />, label: siteText("site.f8f376cfb06cb013") },
    { key: '/feedback', icon: <MessageOutlined />, label: siteText("site.82eec37d198a490e") },
    { key: '/notifications', icon: <BellOutlined />, label: siteText("site.a2f1a21199c19e4b") },
  ],
  student: [
    { key: '/explore', icon: <BookOutlined />, label: siteText("site.80927f02ede6e36d") },
    { key: '/lab', icon: <ExperimentOutlined />, label: siteText("site.279ee0470ef8cde7") },
    { key: '/archives', icon: <FolderOpenOutlined />, label: siteText("site.f8f376cfb06cb013") },
  ],
  media: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: siteText("site.d9bb630c8f6f2c56") },
    { key: '/courses', icon: <BookOutlined />, label: siteText("site.b66623470636da51") },
    { key: '/feedback', icon: <MessageOutlined />, label: siteText("site.82eec37d198a490e") },
    { key: '/notifications', icon: <BellOutlined />, label: siteText("site.a2f1a21199c19e4b") },
  ],
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const campusStaff = ['admin', 'academic_mentor'].includes(user?.role);
  // 桌面折叠保留图标，小屏折叠为零宽并保留唤起按钮。
  const [collapsed, setCollapsed] = useState(false);
  const [broken,setBroken]=useState(false);

  const items = menuItems[user?.role] || menuItems.student;

  const specialKey = user?.role === 'admin' ? adminModuleFor(location.pathname) : user?.role === 'academic_mentor' ? mentorModuleFor(location.pathname) : user?.role === 'student'
    ? (location.pathname.startsWith('/archives') ? '/archives' : /^\/(lab|glider)/.test(location.pathname) ? '/lab' : '/explore')
    : location.pathname.startsWith('/feedback')
    ? (user?.role === 'admin' ? '/feedback/manage' : '/feedback')
    : location.pathname.startsWith('/notifications')
      ? '/notifications'
      : null;
  const selectedKey = specialKey || items
    .filter((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))
    .sort((a, b) => b.key.length - a.key.length)[0]?.key;

  return (
    <Sider
      width={200}
      collapsible
      collapsed={collapsed}
      collapsedWidth={broken?0:64}
      breakpoint="md"
      onBreakpoint={(value) => {setBroken(value);setCollapsed(value);}}
      onCollapse={setCollapsed}
      className={'staff-sidebar'+(broken?' staff-sidebar-mobile':'')}
      zeroWidthTriggerStyle={{position:'fixed',top:10,left:8,zIndex:90}}
    >
      {campusStaff ? <div
        className={`staff-campus-brand${collapsed ? ' staff-campus-brand-collapsed' : ''}`}
        title={PLATFORM_NAME}
        aria-label={PLATFORM_NAME}
      >
        <StaffPixelIcon name="brand" className="staff-campus-brand-icon" />
        {!collapsed && <span className="staff-campus-brand-name">{PLATFORM_NAME}</span>}
      </div> : <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        {collapsed ? 'PBL' : PLATFORM_NAME}
      </div>}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={['admin','academic_mentor'].includes(user?.role) ? items.map(item => ({
          ...item,
          'aria-current': item.key === selectedKey ? 'page' : undefined,
        })) : items}
        onClick={({ key }) => {navigate(key);if(broken)setCollapsed(true);}}
      />
      {campusStaff && <div className="staff-campus-sidebar-scene" aria-hidden="true" />}
    </Sider>
  );
}
