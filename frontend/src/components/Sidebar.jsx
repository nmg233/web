import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  TeamOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FormOutlined,
  CheckSquareOutlined,
  RobotOutlined,
  MessageOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useAuth } from '../store/AuthContext';
import SeasonSwitcher from './SeasonSwitcher';

const { Sider } = Layout;

const menuItems = {
  admin: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
    { key: '/students', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: 'AI 助手' },
    { key: '/feedback/manage', icon: <MessageOutlined />, label: '反馈管理' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  executive_mentor: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: 'AI 助手' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  academic_mentor: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: 'AI 助手' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  teacher: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程浏览' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
    { key: '/works', icon: <FileTextOutlined />, label: '作品管理' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '成长档案' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: 'AI 助手' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  student: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '我的工作台' },
    { key: '/courses', icon: <BookOutlined />, label: '课程中心' },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: '任务总览' },
    { key: '/works', icon: <FileTextOutlined />, label: '我的作品' },
    { key: '/works/upload', icon: <FormOutlined />, label: '上传作品' },
    { key: '/archives', icon: <FolderOpenOutlined />, label: '我的档案' },
    { key: '/archives/reflection', icon: <FormOutlined />, label: '反思日志' },
    { key: '/dashboard/ai', icon: <RobotOutlined />, label: 'AI 助手' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
  media: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/feedback', icon: <MessageOutlined />, label: '帮助与反馈' },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  ],
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const items = menuItems[user?.role] || menuItems.student;

  const selectedKey = location.pathname.startsWith('/feedback')
    ? (user?.role === 'admin' ? '/feedback/manage' : '/feedback')
    : location.pathname.startsWith('/notifications')
      ? '/notifications'
      : '/' + location.pathname.split('/').slice(1, 3).join('/');

  return (
    <Sider width={216} className="app-sidebar">
      <div className="app-brand">
        <span className="app-brand__mark">PBL</span>
        <span>科创平台</span>
      </div>
      {/* 主题入口固定在导航区，所有登录后的页面均可见且不占用账户操作空间。 */}
      <div className="sidebar-season-switcher">
        <SeasonSwitcher compact />
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  );
}
