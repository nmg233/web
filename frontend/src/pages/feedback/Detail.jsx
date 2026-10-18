import {createFeedbackRequests} from '../../utils/feedbackRequests';
import {mentorText} from '../mentor/workspaceCopy';
import useTeachingLeaveGuard from '../courses/useTeachingLeaveGuard';
import ReceptionControls from './ReceptionControls';
import StudentCopyText from '../../content/ManagedText';
import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import Alert from '../../content/RoleAlert';
import RoleSentence from '../../content/RoleSentence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Descriptions, Form, Input, Select, Space } from 'antd';
import { feedbackAPI } from '../../api';
import FeedbackMessageForm from '../../components/feedback/FeedbackMessageForm';
import FeedbackPriorityTag from '../../components/feedback/FeedbackPriorityTag';
import FeedbackStatusTag from '../../components/feedback/FeedbackStatusTag';
import FeedbackTimeline from '../../components/feedback/FeedbackTimeline';
import { feedbackModules, feedbackPriorityOptions, feedbackStatuses, feedbackStatusTransitions, feedbackTypes } from '../../constants/feedback';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';
import { studentFeedbackModules } from '../../utils/feedbackFiles';
import { requestError } from '../../utils/requestError';
import useRemoteResource from '../../hooks/useRemoteResource';
import { ServicePage, ServicePanel, ReadState, ServiceModal, OperationNotice } from '../../components/ServiceUI';

