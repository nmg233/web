import {isCopyPreview} from '../../copy-review/previewMode.js';
import StudentCopyText from '../../content/ManagedText';
import {requestKey} from '../../utils/requestKey';
import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import Alert from '../../content/RoleAlert';
import RoleSentence from '../../content/RoleSentence';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Form, Input, Select, Switch } from 'antd';
import { feedbackAPI } from '../../api';
import { feedbackModuleOptions, feedbackTypeOptions } from '../../constants/feedback';
import { useAuth } from '../../store/AuthContext';
import { feedbackFileError, studentFeedbackModules } from '../../utils/feedbackFiles';
import { requestError } from '../../utils/requestError';
import { ServicePage, ServicePanel } from '../../components/ServiceUI';

function CreateForm({ user }) {
  const navigate = useNavigate(), location = useLocation();
  const [busy, setBusy] = useState(false), [files, setFiles] = useState([]);
  const [error, setError] = useState(''), [fileError, setFileError] = useState('');
  const pending = useRef(false), alive = useRef(true), request=useRef({fingerprint:'',key:''});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selectFiles = (event) => {
    const next = [...files], errors = [];
    for (const file of event.target.files) {
      const problem = feedbackFileError(file, next.length);
      if (problem) errors.push(`${file.name}：${problem}`); else next.push(file);
    }
    setFiles(next); setFileError(errors.join('\n')); event.target.value = '';
  };
  const submit = async (values) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const data = new FormData();
      Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null) data.append(key, typeof value === 'string' ? value.trim() : value); });
      data.set('source_path', location.state?.from || '/feedback/new');
      data.set('client_info', navigator.userAgent);
      const fingerprint=JSON.stringify([values,files.map(f=>[f.name,f.size,f.lastModified])]);
      if(request.current.fingerprint!==fingerprint)request.current={fingerprint,key:requestKey()};
      data.set('request_key',request.current.key);
      files.forEach((file) => data.append('attachments', file));
      const response = await feedbackAPI.create(data);
      if (alive.current) navigate(`/feedback/${response.data.feedback.id}`, { state: { submitted: true } });
    } catch (err) { if (alive.current) setError(requestError(err, { action: siteText("site.677210fb94b7f4bd"), write: true })); }
    finally { if (alive.current) { pending.current = false; setBusy(false); } }
  };
  const moduleOptions = (user.role === 'student'||isCopyPreview()) ? Object.entries(studentFeedbackModules).map(([value, label]) => ({ value, label })) : feedbackModuleOptions;
  return <ServicePage title={siteText("site.677210fb94b7f4bd")} eyebrow={siteText("site.f852fcc1636d6b23")} description={siteText("site.746e14975561c9cd")} actions={<Button onClick={() => navigate('/feedback')}>{<StudentCopyText id={"site.480493da8adfbe64"}/>}</Button>} data-copy-bindings={JSON.stringify(["site.677210fb94b7f4bd","site.f852fcc1636d6b23","site.746e14975561c9cd"])}>
    <ServicePanel className="feedback-form-panel">
      <RoleSentence className="service-note">{<StudentCopyText id={"site.b7cbbf9899572ee6"}/>}</RoleSentence>
      <Form layout="vertical" initialValues={{ allow_contact: true, contact: user.email || user.phone || '' }} onFinish={submit}>
        <div className="service-form-pair">
          <Form.Item name="type" label={siteText("site.8db704912e8e00b0")} rules={[{ required: true, message: siteText("site.1d88594808686b0d") }]} data-copy-bindings={JSON.stringify(["site.8db704912e8e00b0","site.1d88594808686b0d"])}><Select aria-label={siteText("site.8db704912e8e00b0")} options={feedbackTypeOptions.map(option=>({...option}))} placeholder={siteText("site.1d88594808686b0d")}  data-copy-bindings={JSON.stringify(["site.8db704912e8e00b0","site.1d88594808686b0d"])}/></Form.Item>
          <Form.Item name="module" label={siteText("site.1498807bd478d570")} data-copy-bindings={JSON.stringify(["site.1498807bd478d570"])}><Select aria-label={siteText("site.9188f27c9d09085f")} allowClear options={moduleOptions} placeholder={siteText("site.cbab05a9bfed0004")}  data-copy-bindings={JSON.stringify(["site.9188f27c9d09085f","site.cbab05a9bfed0004"])}/></Form.Item>
        </div>
        <Form.Item name="title" label={siteText("site.880688316a275399")} extra={siteText("site.26b66cdf08dc8c76")} rules={[{ required: true, whitespace: true, message: siteText("site.16b051955814d4a7") }, { transform: (value) => value?.trim(), min: 5, max: 100, message: siteText("site.0cb73015656498cf") }]} data-copy-bindings={JSON.stringify(["site.880688316a275399","site.26b66cdf08dc8c76","site.16b051955814d4a7","site.0cb73015656498cf"])}><Input maxLength={100} showCount placeholder={siteText("site.16e86ac6d6ff83b6")}  data-copy-bindings={JSON.stringify(["site.16e86ac6d6ff83b6"])}/></Form.Item>
        <Form.Item name="description" label={siteText("site.212f218e102cf88d")} extra={siteText("site.643d9d346b25df61")} rules={[{ required: true, whitespace: true, message: siteText("site.ca7234198120ba71") }, { transform: (value) => value?.trim(), min: 10, max: 5000, message: siteText("site.4a0f1ab070af1a09") }]} data-copy-bindings={JSON.stringify(["site.212f218e102cf88d","site.643d9d346b25df61","site.ca7234198120ba71","site.4a0f1ab070af1a09"])}>
          <Input.TextArea rows={6} maxLength={5000} showCount placeholder={siteText("site.e1689b101da78577")}  data-copy-bindings={JSON.stringify(["site.e1689b101da78577"])}/>
        </Form.Item>
        <div className="feedback-file-picker">
          <label htmlFor="feedback-files">{<StudentCopyText id={"site.e63403fea4e9cc13"}/>}</label><RoleSentence id="feedback-files-help">{<StudentCopyText id={"site.1c4c7e5713995156"}/>}</RoleSentence>
          <input id="feedback-files" aria-describedby="feedback-files-help" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={selectFiles} disabled={busy} />
          {fileError && <Alert type="error" role="alert" title={fileError} />}
          {files.length > 0 && <ul>{files.map((file, index) => <li key={`${file.name}:${index}`}><span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)}{<StudentCopyText id={"site.87323ff68bad1f5b"}/>}</small></span><Button disabled={busy} aria-label={siteTemplate("site.9fbdf09ef5c171f0", {slot0: (file.name)})} onClick={() => setFiles((value) => value.filter((_, i) => i !== index))}>{<StudentCopyText id={"site.edaf334db6f568df"}/>}</Button></li>)}</ul>}
        </div>
        <Form.Item name="contact" label={siteText("site.b6a8246609a81715")} rules={[{ max: 200, message: siteText("site.00821f6d1839fabb") }]} data-copy-bindings={JSON.stringify(["site.b6a8246609a81715","site.00821f6d1839fabb"])}><Input autoComplete="off" maxLength={200} placeholder={siteText("site.4cfce5b3f8f85408")}  data-copy-bindings={JSON.stringify(["site.4cfce5b3f8f85408"])}/></Form.Item>
        <Form.Item name="allow_contact" label={siteText("site.02a445217c1cca73")} valuePropName="checked" data-copy-bindings={JSON.stringify(["site.02a445217c1cca73"])}><Switch /></Form.Item>
        {error && <Alert role="alert" type="error" showIcon title={error} />}
        <div className="service-submit"><Button type="primary" htmlType="submit" loading={busy} aria-label={siteText("site.677210fb94b7f4bd")} data-copy-bindings={JSON.stringify(["site.677210fb94b7f4bd"])}>{<StudentCopyText id={"site.7674c9fa5f174194"}/>}</Button><span>{<StudentCopyText id={"site.2ddcd6e4515a1c5f"}/>}</span></div>
      </Form>
    </ServicePanel>
  </ServicePage>;
}
export default function FeedbackForm() {
  const { user } = useAuth();
  return <CreateForm key={user.id} user={user} />;
}
