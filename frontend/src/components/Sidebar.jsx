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
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
    { key: '/mentor/content', icon: <BookOutlined />, label: '学习内容编排' },
    { key: '/students', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/mentor/reviews', icon: <CheckSquareOutlined />, label: '学习报告评审' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/glider', icon: <ExperimentOutlined />, label: '滑翔机模拟实验室' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: '灵境小智' },
    { key: '/dashboard/ai/settings', icon: <RobotOutlined />, label: 'AI 配置' },
    { key: '/feedback/manage', icon: <MessageOutlined />, label: '反馈管理' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  academic_mentor: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
    { key: '/mentor/content', icon: <BookOutlined />, label: '学习内容编排' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/mentor/reviews', icon: <CheckSquareOutlined />, label: '学习报告评审' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: '任务总览' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: '灵境小智' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  teacher: [
    { key: '/observer', icon: <DashboardOutlined />, label: '观察工作台' },
    { key: '/observer/students', icon: <TeamOutlined />, label: '我的学生' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  student: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '我的工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '我的课程' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: '灵境小智' },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: '课后任务' },
    { key: '/works', icon: <FileTextOutlined />, label: '我的作品' },
    { key: '/glider', icon: <ExperimentOutlined />, label: '实验工具' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
  ],
  media: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程浏览' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  // 移动端基础适配：小屏自动折叠为图标栏
  const [collapsed, setCollapsed] = useState(false);

  const items = menuItems[user?.role] || menuItems.student;

  const specialKey = location.pathname.startsWith('/feedback')
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
      collapsedWidth={64}
      breakpoint="lg"
      onBreakpoint={(broken) => setCollapsed(broken)}
      style={{ background: '#001529' }}
    >
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        {collapsed ? 'PBL' : 'PBL 科创平台'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  );
}