function Attachment({ file }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const isCurrent = () => alive.current;
  const pending = useRef(false);
  const download = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const blob = await feedbackAPI.downloadAttachment(file.id);
      if (!isCurrent()) return;
      const url = URL.createObjectURL(blob);
      try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.original_name; anchor.click(); }
      finally { URL.revokeObjectURL(url); }
    } catch (err) { if (isCurrent()) setError(requestError(err, { action: siteText("site.419c0a6d6b6d261b") })); }
    finally { if (isCurrent()) { pending.current = false; setBusy(false); } }
  };
  return <li><div><strong>{file.original_name}</strong><small>{Math.ceil(file.file_size / 1024)} KiB</small>
    {error && <Alert role="alert" type="error" title={error} />}</div><Button loading={busy} onClick={download}>{error ? <StudentCopyText id={"site.d04d65ff401c8d6a"}/> : <StudentCopyText id={"site.419c0a6d6b6d261b"}/>}</Button></li>;
}
function Detail({ id }) {
  const { user } = useAuth(), navigate = useNavigate(), location = useLocation();
  const latestRevision=useRef(null),requests=useRef(createFeedbackRequests());
  const read = useCallback(async () => {const data=(await feedbackAPI.detail(id)).data;latestRevision.current=data.feedback.revision;return data;}, [id]);
  const resource = useRemoteResource(read);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(location.state?.submitted ? { type: 'success', text: siteText("site.37ccb9aac02decf7") } : null);
  const [reopen, setReopen] = useState(false), [resolve, setResolve] = useState(false);
  const [reopenForm] = Form.useForm(), [resolveForm] = Form.useForm();
  const pending = useRef(false),drafts=useRef(new Set()),processing=useRef(new Set()),replyDraft=useRef({}),noteDraft=useRef({}),receptionDraft=useRef({});
  useTeachingLeaveGuard(drafts,mentorText("feedback.Detail.34488b08ba6d"),processing);
  const dirty=(name,value)=>{if(value)drafts.current.add(name);else drafts.current.delete(name);};
  const reread = async () => { const ok = await resource.reload(); if (ok && resource.isCurrent()){requests.current.rechecked(latestRevision.current);setNotice({type:'info',text:mentorText("feedback.Detail.e14827304232")});} };
  const run = async (action, success, acknowledged) => {
    if (pending.current) return;
    pending.current = true; processing.current.add('save'); setBusy(true); setNotice(null);
    try {
      await action();
      if (!resource.isCurrent()) return;
      requests.current.acknowledged();
      acknowledged?.(); // Clear an acknowledged reply before the independent GET.
      const ok = await resource.reload();
      if (resource.isCurrent()) setNotice({ type: ok ? 'success' : 'warning', text: ok ? success : siteTemplate("site.d39de4b224f4a83a", {slot0: (success)}), retry: !ok });
    } catch (error) {
      if (resource.isCurrent()) {
        if(error.response?.status===409)requests.current.conflicted();
        setNotice({ type: 'error', text: requestError(error, { action: siteText("site.b8c0dc2ee4f6a8cc"), write: true }) });
        if ([403, 404].includes(error.response?.status)) void resource.reload();
      }
    } finally { if (resource.isCurrent()) { pending.current = false; processing.current.delete('save'); setBusy(false); } }
  };
  const feedback = resource.data?.feedback, admin = user.role === 'admin',handler=!!feedback?.can_handle,staff=!!feedback?.can_note;
  const meta=(payload={},key)=>requests.current.meta(feedback?.revision,payload,key);
  const owner = feedback?.user_id === user.id;
  const canReply = handler || (owner && !['closed', 'rejected'].includes(feedback?.status));
  const canReopen = owner && ['resolved', 'closed', 'rejected'].includes(feedback?.status);
  const modules = user.role === 'student' ? studentFeedbackModules : feedbackModules;
  return <ServicePage title={siteText("site.f4b37628974f5ee3")} eyebrow={siteText("site.397f6b370f2c1a56")} actions={<Space wrap><Button disabled={busy||resource.loading} onClick={reread}>{mentorText("feedback.Detail.e97cfc0bcd3e")}</Button><Button onClick={() => navigate(admin ? '/feedback/manage' : staff ? '/mentor/feedback' : '/feedback')}>{<StudentCopyText id={"site.e5c9f830a629bb94"}/>}</Button></Space>} data-copy-bindings={JSON.stringify(["site.f4b37628974f5ee3","site.397f6b370f2c1a56"])}>
    <OperationNotice value={notice?.type !== 'error' || !feedback ? notice : null} onRetry={reread} />
    <ReadState {...resource} object={siteText("site.0ce7c559115c1036")} data-copy-bindings={JSON.stringify(["site.0ce7c559115c1036"])}>
      {feedback && <>
        <ServicePanel><article className="service-article">
          <div className="service-metadata"><span className="feedback-number">{feedback.feedback_no}</span><FeedbackStatusTag status={feedback.status} /><span>{feedbackTypes[feedback.type] || feedback.type}</span></div>
          <h1>{feedback.title}</h1><p>{mentorText("feedback.Detail.db680a36c119")}{feedback.handler_label}；{feedback.course_id?mentorText("feedback.Detail.7026083baf39"):mentorText("feedback.Detail.41fba1f1a1ab")}</p>
          <Descriptions size="small" column={{ xs: 1, md: 2 }} items={[
            { key: 'module', label: siteText("site.552ef779d85fa13f"), children: modules[feedback.module] || siteText("site.d553d901efa76a57") },
            { key: 'time', label: siteText("site.981aab23eb841e4b"), children: formatBeijingTime(feedback.created_at) },
            ...(admin ? [{ key: 'priority', label: siteText("site.7ecdfaea2c6477e3"), children: <FeedbackPriorityTag priority={feedback.priority} /> }] : []),
          ]}  data-copy-bindings={JSON.stringify(["site.552ef779d85fa13f","site.d553d901efa76a57","site.981aab23eb841e4b","site.7ecdfaea2c6477e3"])}/>
          <h2>{<StudentCopyText id={"site.3cfe0cc52e7888c7"}/>}</h2><RoleSentence as="div" className="service-prose">{feedback.description}</RoleSentence>
          {feedback.resolution && <div className="feedback-resolution"><h2>{<StudentCopyText id={"site.6725f42f94bd3fd1"}/>}</h2><RoleSentence as="div" className="service-prose">{feedback.resolution}</RoleSentence></div>}
        </article></ServicePanel>
        {resource.data.attachments.length > 0 && <ServicePanel><h2>{<StudentCopyText id={"site.2a3b462b35b52780"}/>}</h2><ul className="feedback-attachments">{resource.data.attachments.map((file) => <Attachment key={file.id} file={file} />)}</ul></ServicePanel>}
        <ServicePanel><h2>{<StudentCopyText id={"site.5d58da2f3d52f87c"}/>}</h2><div className="feedback-timeline"><FeedbackTimeline messages={resource.data.messages} /></div></ServicePanel>
        <ServicePanel><h2>{<StudentCopyText id={"site.66e93c94e5c1d6b8"}/>}</h2><OperationNotice value={notice?.type === 'error' && !reopen && !resolve ? notice : null} />
          {canReply ? <FeedbackMessageForm draft={replyDraft} onDirty={v=>dirty('reply',v)} loading={busy} onSubmit={(content, ack,files,key) => run(() => feedbackAPI.reply(id, content,meta({content},key),files), siteText("site.5701ff0ccb652d0c"), ack)} /> : <RoleSentence>{<StudentCopyText id={"site.662df1d62ef82d28"}/>}</RoleSentence>}
          <Space wrap className="service-actions">
            {owner && feedback.status === 'resolved' && <Button type="primary" disabled={busy} onClick={() => run(() => feedbackAPI.confirm(id,meta({action:'confirm'})), siteText("site.354962097eaa2a0f"))}>{<StudentCopyText id={"site.23dbd25e535fa52b"}/>}</Button>}
            {canReopen && <Button disabled={busy} onClick={() => setReopen(true)}>{<StudentCopyText id={"site.418fdfb865249e0b"}/>}</Button>}
          </Space>
        </ServicePanel>
        {staff&&<ReceptionControls draft={receptionDraft} onDirty={v=>dirty('reception',v)} processing={processing} feedback={feedback} mentors={resource.data.mentors||[]} history={resource.data.history||[]} onSaved={reread}/>}
        {staff && <ServicePanel><h2>{<StudentCopyText id={"site.88fad7d0f3ae8d12"}/>}</h2><Space wrap>
          <span>{<StudentCopyText id={"site.bbfa131be81032a3"}/>}</span><Select aria-label={siteText("site.7ecdfaea2c6477e3")} disabled={busy||!handler} value={feedback.priority} options={feedbackPriorityOptions.map(option=>({...option}))} style={{ width: 120 }}
            onChange={(priority) => run(() => feedbackAPI.updatePriority(id, priority,meta({priority})), siteText("site.3cb81d4b32d7099e"))}  data-copy-bindings={JSON.stringify(["site.7ecdfaea2c6477e3"])}/>
          <span>{<StudentCopyText id={"site.327274b88c90f684"}/>}</span><Select aria-label={siteText("site.517bbdbc5cf0e695")} disabled={busy||!handler} placeholder={siteText("site.5f6a04f7d04af319")} style={{ width: 160 }}
            options={(feedbackStatusTransitions[feedback.status] || []).map((value) => ({ value, label: feedbackStatuses[value]?.label || value }))}
            onChange={(status) => run(() => feedbackAPI.updateStatus(id, status,meta({status})), siteText("site.07f417bbf1f12f81"))}  data-copy-bindings={JSON.stringify(["site.517bbdbc5cf0e695","site.5f6a04f7d04af319"])}/>
          {handler&&!['closed', 'rejected'].includes(feedback.status) && <Button disabled={busy} onClick={() => setResolve(true)}>{<StudentCopyText id={"site.3254c0e6529af687"}/>}</Button>}
        </Space><FeedbackMessageForm draft={noteDraft} onDirty={v=>dirty('note',v)} internal loading={busy} onSubmit={(content, ack,files,key) => run(() => feedbackAPI.addInternalNote(id, content,meta({content},key),files), siteText("site.bf2bbecfa785b638"), ack)} /></ServicePanel>}
      </>}
    </ReadState>
    <ServiceModal title={siteText("site.c9406412e7e93917")} open={reopen} onCancel={() => !busy && setReopen(false)} okText={siteText("site.09b8d47c5da82582")} cancelText={siteText("site.37699af0461e28d2")} confirmLoading={busy} onOk={() => reopenForm.submit()} data-copy-bindings={JSON.stringify(["site.c9406412e7e93917","site.09b8d47c5da82582","site.37699af0461e28d2"])}>
      <RoleSentence>{<StudentCopyText id={"site.700d9978740c633b"}/>}</RoleSentence><OperationNotice value={notice} />
      <Form form={reopenForm} layout="vertical" onFinish={({ reason }) => run(() => feedbackAPI.reopen(id, reason.trim(),meta({reason:reason.trim()})), siteText("site.01836a87796760c6"), () => { setReopen(false); reopenForm.resetFields(); })}>
        <Form.Item name="reason" label={siteText("site.864d0010b3bc7fba")} rules={[{ required: true, whitespace: true, message: siteText("site.1282382b367a9b17") }, { max: 2000, message: siteText("site.8eba157548bfa8da") }]} data-copy-bindings={JSON.stringify(["site.864d0010b3bc7fba","site.1282382b367a9b17","site.8eba157548bfa8da"])}><Input.TextArea rows={5} maxLength={2000} showCount /></Form.Item>
      </Form>
    </ServiceModal>
    {handler && <ServiceModal title={siteText("site.ad895b77fb98d2e3")} open={resolve} onCancel={() => !busy && setResolve(false)} okText={siteText("site.d19c38b3ac7851aa")} cancelText={siteText("site.37699af0461e28d2")} confirmLoading={busy} onOk={() => resolveForm.submit()} data-copy-bindings={JSON.stringify(["site.ad895b77fb98d2e3","site.d19c38b3ac7851aa","site.37699af0461e28d2"])}>
      <OperationNotice value={notice} /><Form form={resolveForm} layout="vertical" onFinish={({ resolution }) => run(() => feedbackAPI.resolve(id, resolution.trim(),meta({resolution:resolution.trim()})), siteText("site.b27404a8f08c5ff7"), () => { setResolve(false); resolveForm.resetFields(); })}>
        <Form.Item name="resolution" label={siteText("site.e4d83e963046faed")} rules={[{ required: true, whitespace: true, message: siteText("site.71ef272cf2c54e8f") }, { max: 5000 }]} data-copy-bindings={JSON.stringify(["site.e4d83e963046faed","site.71ef272cf2c54e8f"])}><Input.TextArea rows={5} maxLength={5000} showCount /></Form.Item>
      </Form>
    </ServiceModal>}
  </ServicePage>;
}
export default function FeedbackDetail() {
  const { id } = useParams(), { user } = useAuth();
  return <Detail key={`${user.id}:${id}`} id={id} />;
}
