import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useServerRewards} from './useServerRewards';
import {STUDENT_COURSES_CHANGED} from './accessPolicy';
import {RealCoinsContext,COIN_LEARNING_CHANGED} from './useRealCoins';
export default function RealCoinsProvider({children}){
 const {request}=useServerRewards(),location=useLocation(),active=useRef(false),sequence=useRef(0),[state,setState]=useState({data:null,loading:true,error:'',pending:[],settlementError:''});
 const refresh=useCallback(async({settle=true}={})=>{const ticket=++sequence.current;setState(s=>({...s,data:null,loading:true,error:'',pending:[]}));
  let result=null,settlementError='';
  try{if(settle){try{result=await request('/coins/reconcile',{});}catch(e){settlementError=e.response?.data?.error||e.message;}}
   const started=performance.now(),data=await request('/coins');data.expires=started+data.today.validForMs;
   if(active.current&&ticket===sequence.current)setState({data,loading:false,error:'',pending:result?.pending||[],settlementError});return data;
  }catch(e){if(active.current&&ticket===sequence.current)setState(s=>({...s,data:null,loading:false,error:e.response?.data?.error||e.message,settlementError}));return null;}
 },[request]);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{let timer;const read=()=>{if(document.visibilityState!=='hidden'){clearTimeout(timer);timer=setTimeout(()=>void refresh(),150);}};void refresh();window.addEventListener('focus',read);window.addEventListener('online',read);window.addEventListener('pageshow',read);document.addEventListener('resume',read);window.addEventListener(STUDENT_COURSES_CHANGED,read);window.addEventListener(COIN_LEARNING_CHANGED,read);document.addEventListener('visibilitychange',read);return()=>{clearTimeout(timer);window.removeEventListener('focus',read);window.removeEventListener('online',read);window.removeEventListener('pageshow',read);document.removeEventListener('resume',read);window.removeEventListener(STUDENT_COURSES_CHANGED,read);window.removeEventListener(COIN_LEARNING_CHANGED,read);document.removeEventListener('visibilitychange',read);};},[location.pathname,refresh]);
 useEffect(()=>{if(!state.data)return;const timer=setTimeout(()=>void refresh(),Math.max(1,state.data.expires-performance.now()));return()=>clearTimeout(timer);},[state.data,refresh]);
 return <RealCoinsContext.Provider value={{...state,refresh,request}}>{children}</RealCoinsContext.Provider>;
}
