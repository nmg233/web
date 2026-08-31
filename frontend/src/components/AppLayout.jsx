import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import { useAuth } from '../store/AuthContext';
import Sidebar from './Sidebar';
import HeaderBar from './Header';

const { Content } = Layout;

export default function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user?.force_reset_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <Layout className="app-shell">
      <Sidebar />

      {/* 使用四季主题布局类，让背景、侧栏、顶部栏和内容区样式一致生效。 */}
      <Layout className="app-main">
        <HeaderBar />

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}