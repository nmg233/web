import {useEffect,useState,useRef} from 'react';
// 静态避让：滚动时仅调整常驻入口位置，不播放动作或改变业务布局。
export default function useRobotAvoidance(button,pathname){
 const [offset,setOffset]=useState(0);
 const offsetRef=useRef(0);
 useEffect(()=>{
  let frame=0;
  const measure=()=>{
   frame=0;const el=button.current;if(!el)return;
   const actual=el.getBoundingClientRect(),base={left:actual.left,right:actual.right,top:actual.top+offsetRef.current,bottom:actual.bottom+offsetRef.current};
   const controls=[...document.querySelectorAll('.space-content button,.space-content a,.space-content input,.space-content textarea,.space-content select,[data-lesson-id]')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
   let next=0;
   while(base.top-next>132&&controls.some(r=>r.right>base.left-8&&r.left<base.right+8&&r.bottom>base.top-next-8&&r.top<base.bottom-next+8))next+=actual.height+12;
   if(base.top-next<80)next=0;
   offsetRef.current=next;setOffset(old=>old===next?old:next);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  const observer=new MutationObserver(schedule);const content=document.querySelector('.space-content');if(content)observer.observe(content,{childList:true,subtree:true});schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
 },[button,pathname]);
 return offset;
}
