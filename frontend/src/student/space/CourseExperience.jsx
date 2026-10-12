import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { useCourseApis, useCourseId } from '../useCourseApis';
import client from '../../api/client';
import { requestError } from '../../utils/requestError';
import { STUDENT_COURSES_CHANGED } from '../accessPolicy';
import { CourseExperienceContext } from './useCourseExperience';
import { useCoursePresentation } from './CoursePresentation';
import { copyText } from '../../content/copy';

export default function CourseExperience({ children }) {
  const id=useCourseId(), { user }=useAuth();
  return id ? <Session key={`${user.id}:${id}`} id={id}>{children}</Session> : children;
}
function Session({ id, children }) {
  const look=useCoursePresentation();
  const { aiAPI }=useCourseApis();
  const [catalog,setCatalog]=useState({loading:true,error:null,enabled:null,course:null});
  const [draft,setDraft]=useState(''),[messages,setMessages]=useState([]),[waiting,setWaiting]=useState(false);
  const [overlay,setOverlay]=useState(null),[unseen,setUnseen]=useState(false);
  const [avatar,setAvatar]=useState({id:null,state:'loading',notice:''});
  const live=useRef(false),sequence=useRef(0),reading=useRef(0),avatarSeq=useRef(0),busy=useRef(false),counter=useRef(0);
  const overlayRef=useRef(null),nearBottomRef=useRef(true),scrollTopRef=useRef(null),avatarBusy=useRef(false);
  const openOverlay=useCallback(next=>{overlayRef.current=next;setOverlay(next);},[]);
  const invalidate=useCallback(()=>{live.current=false;sequence.current++;reading.current++;avatarSeq.current++;},[]);
  const clear=useCallback(()=>{
    sequence.current++;reading.current++;avatarSeq.current++;busy.current=false;avatarBusy.current=false;
    setDraft('');setMessages([]);setWaiting(false);setUnseen(false);openOverlay(null);setAvatar({id:null,state:'loading',notice:''});
  },[openOverlay]);
  const load=useCallback(async()=>{
    const ticket=++reading.current;setCatalog(s=>({...s,loading:true,error:null}));
    try {
      const data=await aiAPI.getCourses();if(!live.current||ticket!==reading.current)return;
      const course=(data.courses||[]).find(c=>String(c.id)===id);
      setCatalog({loading:false,error:null,enabled:Boolean(data.enabled),course});
      if(!course)clear();
    }catch(error){if(live.current&&ticket===reading.current)setCatalog(s=>({...s,loading:false,error}));}
  },[aiAPI,id,clear]);
  const readAvatar=useCallback(async()=>{
    const ticket=++avatarSeq.current;setAvatar(s=>({...s,state:'loading',notice:''}));
    try {const data=await client.get(`/course-spaces/${id}/preferences/avatar`,{silent:true});if(live.current&&ticket===avatarSeq.current)setAvatar({id:data.avatarId,state:'ready',notice:''});}
    catch(error){if(live.current&&ticket===avatarSeq.current)setAvatar(s=>({...s,state:'error',notice:requestError(error)}));}
  },[id]);
  const saveAvatar=async avatarId=>{
    if(avatarBusy.current)return;avatarBusy.current=true;const ticket=++avatarSeq.current;
    setAvatar(s=>({...s,state:'saving',notice:''}));let saved=false;
    try {
      await client.put(`/course-spaces/${id}/preferences/avatar`,{avatarId},{silent:true});saved=true;
      if(!live.current||ticket!==avatarSeq.current)return;
      setAvatar({id:avatarId,state:'reading',notice:''});
      const data=await client.get(`/course-spaces/${id}/preferences/avatar`,{silent:true});
      if(live.current&&ticket===avatarSeq.current)setAvatar({id:data.avatarId,state:'ready',notice:copyText('avatar.saved')});
    }catch(error){if(live.current&&ticket===avatarSeq.current)setAvatar(s=>({...s,id:saved?avatarId:s.id,state:saved?'uncertain':'error',notice:saved?copyText('avatar.uncertain'):requestError(error)}));}
    finally {if(live.current&&ticket===avatarSeq.current)avatarBusy.current=false;}
  };
  useEffect(()=>{
    live.current=true;const timer=setTimeout(()=>{void load();},0);
    const changed=({detail})=>{if(!detail.courses.some(c=>String(c.id)===id))clear();else void load();};
    window.addEventListener(STUDENT_COURSES_CHANGED,changed);
    return()=>{invalidate();clearTimeout(timer);window.removeEventListener(STUDENT_COURSES_CHANGED,changed);};
  },[id,load,readAvatar,clear,invalidate]);
  useEffect(()=>{if(look.theme==='voyage'){const timer=setTimeout(()=>void readAvatar(),0);return()=>clearTimeout(timer);}},[look.theme,readAvatar]);
  const ask=async()=>{
    const question=draft.trim();if(!question||question.length>1000||busy.current||!catalog.enabled||catalog.loading||catalog.error||!catalog.course)return;
    busy.current=true;const ticket=++sequence.current,messageId=++counter.current;
    setDraft('');setWaiting(true);setUnseen(false);nearBottomRef.current=true;scrollTopRef.current=null;
    setMessages(items=>[...items,{id:messageId,question}]);
    try {
      const result=await aiAPI.ask(question,Number(id));if(!live.current||ticket!==sequence.current)return;
      setMessages(items=>items.map(item=>item.id===messageId?{...item,result,courseId:id}:item));
      setUnseen(overlayRef.current!=='chat'||!nearBottomRef.current);
    }catch(error){
      if(!live.current||ticket!==sequence.current)return;
      const code=error.response?.data?.code;
      if(code==='AI_ACCESS_CHANGED'||[403,404].includes(error.response?.status)){clear();void load();}
      else {setMessages(items=>items.map(item=>({...item,...(code==='AI_CONTEXT_CHANGED'&&item.result?{result:{...item.result,sources:[]},outdated:true}:{}),...(item.id===messageId?{error}:{})})));setUnseen(overlayRef.current!=='chat'||!nearBottomRef.current);}
    }finally{if(live.current&&ticket===sequence.current){busy.current=false;setWaiting(false);}}
  };
  return <CourseExperienceContext.Provider value={{id,catalog,load,draft,setDraft,messages,waiting,ask,overlay,openOverlay,unseen,setUnseen,nearBottomRef,scrollTopRef,avatar,readAvatar,saveAvatar}}>{children}</CourseExperienceContext.Provider>;
}
