import ConfigCopyText from '../content/ConfigText';
import StudentCopyText from '../content/ManagedText';
import Alert from '../student/visual/StudentAlert';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import Link from './space/SpaceLink';
import { Input, Spin } from 'antd';
import { useCourseId } from './useCourseApis';
import { useCourseExperience } from './space/useCourseExperience';
import { requestError } from '../utils/requestError';
import { PixelButton, PixelTag } from './visual/PixelUI';
import { scopeLabels, sourceAction, sourceTypes } from './compatibilityModel';
import CourseResourceDownload from './CourseResourceDownload';
import Sentence from '../content/Sentence';

// StudentScope 核验课程后，旧链接只打开一次浮窗；不维护第二套提问逻辑。
export default function StudentAssistant() {
  const id=useCourseId();
  return <Navigate replace to={id?`/courses/${id}?openAssistant=1`:'/explore'} />;
}
export function AssistantContent({ open }) {
  const {catalog,load,draft,setDraft,messages,waiting,ask,unseen,setUnseen,nearBottomRef,scrollTopRef}=useCourseExperience();
  const reader=useRef(null),input=useRef(null);
  useEffect(()=>{
    if(!open||!reader.current)return;
    if(scrollTopRef.current!=null)reader.current.scrollTop=scrollTopRef.current;
    else if(nearBottomRef.current)reader.current.scrollTop=reader.current.scrollHeight;
  },[open,scrollTopRef,nearBottomRef]);
  useEffect(()=>{
    if(!open||!reader.current||!nearBottomRef.current)return;
    reader.current.scrollTop=reader.current.scrollHeight;
  },[messages,waiting,open,nearBottomRef]);
  const latest=()=>{reader.current.scrollTop=reader.current.scrollHeight;nearBottomRef.current=true;scrollTopRef.current=null;setUnseen(false);};
  const ready=catalog.enabled&&!catalog.loading&&!catalog.error&&catalog.course;
  return <>
    <div className="course-chat-context"><span>{catalog.course?.title||<StudentCopyText id={'system.assistant.001'}/>}</span>
      {catalog.loading?<Sentence as="div" role="status"><Spin size="small"/>{<StudentCopyText id={'system.assistant.002'}/>}</Sentence>
        :catalog.error?<Alert role="alert" type="error" title={copyText('system.assistant.003')} description={requestError(catalog.error)} action={<PixelButton onClick={load}>{<StudentCopyText id={'assistant.reload'}/>}</PixelButton>} data-copy-bindings={JSON.stringify(['system.assistant.003'])}/>
          :!catalog.enabled?<Alert type="info" title={copyText('assistant.disabled')} description={copyText('system.assistant.004')} data-copy-bindings={JSON.stringify(['assistant.disabled','system.assistant.004'])}/>
            :!catalog.course?<Alert type="warning" title={copyText('system.assistant.005')} data-copy-bindings={JSON.stringify(['system.assistant.005'])}/>:null}
    </div>
    <div className="assistant-reader" ref={reader} tabIndex={0} aria-label={copyText('system.assistant.006')} onScroll={()=>{
      const el=reader.current;nearBottomRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<72;scrollTopRef.current=el.scrollTop;if(nearBottomRef.current)setUnseen(false);
    }} data-copy-bindings={JSON.stringify(['system.assistant.006'])}>
      {!messages.length&&<div className="assistant-empty"><CopyBlock id="assistant.empty.title" as="h4"/><CopyBlock id="assistant.empty.hint" as="p"/></div>}
      {messages.map(item=><article className="assistant-turn" key={item.id}>
        <div className="assistant-question"><strong>{<StudentCopyText id={'system.assistant.007'}/>}</strong><Sentence>{item.question}</Sentence></div>
        {item.result&&<div className="assistant-answer"><div className="compat-tags"><strong>{item.result.origin==='provider'?<StudentCopyText id={'system.assistant.008'}/>:<StudentCopyText id={'system.assistant.009'}/>}</strong>{scopeLabels[item.result.scope]&&<PixelTag>{scopeLabels[item.result.scope]}</PixelTag>}</div><Sentence>{item.result.answer}</Sentence>
          {item.outdated&&<CopyBlock id="system.assistant.010" as="p" className="compat-muted"/>}
          {!!item.result.sources?.length&&<details className="assistant-sources" aria-label={copyText('system.assistant.011')}><summary>{<StudentCopyText id={'system.assistant.012'}/>}（{item.result.sources.length}）</summary><ul>{item.result.sources.map((source,i)=>{
            const action=sourceAction(source,item.courseId);
            return <li key={`${source.ref}:${i}`}><div><strong>{source.ref&&`[${source.ref}] `}{source.title||<StudentCopyText id={'system.assistant.013'}/>}</strong><Sentence>{sourceTypes[source.type]||<StudentCopyText id={'system.assistant.014'}/>}{source.locator?` · ${source.locator}`:''}</Sentence></div>
              {action?.download?<CourseResourceDownload resource={source} courseId={item.courseId}/>:action?.href?<Link to={action.href} aria-label={`${action.label}：${source.title||copyText('system.assistant.015')}`}><ConfigCopyText object={action} field="label" value={action.label}/></Link>:<span className="compat-muted">{<StudentCopyText id={'system.assistant.016'}/>}</span>}</li>;
          })}</ul></details>}
        </div>}
        {item.error&&<div className="assistant-failure"><Alert role="alert" type="warning" title={copyText('assistant.failed')} description={requestError(item.error,{action:copyText('system.assistant.017')})}/>
          <PixelButton disabled={!!draft.trim()} onClick={()=>{setDraft(item.question);input.current?.focus();}}>{<StudentCopyText id={'assistant.restore'}/>}</PixelButton>
          <Sentence>{draft.trim()?<StudentCopyText id={'system.assistant.018'}/>:<StudentCopyText id={'system.assistant.019'}/>}</Sentence>
          {item.error.response?.data?.request_id&&<details><summary>{<StudentCopyText id={'system.assistant.020'}/>}</summary><code>{item.error.response.data.request_id}</code></details>}
        </div>}
      </article>)}
      {waiting&&<div className="assistant-waiting" role="status"><Spin size="small"/> {<StudentCopyText id={'assistant.waiting'}/>}</div>}
    </div>
    {unseen&&<PixelButton className="course-chat-latest" onClick={latest}>{<StudentCopyText id={'assistant.latest'}/>}</PixelButton>}
    <form className="assistant-composer" onSubmit={event=>{event.preventDefault();void ask();}}>
      <label htmlFor="assistant-question">{<StudentCopyText id={'assistant.label'}/>}</label>
      <Input.TextArea ref={input} id="assistant-question" value={draft} placeholder={copyText('assistant.placeholder')} maxLength={1000} rows={2} onChange={e=>setDraft(e.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();void ask();}}} data-copy-bindings={JSON.stringify(['assistant.placeholder'])}/>
      <div className="assistant-composer-footer"><span>{draft.trim().length}{<StudentCopyText id={'system.assistant.021'}/>}</span><PixelButton type="primary" htmlType="submit" loading={waiting} disabled={!ready||!draft.trim()||waiting}>{<StudentCopyText id={'assistant.send'}/>}</PixelButton></div>
      <CopyBlock id="assistant.boundary" as="p" className="course-chat-boundary"/>
    </form>
  </>;
}
