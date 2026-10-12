import {copyText} from '../../content/copy';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AssistantContent } from '../StudentAssistant';
import { useCourseExperience } from './useCourseExperience';
import { asset } from './identity';
import { PixelImage } from '../visual/PixelUI';
import PixelIcon from '../visual/PixelIcon';
import {createPortal} from 'react-dom';
import useRobotPosition from './useRobotPosition';
import {PLATFORM_FONT} from './identity';
import {patchAsset} from './visualAssets';

export default function FloatingAssistant() {
  const s=useCourseExperience(),location=useLocation(),navigate=useNavigate();
  const button=useRef(null),dialog=useRef(null),lastOpen=useRef(false),consumedOpen=useRef(null);
  const [imageFailed,setImageFailed]=useState(false);
  const [viewport,setViewport]=useState(()=>({width:innerWidth,height:window.visualViewport?.height||innerHeight,top:window.visualViewport?.offsetTop||0}));
  const open=s?.overlay==='chat',mobile=viewport.width<768||(viewport.width<992&&viewport.height<450);
  const robot=useRobotPosition(viewport.width<768?64:80);
  useEffect(()=>{
    const update=()=>setViewport({width:innerWidth,height:window.visualViewport?.height||innerHeight,top:window.visualViewport?.offsetTop||0});
    window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return()=>{window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
  },[]);
  useEffect(()=>{
    if(!s)return;const params=new URLSearchParams(location.search);
    if(params.get('openAssistant')==='1'&&consumedOpen.current!==location.key){
      consumedOpen.current=location.key;
      s.openOverlay('chat');params.delete('openAssistant');navigate(location.pathname+(params.size?'?'+params:'')+location.hash,{replace:true,state:location.state});
    }
  },[location,navigate,s]);
  useEffect(()=>{
    if(open){const timer=setTimeout(()=>dialog.current?.querySelector('#assistant-question')?.focus(),0);lastOpen.current=true;return()=>clearTimeout(timer);}
    if(lastOpen.current){lastOpen.current=false;if(!s?.overlay)button.current?.focus();}
  },[open,s?.overlay]);
  useEffect(()=>{
    if(!open||!mobile)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};
  },[open,mobile]);
  useEffect(()=>{
    if(!open)return;
    const escape=event=>{if(event.key==='Escape'&&!document.activeElement?.closest('.ant-modal-root,.ant-drawer')){event.preventDefault();event.stopPropagation();s.openOverlay(null);}};
    const outside=event=>{if(!dialog.current?.contains(event.target)&&!button.current?.contains(event.target))s.openOverlay(null);};
    window.addEventListener('keydown',escape,true);
    document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',escape,true);document.removeEventListener('pointerdown',outside);};
  },[open,s]);
  if(!s)return null;
  const close=()=>s.openOverlay(null);
  const keys=event=>{
    if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close();return;}
    if(event.key!=='Tab'||!mobile)return;
    const items=[...dialog.current.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(e=>e.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  return createPortal(<div className="student-pixel student-interactions course-assistant-host" data-space-theme="voyage" style={{fontFamily:PLATFORM_FONT}}>
    <button ref={button} type="button" className="course-robot" disabled={!!s.overlay&&s.overlay!=='chat'} style={{left:robot.position.x,top:robot.position.y,translate:'none',scale:'none',transform:'none'}} onPointerDown={robot.pointerDown} onPointerMove={robot.pointerMove} onPointerUp={e=>{if(robot.pointerUp(e))s.openOverlay(open?null:"chat");}} onPointerCancel={robot.pointerCancel} onLostPointerCapture={robot.lostPointerCapture} onKeyDown={e=>{if(e.key==='Home'){e.preventDefault();robot.reset();}}} aria-label={copyText('assistant.open')} aria-expanded={open} aria-controls="course-chat" onClick={e=>{if(!robot.consumeClick(e))s.openOverlay(open?null:'chat');}}>
      {imageFailed?<PixelIcon name="help" size={44}/>:<img src={patchAsset('robot-wink',96)} srcSet={`${patchAsset('robot-wink',96)} 96w, ${patchAsset('robot-wink',192)} 192w`} sizes="80px" width={80} height={80} alt="" onError={()=>setImageFailed(true)}/>}
      {s.unseen&&<span className="course-chat-unread" aria-label={copyText('system.robot.001')}/>}
    </button>
    <button className="robot-reset" onClick={()=>{robot.reset();button.current?.focus();}}>{copyText('next.robot.reset')}</button>
    {open&&mobile&&<button type="button" className="course-chat-mask" tabIndex={-1} aria-label={copyText('system.robot.002')} onClick={close}/>}
    <section ref={dialog} id="course-chat" className="course-chat" hidden={!open} role="dialog" aria-modal={mobile?'true':undefined} aria-labelledby="course-chat-title" onKeyDown={keys}
      style={mobile?{top:viewport.top+8,height:Math.max(0,viewport.height-136),bottom:'auto'}:{top:viewport.top+Math.max(8,viewport.height-Math.min(640,viewport.height-160)-128),height:Math.min(640,viewport.height-160),bottom:'auto'}}>
      <header><PixelImage src={asset('robot',96)} alt="" width={42} height={42}/><div><h2 id="course-chat-title">{copyText('assistant.name')}</h2><span>{copyText('system.robot.003')}</span></div><button aria-label={copyText('assistant.close')} onClick={close}>×</button></header>
      <AssistantContent open={open}/>
    </section>
  </div>,document.body);
}
