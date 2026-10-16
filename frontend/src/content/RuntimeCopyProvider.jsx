import {useEffect} from 'react';
import {useCopyVersion} from './useCopyVersion';
import {useLocation} from 'react-router-dom';
import {useAuth} from '../store/AuthContext';
import client from '../api/client';
import {runtimeText,setCopyScope,receiveCopy} from './runtimeCopy';
export default function RuntimeCopyProvider({children,previewScope}){
 const {user}=useAuth(),{pathname}=useLocation(),courseId=pathname.match(/^\/courses\/(\d+)/)?.[1],lessonId=pathname.match(/\/lessons\/(\d+)/)?.[1];
 const enabled=user?.role==='student'||!user||Boolean(previewScope),scope=[user?.id||'public',courseId||'',lessonId||'',previewScope||''].join(':');
 const version=useCopyVersion();
 useEffect(()=>{document.title=runtimeText('platform.name');},[version]);
 useEffect(()=>{
  let live=true,ticket=0;setCopyScope(scope,enabled);if(!enabled)return;
  const refresh=async()=>{const current=++ticket;try{const params={...(courseId?{courseId}:{}),...(lessonId?{lessonId}:{}),...(previewScope?{scope:previewScope,publishedOnly:'true'}:{})};let result;
   if(!user){const r=await fetch('/api/student-copy/published',{cache:'no-store'});if(!r.ok)throw Error('文案读取失败');result=await r.json();}
   else result=await client.get('/student-copy/'+(previewScope?'preview':'published'),{params,silent:true,studentAccessProbe:true});
   if(live&&current===ticket)receiveCopy(scope,result.entries);
  }catch{if(live&&current===ticket)receiveCopy(scope,{});}};
  void refresh();const interval=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},25000),focus=()=>void refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{live=false;ticket++;clearInterval(interval);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[scope,enabled,user,courseId,lessonId,previewScope]);
 return children;
}
