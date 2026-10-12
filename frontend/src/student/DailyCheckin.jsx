/* eslint-disable react-hooks/set-state-in-effect */
import {copyText as siteText} from "../content/copy";
import {useEffect,useRef,useState,useCallback} from 'react';
import {Alert} from 'antd';
import {useRewards} from './useRewards';
import {useServerRewards} from './useServerRewards';
import {PixelButton,PixelPanel} from './visual/PixelUI';
import {copyText} from '../content/copy';
export default function DailyCheckin(){
 const {data,status,store}=useRewards(),{request}=useServerRewards(),[day,setDay]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false),live=useRef(null),sequence=useRef(0);
 const invalidate=useCallback(()=>{live.current.abort();sequence.current++;},[]);
 const read=useCallback(async()=>{const ticket=++sequence.current;setDay(null);const start=performance.now();try{const d=await request('/day');const value={date:d.date,expires:start+d.validForMs};if(value.expires<=performance.now())throw Error(copyText('next3.checkin.stale'));if(ticket===sequence.current&&!live.current.signal.aborted){setDay(value);setError('');}return value;}catch(e){if(ticket===sequence.current&&!live.current.signal.aborted)setError(e.response?.data?.error||e.message);throw e;}},[request]);
 useEffect(()=>{live.current=new AbortController();const refresh=()=>{if(document.visibilityState==='visible')void read().catch(()=>{});};void read().catch(()=>{});document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);return()=>{invalidate();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};},[read,invalidate]);
 useEffect(()=>{if(!day)return;const timer=setTimeout(()=>void read().catch(()=>{}),Math.max(1,day.expires-performance.now()));return()=>clearTimeout(timer);},[day,read]);
 const execute=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{const current=await read();const result=await store.checkin({day:current,signal:live.current.signal});if(!live.current.signal.aborted)setNotice(copyText(result.changed?'next3.checkin.success':'next3.checkin.already'));}catch(e){if(!live.current.signal.aborted)setError(e.message);}finally{if(!live.current.signal.aborted){lock.current=false;setBusy(false);}}};
 const checked=day&&data?.checkins?.includes(day.date);
 return <PixelPanel className="next-checkin"><div><h2>{copyText('next3.checkin.title')}</h2><p>{day?day.date:copyText('next3.checkin.date')}{siteText("site.bb661e4194b55669")}{copyText('next3.checkin.amount')}</p><p>{copyText('next3.checkin.scope')}</p></div><PixelButton type="primary" onClick={execute} loading={busy} disabled={!day||status!=='ready'||checked}>{copyText(checked?'next3.checkin.done':'next3.checkin.button')}</PixelButton>{notice&&<Alert role="status" type="success" title={notice}/>} {error&&<Alert type="warning" title={error} action={<PixelButton onClick={()=>void read().catch(()=>{})}>{copyText('next3.retry')}</PixelButton>}/>}</PixelPanel>;
}
