/* eslint-disable react-hooks/set-state-in-effect */
import {copyText as siteText} from "../content/copy";
import {useEffect,useLayoutEffect,useCallback,useRef,useState} from 'react';
import {useLocation,Link} from 'react-router-dom';
import {Modal,Alert,Spin} from 'antd';
import client from '../api/client';
import {sessionRevision} from '../utils/authSession';
import {useRewards} from './useRewards';
import {PixelButton,PixelImage} from './visual/PixelUI';
import {trapFocus} from './visual/trapFocus';
import {copyText} from '../content/copy';
import './visual/next-rewards.css';
import {STUDENT_COURSES_CHANGED} from './accessPolicy';
import RealCoinsProvider from './RealCoinsProvider';
import {formatBeijingTime} from '../utils/date';
import {ServerRewardsContext as Context,useServerRewards} from './useServerRewards';
export function BadgeArt({art,size=96,...rest}){return <PixelImage src={`/assets/next-rewards/${art}-192.webp`} width={size} height={size} style={{width:size,height:size,background:'transparent'}} alt="" className="next-badge-art" {...rest}/>;}
export default function ServerRewards({accountId,children}){
 const {store,data:localData}=useRewards(),location=useLocation(),[state,setState]=useState({data:null,loading:true,error:''}),[award,setAward]=useState(null),[syncError,setSyncError]=useState('');
 const live=useRef(null),syncing=useRef(false),claiming=useRef(false),activeAward=useRef(null),focus=useRef(null),readSequence=useRef(0);
 const request=useCallback(async(path,body)=>{
  const check=()=>{let token;try{token=JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw Error(siteText("site.1eea9fe2e9eb0522"));}if(String(token.id)!==String(accountId)||!live.current||live.current.signal.aborted)throw Error(siteText("site.76466dce4bd9fcdb"));};
  check();const settings={silent:true,signal:live.current.signal,_authRevision:sessionRevision()};const result=await(body===undefined?client.get('/rewards'+path,settings):client.post('/rewards'+path,body,settings));check();return result;
 },[accountId]);
 const read=useCallback(async()=>{const ticket=++readSequence.current;try{setState({data:null,loading:true,error:''});const data=await request('/badges');if(ticket!==readSequence.current)return null;setState({data,loading:false,error:''});return data;}catch(e){if(ticket===readSequence.current&&live.current&&!live.current.signal.aborted)setState({data:null,loading:false,error:e.response?.data?.error||e.message});return null;}},[request]);
 const syncIntent=useCallback(async(record)=>{
  await request('/exchanges',{operationId:record.id,giftId:record.giftId});
  const signal=live.current.signal;await store.markSynced(record.id,{signal});await read();return true;
 },[request,store,read]);
 const flush=useCallback(async()=>{
  if(syncing.current)return;syncing.current=true;try{const data=await store.getSnapshot().data;if(!data)return;for(const intent of data.outbox||[])if(intent.sync==='pending')await syncIntent(intent);if(!live.current.signal.aborted)setSyncError('');}catch(e){if(!live.current?.signal.aborted)setSyncError(e.response?.data?.error||e.message);}finally{syncing.current=false;}
 },[store,syncIntent]);
 const claim=useCallback(async data=>{
  if(claiming.current||activeAward.current||!data)return;const grant=data.grants.find(g=>!g.shown_at);if(!grant)return;
  claiming.current=true;try{const result=await request('/badges/present',{grantId:grant.id});if(result.grant){focus.current=document.activeElement;activeAward.current=result.grant;setAward(result.grant);}}finally{claiming.current=false;}
 },[request]);
 useLayoutEffect(()=>{live.current=new AbortController();return()=>{live.current.abort();activeAward.current=null;};},[accountId]);
 useEffect(()=>{if(localData?.outbox?.some(e=>e.sync==='pending'))void flush();},[localData,flush]);
 useEffect(()=>{if(state.data)void claim(state.data).catch(()=>{});},[state.data,claim]);
 useEffect(()=>{let cancelled=false;const refresh=async()=>{setState({data:null,loading:true,error:''});try{await request('/badges/reconcile',{});const data=await read();if(!cancelled)await claim(data);await flush();}catch(e){if(!cancelled&&!live.current.signal.aborted)setState({data:null,loading:false,error:e.response?.data?.error||e.message});}};void refresh();window.addEventListener('online',refresh);window.addEventListener('focus',refresh);window.addEventListener(STUDENT_COURSES_CHANGED,refresh);return()=>{cancelled=true;window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);window.removeEventListener(STUDENT_COURSES_CHANGED,refresh);};},[location.pathname,request,read,flush,claim]);
 const close=()=>{activeAward.current=null;setAward(null);};
 return <Context.Provider value={{...state,request,read,syncIntent,flush,syncError}}><RealCoinsProvider>{children}</RealCoinsProvider>
  <Modal open={!!award} centered zIndex={1320} title={copyText('next3.award.title')} onCancel={close} footer={<><PixelButton onClick={close}>{copyText('next3.award.skip')}</PixelButton><Link to={award?"/me/badges?grant="+encodeURIComponent(award.id):"/me/badges"} onClick={close}>{copyText('next3.award.view')}</Link></>} rootClassName="student-pixel student-interactions next-award-modal" width={480} focusable={{trap:true,focusTriggerAfterClose:false}} modalRender={node=><div onKeyDownCapture={trapFocus}>{node}</div>} afterClose={()=>{const trigger=focus.current;const target=trigger?.isConnected&&trigger!==document.body&&!trigger.closest('.ant-modal-root')?trigger:document.querySelector('.space-header a[aria-current="page"]');target?.focus();void read().then(claim).catch(()=>{});}}>
   {award&&<div className="next-award" data-grant-id={award.id}><BadgeArt art={award.art_id} size={144}/><p>{copyText('next3.award.before')}{award.name}{copyText('next3.award.after')}</p><p>{copyText('next3.award.real')}</p></div>}
  </Modal>
 </Context.Provider>;
}
export function RealBadgeShelf(){
 const remote=useServerRewards();
 if(remote.loading)return <section className="next-badge-shelf" aria-busy="true"><Spin/>{copyText('next3.badges.loading')}</section>;
 if(remote.error)return <Alert type="warning" title={remote.error} action={<PixelButton onClick={remote.read}>{copyText('next3.retry')}</PixelButton>}/>;
 const data=remote.data;if(!data)return null;
 return <section className="next-badge-shelf"><h2>{copyText('next3.badges.title')}</h2><p>{copyText('next3.badges.real')}</p><div className="next-badge-grid">
  {data.grants.map(g=><article key={g.id} data-real-grant={g.id}><BadgeArt art={g.art_id}/><strong>{g.name}</strong><span>{copyText('next3.badges.earned')}</span><small>{g.lesson_title} · {formatBeijingTime(g.earned_at)}{siteText("site.759bd62b36268043")}</small>{g.accessible?<Link to={`/courses/${g.course_id}/lessons/${g.lesson_id}/learn`}>{copyText('next3.badges.lesson')}</Link>:<p>{copyText('next3.badges.history')}</p>}</article>)}
  {data.locked.filter(l=>!data.grants.some(g=>g.lesson_id===l.lessonId)).map(l=><article key={l.lessonId} className="next-badge-locked"><BadgeArt art={l.definition.art_id}/><strong>{l.definition.name}</strong><span>{copyText('next3.badges.locked')}</span><ul>{l.checks.filter(c=>!c.satisfied).map(c=><li key={c.key}>{c.reason}</li>)}</ul></article>)}
 </div>{!data.grants.length&&<p>{copyText('next3.badges.empty')}</p>}<h3>{copyText('next3.badges.demo')}</h3><div className="next-badge-grid">{data.exchanges.filter(e=>e.gift_type==='badge').map(e=><article key={e.id}><BadgeArt art={e.art_id}/><strong>{e.gift_name}</strong><span>{copyText('next3.badges.demoSource')}</span></article>)}</div>
 </section>;
}
export function LessonBadge({lessonId}){
 const {request}=useServerRewards(),[state,setState]=useState({data:null,error:''});
 useEffect(()=>{let active=true;setState({data:null,error:''});request('/lessons/'+lessonId).then(data=>{if(active)setState({data,error:''});}).catch(e=>{if(active)setState({data:null,error:e.response?.data?.error||e.message});});return()=>{active=false;};},[lessonId,request]);
 const d=state.data;if(state.error)return <Alert type="warning" title={state.error}/>;if(!d?.definition)return null;
 return <section className="next-lesson-badge"><BadgeArt art={d.definition.art_id} size={64}/><div><strong>{copyText('next3.badges.afterCompletion')}{d.definition.name}</strong><p>{d.definition.description}</p><ul>{d.checks.filter(c=>!c.satisfied).map(c=><li key={c.key}>{c.reason}</li>)}</ul><small>{copyText('next3.badges.extra')}</small></div></section>;
}
