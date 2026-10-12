import {copyText as siteText} from "../content/copy";
import { Button, Result } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { StudentPageStatus } from './PageStatus';
import { PixelButton } from '../student/visual/PixelUI';
import { useAuth } from '../store/AuthContext';
import { homeForRole } from '../utils/roleNavigation';

export function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeForRole(user?.role)} replace />;
}

export default function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user || roles.includes(user.role)) return children;
  if (user.role === 'student') return <StudentPageStatus code="403" title={siteText("site.77cd167e526fc267")}
    description={siteText("site.3a33bf4545c682dc")}>
    <PixelButton type="primary" onClick={() => navigate(homeForRole(user.role), { replace: true })}>{siteText("site.3a199280ae5973e3")}</PixelButton>
  </StudentPageStatus>;
  return <Result
    status="403"
    title={siteText("site.77cd167e526fc267")}
    subTitle={siteText("site.44c11feaef6c0329")}
    extra={<Button type="primary" onClick={() => navigate(homeForRole(user.role), { replace: true })}>{siteText("site.2d63502541824b3b")}</Button>}
  />;
}
