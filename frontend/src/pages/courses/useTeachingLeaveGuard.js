/* eslint-disable react-hooks/immutability -- BrowserRouter's mutable history needs a scoped, reversible adapter; no React state is mutated. */
import {useContext,useEffect} from 'react';
import {UNSAFE_NavigationContext} from 'react-router-dom';

let activeHistoryGuard=null,installed=false;
export function installTeachingLeaveHistory(){
 if(installed||typeof window==='undefined')return;
 installed=true;
 // Register before BrowserRouter's history listener. A late popstate listener
 // can lose the mounted editor before it has a chance to cancel navigation.
 window.addEventListener('popstate',event=>activeHistoryGuard?.(event),true);
}

// BrowserRouter has no public blocker API. Scope the adapter to this mounted
// authoring workspace; restore the original navigator on cleanup.
export default function useTeachingLeaveGuard(unsaved,message,processing){
 const {navigator}=useContext(UNSAFE_NavigationContext);
 useEffect(()=>{
  const originals={push:navigator.push,replace:navigator.replace};
  const allowed=to=>/^\/(login|change-password)(?:[/?#]|$)/.test(typeof to==='string'?to:to?.pathname||'')||(!processing?.current.size&&(!unsaved.current.size||window.confirm(message)));
  navigator.push=function(to,...args){if(allowed(to))return originals.push.call(this,to,...args);};
  navigator.replace=function(to,...args){if(allowed(to))return originals.replace.call(this,to,...args);};
  // go() is handled by the same popstate path as the browser Back/Forward keys.
  let current=window.history.state?.idx,restoring=false,leaveDelta=null,bypass=false;
  const pop=e=>{
   const next=e.state?.idx;
   if(restoring){e.stopImmediatePropagation();restoring=false;if(leaveDelta!==null){const delta=leaveDelta;leaveDelta=null;bypass=true;window.history.go(delta);}return;}
   if(bypass||(!unsaved.current.size&&!processing?.current.size)||!Number.isInteger(current)||!Number.isInteger(next)){bypass=false;current=next;return;}
   if(next===current)return;
   e.stopImmediatePropagation();
   const delta=next-current,confirmed=!processing?.current.size&&window.confirm(message);
   restoring=true;leaveDelta=confirmed?delta:null;
   window.history.go(-delta);
  };
  // Update the index after SPA pushes without creating extra history entries.
  const wrap=(name)=>{const guarded=navigator[name];navigator[name]=function(...args){const result=guarded.apply(this,args);current=window.history.state?.idx;return result;};};
  wrap('push');wrap('replace');
  const unload=e=>{if(unsaved.current.size||processing?.current.size){e.preventDefault();e.returnValue='';}};
  activeHistoryGuard=pop;window.addEventListener('beforeunload',unload);
  return()=>{navigator.push=originals.push;navigator.replace=originals.replace;if(activeHistoryGuard===pop)activeHistoryGuard=null;window.removeEventListener('beforeunload',unload);};
 },[navigator,unsaved,message,processing]);
}
