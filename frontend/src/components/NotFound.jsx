import StudentCopyText from '../content/ManagedText';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { homeForRole } from '../utils/roleNavigation';
import { StudentPageStatus } from './PageStatus';
import { PixelButton } from '../student/visual/PixelUI';

export default function NotFound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goHome = () => navigate(homeForRole(user?.role), { replace: true });
  if (user?.role === 'student') return <StudentPageStatus code="404" title={<StudentCopyText id="site.f68cf3bb67a54012"/>}
    description={<StudentCopyText id="site.5228c122a4975647"/>}>
    <PixelButton type="primary" onClick={goHome}>{<StudentCopyText id="site.b96998315eba668a"/>}</PixelButton>
  </StudentPageStatus>;
  return <Result status="404" title={<StudentCopyText id="site.f68cf3bb67a54012"/>} subTitle={<StudentCopyText id="site.99bba994e46ee706"/>}
    extra={<Button type="primary" onClick={goHome}>{<StudentCopyText id="site.e73d0a99e5aba0c8"/>}</Button>} />;
}
