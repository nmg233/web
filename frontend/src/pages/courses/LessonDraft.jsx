import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Modal,Space} from 'antd';
import {LessonDraftContext} from './LessonDraftContext';
import {maintenanceAPI as api} from './maintenanceApi';
import {articleBlocks} from '../../student/space/ArticleContent';
import {requestError} from '../../utils/requestError';

const names=['title','description','teaching_tip','review_content','report_guidance','experiment_guidance','moments_note','article_title','article_url','article_blocks','presentation_type','content_state','chapter_id','sort_order','cards_required','map_image_id','map_art_preset','landing_x','landing_y'];
export default function LessonDraft({lesson,courseId,refresh,dirty,onBusyChange,canSave,disabled,children}) {
  const [values,setValues]=useState(()=>({...lesson,article_blocks:articleBlocks(lesson.article_blocks)}));
  const valuesRef=useRef(values),changed=useRef(new Set()),known=useRef(lesson.content_revision),lock=useRef(false),validators=useRef(new Set());
  const [state,setState]=useState({busy:false,error:'',saved:false}),callbacks=useRef({dirty,onBusyChange});
  useEffect(()=>{callbacks.current={dirty,onBusyChange};},[dirty,onBusyChange]);
  const mark=value=>{callbacks.current.dirty(value);};
  const patch=(data)=>{const next={...valuesRef.current,...data};valuesRef.current=next;setValues(next);Object.keys(data).forEach(k=>changed.current.add(k));mark(true);setState(s=>({...s,saved:false,error:''}));};
  useEffect(()=>()=>{callbacks.current.dirty(false);callbacks.current.onBusyChange?.(false);},[]);
  useEffect(()=>{if(!changed.current.size&&!lock.current){const next={...lesson,article_blocks:articleBlocks(lesson.article_blocks)};known.current=lesson.content_revision;valuesRef.current=next;setValues(next);}},[lesson]);
  const save=async()=>{
    if(lock.current||disabled)return false;
    if(canSave&&!canSave()){setState(s=>({...s,error:'请等待正在上传或保存的操作结束，当前草稿保留'}));return false;}
    lock.current=true;onBusyChange?.(true);setState({busy:true,error:'',saved:false});let saved=false;
    try{
      for(const validate of validators.current)await validate();
      if(!valuesRef.current.title?.trim())throw Error('请填写课时名称；其他正文可继续保留草稿');
      const payload=Object.fromEntries([...changed.current].filter(k=>names.includes(k)).map(k=>[k,valuesRef.current[k]]));
      if(Object.hasOwn(payload,'cards_required'))payload.cards_required=payload.cards_required!==0&&payload.cards_required!==false;
      if(!Object.keys(payload).length){mark(false);setState({busy:false,saved:true,error:''});return true;}
      const result=await api.save(courseId,'/lessons/'+lesson.id,{...payload,expected_revision:known.current});
      known.current=result.content_revision;changed.current.clear();saved=true;mark(false);
      setState({busy:true,saved:true,error:''});await refresh();setState({busy:false,saved:true,error:''});return true;
    }catch(e){setState({busy:false,saved,error:saved?'课时已保存，回读失败；草稿与上传队列保留，请重新读取确认':e.errorFields?'请检查关卡图片与站位填写，当前草稿保留':e instanceof Error&&!e.isAxiosError?e.message:requestError(e)});return false;}
    finally{lock.current=false;onBusyChange?.(false);}
  };
  const inspect=async()=>{try{const latest=(await api.read(courseId)).lessons.find(l=>l.id===lesson.id);if(!latest)throw Error('课时已不在授权范围');Modal.confirm({title:'核对最新课时，保留本页草稿',content:<div style={{maxHeight:'60vh',overflow:'auto'}}>{[...changed.current].map(k=><div key={k}><strong>{k}</strong><p>服务器：{String(latest[k]??'未填写')}</p><p>我的草稿：{String(valuesRef.current[k]??'未填写')}</p></div>)}<p>只接收最新修订号，不替换当前输入；核对后仍需主动保存。</p></div>,onOk:()=>{known.current=latest.content_revision;setState(s=>({...s,error:'已核对最新修订，草稿保留，请检查后保存'}));}});}catch(e){setState(s=>({...s,error:requestError(e)}));}};
  const draft={values,patch,save,state,inspect,validators,courseId,lessonId:lesson.id};
  return <LessonDraftContext.Provider value={draft}>{children(draft)}{state.error&&<Alert type={state.saved?'warning':'error'} title={state.error} action={<Button onClick={inspect}>核对最新修订（保留草稿）</Button>}/>}<div className="authoring-save-bar"><Space wrap><Button aria-label="保存当前课时草稿" type="primary" disabled={disabled} loading={state.busy} onClick={()=>void save()}>保存当前课时草稿</Button><span role="status">{disabled?'正式教材只读；请先关闭并编辑，保存后重新申请发布':state.saved?'课时已真实保存；待上传文件仍须分别完成，发布须审批':'本页结构化填写与原位修改共用草稿；尚未保存到服务器'}</span></Space></div></LessonDraftContext.Provider>;
}
