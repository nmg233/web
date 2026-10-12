import Alert from '../../student/visual/StudentAlert';
import Sentence from '../../content/Sentence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import client from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { copyText, copyFragment } from '../../content/copy';
import { requestError } from '../../utils/requestError';
import { PixelButton, PixelImage } from '../visual/PixelUI';
import { patchAsset } from './visualAssets';
export default function DailyFortune(){const {user}=useAuth();return <Fortune key={user.id}/>;}
function Fortune(){
  const [state,setState]=useState({loading:true,data:null,error:null});
  const sequence=useRef(0),live=useRef(false),timer=useRef(null);
  const invalidate=useCallback(()=>{live.current=false;sequence.current++;},[]);
  const read=useCallback(async()=>{
    const ticket=++sequence.current;setState(s=>({...s,loading:true,error:null}));
    try{const data=await client.get('/account/daily-fortune',{silent:true});if(!live.current||ticket!==sequence.current)return;setState({loading:false,data,error:null});}
    catch(error){if(live.current&&ticket===sequence.current)setState(s=>({...s,loading:false,error}));}
  },[]);
  useEffect(()=>{live.current=true;const first=setTimeout(()=>void read(),0);const visible=()=>{if(document.visibilityState==='visible')void read();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{invalidate();clearTimeout(first);clearTimeout(timer.current);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};},[read,invalidate]);
  useEffect(()=>{clearTimeout(timer.current);if(state.data?.nextUpdateAt){const wait=Math.max(1000,Date.parse(state.data.nextUpdateAt)-Date.now()+100);timer.current=setTimeout(()=>void read(),Math.min(wait,2147483647));}return()=>clearTimeout(timer.current);},[state.data,read]);
  const data=state.data;
  return <section className="daily-fortune" aria-labelledby="fortune-title" data-testid="daily-fortune">
    <div className="fortune-heading"><h2 id="fortune-title">{copyText('fortune.title')}</h2><span>{state.error&&data?copyText('fortune.lastDate')+' '+data.date:data?.date||copyText('fortune.date')}</span></div>
    {state.loading?<div role="status"><Spin/>{copyText('fortune.loading')}</div>:state.error?<Alert role="alert" type="warning" title={copyText('fortune.failed')} description={requestError(state.error)} action={<PixelButton onClick={read}>{copyText('fortune.retry')}</PixelButton>}/>:data&&<div className="fortune-result">
      <PixelImage src={patchAsset(data.art,96)} width={96} height={96} alt=""/>
      <strong className="fortune-level">{copyText('fortune.level.'+data.level)}</strong>
      <div className="fortune-hints"><Sentence><span>{copyFragment('fortune.good')}</span>{data.good.map(id=>copyFragment('fortune.good.'+id)).join(' · ')}</Sentence><Sentence><span>{copyFragment('fortune.avoid')}</span>{data.avoid.map(id=>copyFragment('fortune.avoid.'+id)).join(' · ')}</Sentence></div>
    </div>}
  </section>;
}
