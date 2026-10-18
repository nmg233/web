import ConfigCopyText from '../content/ConfigText';
import {runtimeText as runtimeCopyText} from '../content/runtimeCopy.js';
import StudentCopyText from '../content/ManagedText';
import {useEffect,useState} from 'react';
import client from '../api/client';
import {PixelPanel,PixelTag} from './visual/PixelUI';
export function RewardImage({id,name='',size=128}){
 const [state,setState]=useState(null);
 useEffect(()=>{let active=true,url;const controller=new AbortController();
  if(id)client.get('/reward-shop/images/'+id,{responseType:'blob',silent:true,signal:controller.signal}).then(blob=>{url=URL.createObjectURL(blob);if(active)setState({id,url});}).catch(()=>{if(active)setState({id,error:true});});
  return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
 },[id]);
 return state?.id===id&&state.url?<img src={state.url} alt={name} className="real-reward-image" width={size} height={size}/>:<span className="real-reward-image-fallback" style={{width:size,height:size}} role="img" aria-label={state?.id===id&&state.error?runtimeCopyText("student26.d3330186008ac3f5"):runtimeCopyText("student26.2ea3770a5bf8f436")}>{state?.id===id&&state.error?<StudentCopyText id="student26.4f0e89731a8e2927"/>:'◇'}</span>;
}
export default function RewardGift({gift,children}){return <PixelPanel className="real-reward-gift"><RewardImage id={gift.image_id} name={gift.name}/><div><PixelTag>{gift.type==='badge'?<StudentCopyText id="student26.9021a433e1749b54"/>:<StudentCopyText id="student26.68fa75160a25ef2b"/>}</PixelTag>{gift.course_title&&<small>{gift.course_title}</small>}<h3><ConfigCopyText object={gift} field="name" value={gift.name}/></h3><p className="real-reward-description">{gift.description||<StudentCopyText id="student26.e2416650374d45a1"/>}</p><strong>{gift.price}<StudentCopyText id="student26.edc79030d3c9e844"/></strong><dl><div><dt><StudentCopyText id="student26.162f7afc286dded7"/></dt><dd>{gift.stock}</dd></div><div><dt><StudentCopyText id="student26.d66489176a6b85c9"/></dt><dd>{gift.per_student_limit??<StudentCopyText id="student26.15d4dc9be8bc51bd"/>}{gift.per_student_limit!==null?<StudentCopyText id="student26.9393104489ee4936"/>:''}</dd></div></dl>{gift.type==='badge'&&<p><StudentCopyText id="student26.c6448bd9ff96dfd8"/></p>}{gift.blockedReason&&<p role="status">{gift.blockedReason}</p>}{children}</div></PixelPanel>;}
