import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Input,Select,Space,Tag,Upload} from 'antd';
import {maintenanceAPI as api} from './maintenanceApi';
import {maintenanceText as c} from './maintenanceCopy';
import {requestError} from '../../utils/requestError';
import Sentence from '../../content/Sentence';
import {useAuth} from '../../store/AuthContext';
import {replayRecoveryKey,readReplayRecovery,saveReplayRecovery,clearReplayRecovery} from '../../utils/replayRecovery';
const replayStorage=()=>{try{return window.sessionStorage;}catch{return null;}};
const types=['courseware','lesson_plan','guide_card','template','video','other'];
export default function UploadQueue({courseId,lessons,policy,kind,refresh,dirty,disabled=false,boundLessonId,onUploaded,imageOnly=false,onBusyChange}){
 const {user}=useAuth(),recoveryKey=replayRecoveryKey(user?.id,courseId,boundLessonId);
 const [pending,setPending]=useState(()=>kind==='replay'?readReplayRecovery(replayStorage(),recoveryKey):[]),[recoveryMessage,setRecoveryMessage]=useState('');
 const [rows,setRows]=useState([]),[lessonId,setLesson]=useState(boundLessonId??null),[type,setType]=useState('courseware'),[busy,setBusy]=useState(false),[selectionError,setSelectionError]=useState('');
 const live=useRef(true),running=useRef(false),controller=useRef(null),rowsRef=useRef([]),dirtyRef=useRef(dirty),uploadedRef=useRef(onUploaded),busyRef=useRef(onBusyChange);
 useEffect(()=>{dirtyRef.current=dirty;uploadedRef.current=onUploaded;busyRef.current=onBusyChange;},[dirty,onUploaded,onBusyChange]);
 const change=fn=>{rowsRef.current=fn(rowsRef.current);if(live.current){dirtyRef.current(rowsRef.current.some(row=>!['success','cancelled'].includes(row.status)));setRows(rowsRef.current);}};
 const patch=(key,value)=>change(list=>list.map(row=>row.key===key?{...row,...value}:row));
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
 const accept=(kind==='resource'?policy.formats.filter(f=>!imageOnly||['.jpg','.jpeg','.png','.webp','.gif'].includes(f.ext)).map(f=>f.ext):kind==='replay'?policy.replayExtensions:policy.coverExtensions).join(',');
 const limit=kind==='resource'?policy.resourceLimitMB:kind==='replay'?policy.replayLimitMB:policy.coverLimitMB;
 const select=file=>{
  // Ant Design invokes beforeUpload for each file: add this immutable source exactly once.
  if(rowsRef.current.some(row=>row.file===file))return Upload.LIST_IGNORE;
  // Only files still needing attention consume capacity; keep terminal history/IDs.
  if(rowsRef.current.filter(row=>!['success','cancelled'].includes(row.status)).length>=20){setSelectionError(c('upload.limit'));return Upload.LIST_IGNORE;}
  const ext='.'+file.name.split('.').pop().toLowerCase(),valid=file.size>0&&accept.split(',').includes(ext)&&file.size<=limit*1024*1024&&(kind!=='replay'||boundLessonId!=null);
  const prior=kind==='replay'?pending.find(r=>r.fileName===file.name&&r.size===file.size&&r.modified===file.lastModified):null;
  const key=crypto.randomUUID();change(list=>[...list,{key,token:prior?.token||key,courseId:Number(courseId),lessonId:boundLessonId??lessonId,type,file,title:prior?.title||file.name,description:prior?.description||'',fingerprint:prior?.fingerprint,status:valid?'pending':'invalid',error:valid?'':`${c('upload.invalid')} (${accept}; ≤${limit} MB)`}]);
  setSelectionError('');return Upload.LIST_IGNORE;
 };
 const upload=async retry=>{
  if(running.current||disabled)return;running.current=true;busyRef.current?.(true);setBusy(true);
  const selected=rowsRef.current.filter(row=>retry?row.status==='failed'||row.status==='uncertain':row.status==='pending');
  for(const row of selected){
   if(!live.current)break;
   if(rowsRef.current.find(r=>r.key===row.key)?.status==='cancelled')continue;
   if(!row.title.trim()||row.title.length>120||(kind==='replay'&&!row.description.trim())){patch(row.key,{status:'failed',error:kind==='replay'?'请填写标题和视频简介':c('required')});continue;}
   const form=new FormData();form.append('file',row.file);form.append('title',row.title);form.append('description',row.description);
   if(row.lessonId!=null)form.append('lesson_id',row.lessonId);
   if(kind==='resource'){form.append('resource_type',row.type);form.append('upload_token',row.token);}
   if(kind==='replay'){
    const fingerprint=JSON.stringify([row.courseId,row.lessonId,row.title,row.description,row.file.name,row.file.size,row.file.lastModified]);
    if(row.fingerprint&&row.fingerprint!==fingerprint)row.token=crypto.randomUUID();
    row.fingerprint=fingerprint;form.append('request_key',row.token);
    const recorded=saveReplayRecovery(replayStorage(),recoveryKey,{token:row.token,fingerprint,title:row.title,description:row.description,fileName:row.file.name,size:row.file.size,modified:row.file.lastModified});
    if(!recorded)setRecoveryMessage('无法保存恢复标识。停止或离开后请核对服务器记录，不要直接重新上传。');
    setPending(readReplayRecovery(replayStorage(),recoveryKey));patch(row.key,{token:row.token,fingerprint});
   }
   const abort=new AbortController();controller.current=abort;patch(row.key,{status:'uploading',error:''});
   let result;
   try{result=await api.upload(row.courseId,kind,form,abort.signal,event=>{if(live.current)patch(row.key,{percent:event.total?Math.round(event.loaded/event.total*100):null});});if(kind==='replay'){clearReplayRecovery(replayStorage(),recoveryKey,row.token);if(live.current)setPending(readReplayRecovery(replayStorage(),recoveryKey));}if(!live.current)break;patch(row.key,{status:'success',id:result.id,error:''});uploadedRef.current?.({...result,title:row.title,description:row.description});try{await refresh();}catch{if(live.current)patch(row.key,{readError:c('uploadReadFailed')});}}
   catch(error){if(!live.current)break;patch(row.key,{status:error.response?'failed':'uncertain',error:requestError(error)});}
   finally{controller.current=null;}
  }
  running.current=false;if(live.current){busyRef.current?.(false);setBusy(false);}
 };
 const cancel=()=>{if(!window.confirm(c('upload.confirmCancel')))return;controller.current?.abort();change(list=>list.map(row=>['pending','failed','invalid','uncertain'].includes(row.status)?{...row,status:'cancelled'}:row));};
 const checkResult=async row=>{try{const result=await api.replayResult(courseId,row.token);if(!live.current)return;if(result.state==='saved'){clearReplayRecovery(replayStorage(),recoveryKey,row.token);setPending(readReplayRecovery(replayStorage(),recoveryKey));change(list=>list.map(r=>r.token===row.token?{...r,status:'success',id:result.replay.id,error:''}:r));setRecoveryMessage(`已确认视频保存成功 #${result.replay.id}`);await refresh();}else setRecoveryMessage(result.state==='removed'?'原上传记录已删除，请核对历史。':'尚未确认，服务器可能仍在处理。稍后再查，或重选相同文件并保持说明重试原请求。');}catch(e){if(live.current)setRecoveryMessage(requestError(e));}};
 return <Card className="maintenance-upload" title={c('upload.'+kind)} data-testid={'upload-'+kind}>
  <Sentence>{c(kind==='cover'?'cover.note':kind==='replay'?'upload.videoNote':'upload.resourceNote')}</Sentence><Sentence>{c('upload.bound')}</Sentence>
  {boundLessonId==null&&kind==='resource'&&<Space wrap><Select aria-label={c('field.lesson_id')} value={lessonId} onChange={setLesson} disabled={disabled} style={{width:220}} options={[{value:null,label:c('public')},...lessons.map(l=>({value:l.id,label:l.title,disabled:l.status==='cancelled'}))]}/>{kind==='resource'&&<Select aria-label={c('upload.type')} value={type} onChange={setType} disabled={disabled} options={types.map(value=>({value,label:c('type.'+value)}))}/>}</Space>}
  <div className="maintenance-queue-actions"><Upload accept={accept} multiple={kind==='resource'} beforeUpload={select} showUploadList={false} disabled={disabled||busy}><Button disabled={disabled||busy}>{c('upload.choose')}</Button></Upload><Button type="primary" loading={busy} disabled={disabled||busy||!rows.some(r=>r.status==='pending')} onClick={()=>void upload(false)}>{c('upload.start')}</Button><Button disabled={disabled||busy||!rows.some(r=>r.status==='failed'||r.status==='uncertain')} onClick={()=>void upload(true)}>{c('upload.retry')}</Button><Button onClick={cancel} disabled={!rows.some(r=>['pending','failed','invalid','uploading','uncertain'].includes(r.status))}>{c('upload.cancel')}</Button></div>
  {kind==='replay'&&pending.length>0&&<Alert type="warning" title="存在尚未确认的上传。停止/关闭不等于服务器回滚。" description={<Space orientation="vertical">{pending.map(r=><Button key={r.token} disabled={busy} onClick={()=>void checkResult(r)}>查询原请求：{r.title}</Button>)}</Space>}/>}
  {recoveryMessage&&<Alert type="info" title={recoveryMessage}/>}
  {selectionError&&<Alert type="error" title={selectionError}/>}
  <div className="maintenance-list">{rows.map(row=><Card size="small" key={row.key} data-testid="upload-item"><strong>{row.file.name}</strong><div><Tag>{c('upload.'+row.status)}</Tag><Tag>{(row.file.size/1024/1024).toFixed(2)} MB</Tag>{row.status==='uploading'&&<Tag>{row.percent==null?'上传中':row.percent+'%'}</Tag>}<Tag>{lessons.find(l=>l.id===row.lessonId)?.title||c('public')}</Tag>{kind==='resource'&&<Tag>{c('type.'+row.type)}</Tag>}</div>{row.id!=null&&<Sentence>{c('upload.id')} #{row.id}</Sentence>}{!['success','cancelled','uploading','uncertain'].includes(row.status)&&<div className="maintenance-fields"><label>{c('field.title')}<Input aria-label={c('field.title')+' '+row.file.name} value={row.title} maxLength={120} onChange={e=>patch(row.key,{title:e.target.value})}/></label><label>{c('upload.description')}<Input.TextArea aria-label={c('upload.description')+' '+row.file.name} value={row.description} maxLength={10000} onChange={e=>patch(row.key,{description:e.target.value})}/></label></div>}{row.error&&<Alert type="error" title={row.error}/>} {row.readError&&<Alert type="warning" title={row.readError} action={<Button onClick={()=>void refresh().then(()=>patch(row.key,{readError:''})).catch(()=>{})}>{c('retryRead')}</Button>}/>}</Card>)}</div>
 </Card>;
}
