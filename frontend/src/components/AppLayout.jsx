import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Layout, Spin, Result, Button, Drawer, Grid } from 'antd';
import { useAuth } from '../store/AuthContext';
import Sidebar from './Sidebar';
import HeaderBar from './Header';

const { Content } = Layout;

export default function AppLayout() {
  const { user, loading, authError, retryAuth } = useAuth();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const mobile = screens.md === false;
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (authError) return <Result status="warning" title="登录身份尚未确认" subTitle={authError} extra={<Button onClick={() => retryAuth().catch(() => {})}>重新验证</Button>} />;
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 强制修改密码：管理员重置密码后，未改密前禁止访问其他页面
  if (user?.force_reset_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!mobile && <Sidebar />}
      <Drawer title="PBL 科创平台" placement="left" size={260} open={mobile && menuOpen} onClose={() => setMenuOpen(false)}><Sidebar mobile onNavigate={() => setMenuOpen(false)} /></Drawer>
      <Layout style={{minWidth:0}}>
        <HeaderBar mobile={mobile} onMenu={() => setMenuOpen(true)} />
        <Content style={{ background: '#f5f7fa', minHeight: 360, minWidth:0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
