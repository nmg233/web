import {isCopyPreview} from '../../copy-review/previewMode.js';
import StudentCopyText from '../../content/ManagedText';
import {copyText as siteText} from "../../content/copy";
import Alert from '../../content/RoleAlert';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Button} from 'antd';
import { useAuth } from '../../store/AuthContext';
import { homeForRole } from '../../utils/roleNavigation';
import { requestError } from '../../utils/requestError';
import PasswordInput from '../../components/PasswordInput';
import { StudyHeader } from '../../student/visual/StudyUI';
import { PixelPanel } from '../../student/visual/PixelUI';
import '../../student/visual/pixel-service.css';

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const forced = !!user?.force_reset_password, student = (user?.role === 'student'||isCopyPreview());
  const Panel = student ? PixelPanel : Card;
  const onFinish = async (values) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const next = await changePassword({ old_password: values.old_password, new_password: values.new_password });
      navigate(homeForRole(next.role), { replace: true });
    } catch (err) { setError(requestError(err, { action: siteText("site.7db6a36f08beda4a"), write: true })); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className={student ? 'service-page password-page' : ''} style={!student ? { maxWidth: 520, margin: '32px auto', padding: 16 } : undefined}>
    {student ? <StudyHeader eyebrow={siteText("site.9c6b2351aaf29f3e")} title={forced ? siteText("site.87490434b0078a33") : siteText("site.7db6a36f08beda4a")} description={forced ? siteText("site.7cb0a1884ad56264") : siteText("site.b082fb9f023321c6")}  data-copy-bindings={JSON.stringify(["site.9c6b2351aaf29f3e","site.87490434b0078a33","site.7db6a36f08beda4a","site.7cb0a1884ad56264","site.b082fb9f023321c6"])}/> : <h2>{<StudentCopyText id={"site.8df185604987f98b"}/>}</h2>}
    <Panel className="password-panel">
      {forced && <Alert type="info" showIcon title={siteText("site.aab5f0fb0e0893f0")}  data-copy-bindings={JSON.stringify(["site.aab5f0fb0e0893f0"])}/>}
      {error && <Alert role="alert" type="error" showIcon title={error} />}
      <Form layout="vertical" size="large" onFinish={onFinish}>
        <Form.Item name="old_password" label={siteText("site.3da3927dbfcde53c")} rules={[{ required: true, message: siteText("site.9bf86ee91fbd01cc") }]} data-copy-bindings={JSON.stringify(["site.3da3927dbfcde53c","site.9bf86ee91fbd01cc"])}><PasswordInput autoComplete="current-password" /></Form.Item>
        <Form.Item name="new_password" label={siteText("site.cdcc70d7ccb21622")} dependencies={['old_password']}
          extra={siteText("site.d53afa6d83aaa8dc")}
          rules={[{ required: true, message: siteText("site.85937292483df5fe") }, { min: 8, message: siteText("site.815bdef0d88e214f") }, ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value) return Promise.resolve();
              if (value === getFieldValue('old_password')) return Promise.reject(new Error(siteText("site.9346ebcb46f169fd")));
              if ([/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length < 3) return Promise.reject(new Error(siteText("site.415235d5e5858e30")));
              return Promise.resolve();
            },
          })]} data-copy-bindings={JSON.stringify(["site.cdcc70d7ccb21622","site.d53afa6d83aaa8dc","site.85937292483df5fe","site.815bdef0d88e214f"])}><PasswordInput autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirm_password" label={siteText("site.ca9124491631e504")} dependencies={['new_password']} rules={[{ required: true, message: siteText("site.6c9b40e61e0de243") }, ({ getFieldValue }) => ({
          validator: (_, value) => !value || value === getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error(siteText("site.ba998d46f78ac46d"))),
        })]} data-copy-bindings={JSON.stringify(["site.ca9124491631e504","site.6c9b40e61e0de243"])}><PasswordInput autoComplete="new-password" /></Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block aria-label={siteText("site.e39c768ddee4d6fd")} data-copy-bindings={JSON.stringify(["site.e39c768ddee4d6fd"])}>{<StudentCopyText id={"site.5118582e4b5ce527"}/>}</Button>
      </Form>
      <div className="password-footer">{!forced && <Button onClick={() => navigate(homeForRole(user.role))}>{<StudentCopyText id={"site.fa9d43f28f2eb2b3"}/>}</Button>}<Button onClick={() => { logout(); navigate('/login'); }}>{<StudentCopyText id={"site.826cccbbd27b4f4a"}/>}</Button></div>
    </Panel>
  </div>;
}
