import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Input,Modal,Space,Tag} from 'antd';
import client from '../../api/client';
import PublicationSnapshot from './PublicationSnapshot';
import {useAuth} from '../../store/AuthContext';
import {requestError} from '../../utils/requestError';
const labels={draft:'草稿，学生不可见',legacy:'原有正式课时',published:'正式开放',closed:'临时关闭，学生暂停',pending:'待审批',approved:'已批准',rejected:'已驳回'};
export default function PublicationPanel({course,lesson,refresh,canWrite=()=>true}){
 const {user}=useAuth(),[rows,setRows]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[action,setAction]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false),ticket=useRef(0);
 const [events,setEvents]=useState([]),[introHistory,setIntroHistory]=useState([]),[draftInfo,setDraftInfo]=useState(null),[recoveries,setRecoveries]=useState([]),epoch=useRef(0);
 const base=`/courses/${course.id}/publication`;
 // This ref is a request generation, not a DOM node; cleanup invalidates late mutations.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{epoch.current++;return()=>{epoch.current++;};},[base,lesson?.id]);
 const read=useCallback(async()=>{const n=++ticket.current;try{const r=await client.get(base,{silent:true});if(n===ticket.current){setRows(r.requests);setEvents(r.events||[]);setIntroHistory(r.introHistory||[]);setDraftInfo(r.lessons?.find(l=>l.lesson_id===lesson?.id)||null);setRecoveries(r.recoveries||[]);setError('');}}catch(e){if(n===ticket.current){setError(requestError(e));setRows([]);setEvents([]);setIntroHistory([]);setDraftInfo(null);setRecoveries([]);}}},[base,lesson?.id]);
 // The ref invalidates network requests, not a DOM node.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{void Promise.resolve().then(read);return()=>{ticket.current++;};},[read,lesson,course.status]);
 const open=value=>{if(lock.current)return;if(!canWrite()){setError('请先保存或取消当前表单和上传队列，再执行发布操作');return;}setReason('');setAction(value);};
 const save=async()=>{if(lock.current||!reason.trim())return;lock.current=true;const generation=epoch.current;setBusy(true);setError('');setNotice('');try{
  const path=action.kind==='decision'?`${base}/${action.id}/decision`:base;
  await client.post(path,{reason:reason.trim(),...(action.kind==='decision'?{decision:action.decision}:action.kind==='submit'?{lesson_id:lesson?.id||null}:{})},{silent:true});
  if(generation!==epoch.current)return;
  setAction(null);setNotice('操作已保存。原正式版持续开放；修改只有经管理员批准后才对新开始的学生生效，已有学生继续原学习版本。');await refresh();if(generation===epoch.current)await read();
 }catch(e){if(generation===epoch.current)setError(requestError(e));}finally{lock.current=false;if(generation===epoch.current)setBusy(false);}};
 const current=rows.filter(r=>r.lesson_id===(lesson?.id||null)),pending=current.find(r=>r.status==='pending'),formal=lesson&&['legacy','published'].includes(lesson.publication_state);
 return <Card size="small" title={lesson?'本课时发布审批':'总课题发布审批'} data-testid="publication-panel">
  <Space wrap><Tag>{lesson?labels[lesson.publication_state]:({draft:'总课题草稿',published:'介绍已发布',archived:'已归档'})[course.status]}</Tag>{pending&&<Tag color="orange">待管理员审批 #{pending.id}</Tag>}
  {course.status!=='archived'&&lesson?.status!=='cancelled'&&(lesson||course.status==='draft')&&!pending&&<Button type="primary" disabled={busy||(formal&&!draftInfo?.draft_changed)} onClick={()=>open({kind:'submit'})}>提交管理员审批</Button>}
  <Button disabled={busy} onClick={()=>void read()}>刷新审批状态</Button></Space>
  <p>{lesson?'可直接编辑、上传，无需关闭课时。修改先保存为草稿，审批期间学生继续学习和提交原正式版；批准后，新开始学生使用新版，已开始学生保留原作答与教材版本。':'允许先发布总课题介绍、暂无正式课时；已发布介绍修改直接保存，无需再次审批。课时发布须分别审批。'}</p>
  {formal&&<Alert type="info" title={draftInfo?draftInfo.draft_changed?'有未发布的草稿修改，学生仍使用原正式版':'草稿与当前正式版一致，学生可正常学习':'正在核对草稿与正式版差异'}/>}
  {lesson?.publication_state==='closed'&&<Alert type="warning" title="课时暂时关闭，学生记录保留" description={lesson.closure_reason}/>}
  {error&&<Alert type="error" title={error}/>} {notice&&<Alert type="success" title={notice}/>}
  <details open={Boolean(pending)}><summary>提交版本与审批历史</summary>{(lesson?current:rows).map(r=><article key={r.id} style={{marginBlock:12}}><strong>#{r.id} {r.lesson_title||'总课题介绍'} · {labels[r.status]}</strong><p>{r.applicant_name} · {r.created_at} · {r.reason}</p>{r.status==='pending'&&r.lesson_id&&!Array.isArray(r.snapshot?.tasks)&&<Alert type="warning" title="升级前的旧申请未包含独立任务快照，请驳回后重新提交完整教材；草稿与原正式版均保留"/>}{r.decision_reason&&<p>审批意见：{r.decision_reason}</p>}<details><summary>查看本次不可变提交内容（不是当前草稿）</summary><PublicationSnapshot snapshot={r.snapshot} lesson={Boolean(r.lesson_id)}/></details>{user.role==='admin'&&r.status==='pending'&&course.status!=='archived'&&<Space><Button disabled={busy} onClick={()=>open({kind:'decision',id:r.id,decision:'approved'})}>批准并正式发布</Button><Button danger disabled={busy} onClick={()=>open({kind:'decision',id:r.id,decision:'rejected'})}>驳回申请</Button></Space>}</article>)}</details>
  <details><summary>历史关闭与版本发布记录（最近 100 条）</summary>{events.filter(e=>!lesson||e.lesson_id===lesson.id).map(e=><p key={e.id}>{e.created_at} · {e.lesson_title} · {e.action==='close'?'历史关闭操作（已停用）':'批准正式版'} · {e.actor_name} · {e.reason} · 教材版本 #{e.content_version_id}</p>)}{recoveries.filter(e=>!lesson||e.lesson_id===lesson.id).map(e=><p key={'recovery-'+e.lesson_id}>{e.restored_at} · 课时 #{e.lesson_id} 已恢复原正式版 #{e.content_version_id}；未审批草稿保留，原关闭原因：{e.previous_reason}</p>)}</details>
  {!lesson&&<details><summary>总课题介绍修改审计（最近 100 条）</summary>{introHistory.map(e=><details key={e.id}><summary>{e.created_at} · {e.actor_name}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({修改前:JSON.parse(e.before_json),修改后:JSON.parse(e.after_json)},null,2)}</pre></details>)}</details>}
  <Modal title={action?.kind==='decision'?action.decision==='approved'?'批准提交版本并发布':'驳回申请':'提交发布申请'} open={Boolean(action)} onCancel={()=>!busy&&setAction(null)} onOk={()=>void save()} confirmLoading={busy} closable={!busy} maskClosable={!busy} okButtonProps={{disabled:!reason.trim()}} cancelButtonProps={{disabled:busy}}><p>请输入原因或审批意见。请先保存全部修改；提交后再改内容会使该申请无法批准。审批期间原正式版保持开放。</p><Input.TextArea aria-label="发布审批操作说明" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} disabled={busy}/></Modal>
 </Card>;
}
