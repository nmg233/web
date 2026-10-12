import {copyText as siteText} from "../../content/copy";
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Form, Input, Button } from 'antd';
import { useAuth } from '../../store/AuthContext';
import { homeForRole } from '../../utils/roleNavigation';
import { getSessionNotice } from '../../utils/authSession';
import { requestError } from '../../utils/requestError';
import PasswordInput from '../../components/PasswordInput';
import StudentTheme from '../../student/visual/StudentTheme';
import PixelIcon from '../../student/visual/PixelIcon';
import { PixelPanel, PixelButton } from '../../student/visual/PixelUI';
import SceneArt from '../../student/space/SceneArt';
import {PLATFORM_NAME} from '../../student/space/identity';
import '../../student/visual/pixel-service.css';
import {copyText} from '../../content/copy';
import CopyBlock from '../../content/CopyBlock';
import {displayText} from '../../content/displayText';

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const [viewport,setViewport]=useState(()=>({height:window.visualViewport?.height||innerHeight,top:window.visualViewport?.offsetTop||0}));
  useEffect(()=>{
    const update=()=>setViewport({height:window.visualViewport?.height||innerHeight,top:window.visualViewport?.offsetTop||0});
    window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  const { login, authError, retryRestore, loading } = useAuth();
  const navigate = useNavigate();
  const notice = error || authError || getSessionNotice();
  const onFinish = async (values) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const user = await login(values.username.trim(), values.password);
      navigate(user.force_reset_password ? '/change-password' : homeForRole(user.role), { replace: true });
    } catch (err) { setError(requestError(err, { action: siteText("site.bef9ac984635f9f9") })); }
    finally { pending.current = false; setBusy(false); }
  };
  return <StudentTheme><main className="voyage-login space-login patch-login" style={{'--login-height':viewport.height+'px','--login-top':viewport.top+'px'}}>
    <SceneArt key="patch-login" name="login-desktop" mobileName="login-mobile" patch priority className="patch-login-scene"/>
    <header className="login-brand"><PixelIcon name="map" size={40} /><div><strong>{PLATFORM_NAME}</strong><span>{copyText('patch.login.account')}</span></div></header>
    <div className="login-layout">
      <PixelPanel className="login-panel">
        <span className="service-eyebrow">{copyText('patch.login.welcome')}</span><h1>{copyText('patch.login.title')}</h1><CopyBlock id="patch.login.hint" as="p" className="service-muted"/>
        {notice && <Alert role="alert" type="warning" showIcon title={displayText(notice)} />}
        {authError && <Button onClick={retryRestore} loading={loading}>{copyText('patch.login.reload')}</Button>}
        <Form layout="vertical" onFinish={onFinish} size="large" requiredMark="optional">
          <Form.Item name="username" label={copyText('patch.login.username')} rules={[{ required: true, whitespace: true, message: copyText('patch.login.needUsername') }]}>
            <Input autoComplete="username" placeholder={copyText('patch.login.username')} />
          </Form.Item>
          <Form.Item name="password" label={copyText('patch.login.password')} rules={[{ required: true, message: copyText('patch.login.needPassword') }]}>
            <PasswordInput autoComplete="current-password" placeholder={copyText('patch.login.password')} />
          </Form.Item>
          <PixelButton type="primary" htmlType="submit" loading={busy} block>{copyText('patch.login.submit')}</PixelButton>
        </Form>
        <CopyBlock id="patch.login.note" as="p" className="login-account-note"/>
      </PixelPanel>
    </div><footer className="login-footer">{PLATFORM_NAME}<CopyBlock id="patch.login.footer" as="span"/></footer>
  </main></StudentTheme>;
}
