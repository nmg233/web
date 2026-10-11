import Alert from '../../student/visual/StudentAlert';
import {copyText} from '../../content/copy';
import CopyBlock from '../../content/CopyBlock';
import { useCourseApis } from '../../student/useCourseApis';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {useCourseNavigate as useNavigate} from '../../student/useCourseApis';

import { App, Form, Input, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/AuthContext';
import useRemote from '../../student/useRemote';
import AsyncPageState from '../../student/visual/StudentPageState';
import PageContainer from '../../components/common/PageContainer';
import { PixelButton as Button, PixelTag } from '../../student/visual/PixelUI';
import { StudyHeader, StudySection } from '../../student/visual/StudyUI';
import PixelIcon from '../../student/visual/PixelIcon';
import { formatBeijingTime } from '../../utils/date';

function SubmissionForm({ data, parentId }) {
  const { workAPI } = useCourseApis();
  const { message } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(copyText('system.workUpload.001'));
  const [draftFailed, setDraftFailed] = useState(false);
  const key = `star-voyage:work:v1:${user.id}:${data.task.id}:${parentId || 'first'}`;
  const latest = data.works[0];
  const allowed = parentId ? latest && String(latest.id) === parentId && latest.review_status === 'rejected' : !latest;
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      form.setFieldsValue(draft || (parentId && latest ? { title: latest.title, description: latest.description } : {}));
    } catch {
      // 浏览器外部存储读取失败，需要向当前表单报告。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftFailed(true); setSaved(copyText('system.workUpload.002'));
    }
  }, [key, form, parentId, latest]);
  const save = (_, values) => {
    try { localStorage.setItem(key, JSON.stringify(values)); setDraftFailed(false); setSaved(copyText('system.workUpload.003')); }
    catch { setDraftFailed(true); setSaved(copyText('system.workUpload.004')); }
  };
  const submit = async (values) => {
    if (!values.description?.trim() && !file) { setError(copyText('system.workUpload.005')); return; }
    setLoading(true); setError('');
    try {
      const payload = new FormData();
      if (file) payload.append('file', file);
      payload.append('title', values.title.trim());
      payload.append('description', values.description || '');
      payload.append('task_id', data.task.id);
      payload.append('enrollment_id', data.task.enrollment_id);
      payload.append('parent_work_id', parentId || '');
      await workAPI.upload(payload);
      try { localStorage.removeItem(key); } catch { /* 已成功提交，不重复上传 */ }
      message.success(copyText('system.workUpload.006'));
      navigate(`/courses/${data.task.course_id}/lessons/${data.task.lesson_id}/learn`);
    } catch (err) { setError(err.response?.data?.error || copyText('system.workUpload.007')); }
    finally { setLoading(false); }
  };
  return <div className="study-submit-layout"><StudySection number="W" title={parentId ? copyText('system.workUpload.008') : copyText('system.workUpload.009')} description={copyText('system.workUpload.010')}>
    {!allowed ? <Alert type="warning" title={copyText('system.workUpload.011')} description={copyText('system.workUpload.012')} /> : <Form form={form} layout="vertical" onFinish={submit} onValuesChange={save} disabled={loading} scrollToFirstError={{ block: 'center', focus: true }}>
      {latest?.reject_reason && <Alert type="warning" title={copyText('system.workUpload.013')} description={latest.reject_reason} />}
      <Alert type={draftFailed ? 'error' : 'info'} title={saved} style={{ marginBottom: 16 }} />
      <Form.Item name="title" label={copyText('system.workUpload.015')} rules={[{ required: true, whitespace: true, message: copyText('system.workUpload.016') }]}><Input /></Form.Item>
      <Form.Item name="description" label={copyText('system.workUpload.017')} extra={copyText('system.workUpload.018')}><Input.TextArea rows={6} /></Form.Item>
      <section className="study-subsection"><h4>{copyText('system.workUpload.019')}</h4>
        <Form.Item label={copyText('system.workUpload.020')} extra={copyText('system.workUpload.021')}><Upload beforeUpload={(value) => { setFile(value); return false; }} maxCount={1} onRemove={() => setFile(null)}><Button icon={<UploadOutlined />}>{copyText('system.workUpload.022')}</Button></Upload></Form.Item>
        <CopyBlock id="system.workUpload.023" as="p" className="study-help"/>
      </section>
      <div className="study-submit-result" aria-live="polite">{error && <Alert type="error" showIcon title={copyText('system.workUpload.024')} description={error} />}</div>
      <div className="study-actions"><Button type="primary" htmlType="submit" loading={loading}>{copyText('system.workUpload.025')}</Button><CopyBlock id="system.workUpload.026" as="p" /></div>
    </Form>}
  </StudySection><aside className="study-context" aria-label={copyText('system.workUpload.027')}><h3>{copyText('system.workUpload.028')}</h3><PixelTag tone={parentId ? 'warning' : 'current'}>{parentId ? copyText('system.workUpload.029') : copyText('system.workUpload.030')}</PixelTag><dl><dt>{copyText('system.workUpload.031')}</dt><dd>{data.task.course_title}</dd><dt>{copyText('system.workUpload.032')}</dt><dd>{data.task.title}</dd>{data.task.description&&<><dt>{copyText('system.workUpload.033')}</dt><dd className="study-prose">{data.task.description}</dd></>}<dt>{copyText('system.workUpload.035')}</dt><dd>{data.task.deadline ? formatBeijingTime(data.task.deadline) : copyText('system.workUpload.036')}</dd>{latest && <><dt>{copyText('system.workUpload.037')}</dt><dd>{copyText('system.workUpload.038')}{latest.version}{copyText('system.workUpload.039')}</dd></>}</dl><CopyBlock id="system.workUpload.040" as="p" /></aside></div>;
}

export default function WorkUpload() {
  const { taskAPI } = useCourseApis();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const taskId = params.get('task_id');
  const parentId = params.get('parent_work_id');
  const fetcher = useCallback(() => taskId ? taskAPI.detail(taskId) : Promise.reject(new Error(copyText('system.workUpload.041'))), [taskId,taskAPI]);
  const { data, loading, error, retry } = useRemote(fetcher);
  return <PageContainer><div className="study-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="archive" />{copyText('system.workUpload.042')}</>} title={copyText('system.workUpload.043')} description={parentId ? copyText('system.workUpload.044') : copyText('system.workUpload.045')}><Button icon={<PixelIcon name="back" />} onClick={() => navigate(data ? `/courses/${data.task.course_id}/lessons/${data.task.lesson_id}/learn` : '/tasks')}>{copyText('system.workUpload.046')}</Button></StudyHeader>
    <AsyncPageState loading={loading} error={error === 'Network Error' ? copyText('system.workUpload.047') : error} onRetry={retry}>{data && <SubmissionForm key={`${taskId}:${parentId}`} data={data} parentId={parentId} />}</AsyncPageState>
  </div></PageContainer>;
}
