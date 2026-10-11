import {copyText as siteText} from "../content/copy";
import { PLATFORM_NAME } from '../student/space/identity';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  TeamOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  CheckSquareOutlined,
  RobotOutlined,
  MessageOutlined,
  BellOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useAuth } from '../store/AuthContext';

const { Sider } = Layout;

const menuItems = {
  admin: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: siteText("site.d9bb630c8f6f2c56") },
    { key: '/courses', icon: <BookOutlined />, label: siteText("site.68d0d9a0dd22dfc5") },
    { key: '/mentor/content', icon: <BookOutlined />, label: siteText("site.a5dcfd6bb2c993fa") },
    { key: '/students', icon: <TeamOutlined />, label: siteText("site.26ff7feaa9236e16") },
    { key: '/works', icon: <FileTextOutlined />, label: siteText("site.97b14c37be582fde") },
    { key: '/mentor/reviews', icon: <CheckSquareOutlined />, label: siteText("site.ac39a88c5cd27d64") },
    { key: '/archives', icon: <FolderOpenOutlined />, label: siteText("site.f8f376cfb06cb013") },
    { key: '/glider', icon: <ExperimentOutlined />, label: siteText("site.63a97c4c6372c0f6") },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: siteText("site.bf73f1442dae6e1f") },
    { key: '/dashboard/ai/settings', icon: <RobotOutlined />, label: siteText("site.afebea6ca3efce49") },
    { key: '/feedback/manage', icon: <MessageOutlined />, label: siteText("site.911847df600e4ab6") },
    { key: '/notifications', icon: <BellOutlined />, label: siteText("site.a2f1a21199c19e4b") },
  ],
  academic_mentor: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: siteText("site.d9bb630c8f6f2c56") },
    { key: '/courses', icon: <BookOutlined />, label: siteText("site.68d0d9a0dd22dfc5") },
    { key: '/mentor/content', icon: <BookOutlined />, label: siteText("site.a5dcfd6bb2c993fa") },
    { key: '/students', icon: <TeamOutlined />, label: siteText("site.ce21387ea0791ec0") },
    { key: '/works', icon: <FileTextOutlined />, label: siteText("site.97b14c37be582fde") },
    { key: '/mentor/reviews', icon: <CheckSquareOutlined />, label: siteText("site.ac39a88c5cd27d64") },
    { key: '/archives', icon: <FolderOpenOutlined />, label: siteText("site.f8f376cfb06cb013") },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: siteText("site.78bd9e7ce64c43a5") },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: siteText("site.bf73f1442dae6e1f") },
    { key: '/feedback', icon: <MessageOutlined />, label: siteText("site.82eec37d198a490e") },
    { key: '/notifications', icon: <BellOutlined />, label: siteText("site.a2f1a21199c19e4b") },
  ],
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
  // 移动端基础适配：小屏自动折叠为图标栏
  const [collapsed, setCollapsed] = useState(false);
  const [broken,setBroken]=useState(false);

  const items = menuItems[user?.role] || menuItems.student;

  const specialKey = user?.role === 'student'
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
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        {collapsed ? 'PBL' : PLATFORM_NAME}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => {navigate(key);if(broken)setCollapsed(true);}}
      />
    </Sider>
  );
}
