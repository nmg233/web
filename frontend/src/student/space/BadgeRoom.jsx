import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Alert,Modal,Spin} from 'antd';
import {copyText} from '../../content/copy';
import {formatBeijingTime} from '../../utils/date';
import {useServerRewards} from '../useServerRewards';
import {useRewards} from '../useRewards';
import {BadgeArt} from '../ServerRewards';
import Rewards,{RewardArt} from '../Rewards';
import {badgeRoomItems,selectedBadge,badgeRoomReturn} from '../badgeRoomModel';
import {PixelButton} from '../visual/PixelUI';
import {trapFocus} from '../visual/trapFocus';
import './badge-room.css';

export default function BadgeRoom(){
 const remote=useServerRewards(),local=useRewards(),[params]=useSearchParams();
 const [selection,setSelection]=useState(null),[sceneFailed,setSceneFailed]=useState(false),trigger=useRef(null),heading=useRef(null),page=useRef(null);
 const items=badgeRoomItems(remote.data),highlight=params.get('grant'),returnTo=badgeRoomReturn(params.get('returnTo'));
 useEffect(()=>{const header=document.querySelector('.space-header');if(!header)return;const observer=new ResizeObserver(()=>page.current?.style.setProperty('--badge-room-header-top',Math.ceil(header.getBoundingClientRect().height)+'px'));observer.observe(header);return()=>observer.disconnect();},[]);
 const demos=[...(remote.data?.exchanges||[]).filter(e=>e.gift_type==='badge').map(e=>({key:'exchange:'+e.id,name:e.gift_name,art:e.art_id,earned:true,description:copyText('badgeRoom.demo.exchange'),condition:copyText('badgeRoom.demo.condition'),time:e.created_at})),...(local.status==='ready'?local.data.badges:[]).map(b=>({key:'local:'+b.id,name:b.title,localId:b.id,earned:b.earned,description:b.description,condition:b.condition}))];
 const selected=remote.loading||remote.error?null:(selection?.startsWith('demo:')?demos.find(b=>'demo:'+b.key===selection):selectedBadge(items,selection));
 const open=(key,event)=>{trigger.current=event.currentTarget;setSelection(key);};
 useEffect(()=>{if(remote.loading||remote.error||!highlight)return;const button=[...document.querySelectorAll('.badge-room [data-real-grant]')].find(el=>el.dataset.realGrant===highlight);if(button){button.scrollIntoView({block:'center',behavior:'instant'});button.focus({preventScroll:true});}},[remote.loading,remote.error,highlight]);
 const art=b=>b.localId?<RewardArt id={b.localId} badge/>:<BadgeArt art={b.art_id||b.art} size={128}/>;
 const display=(b,demo=false)=><button type="button" key={b.key} className={'badge-room-badge '+(b.earned?'is-earned':'is-locked')+(String(b.id)===highlight?' is-highlighted':'')} data-real-grant={!demo&&b.earned?b.id:undefined} data-locked-lesson={!demo&&!b.earned?b.lesson_id:undefined} data-demo-badge={demo?b.key:undefined} onClick={e=>open(demo?'demo:'+b.key:b.key,e)}>
  <span className="badge-room-medallion">{art(b)}</span><strong>{b.name}</strong><span>{copyText(b.earned?'badgeRoom.earned':'badgeRoom.locked')}</span>
 </button>;
 return <div ref={page} className="badge-room-page">
  <header className="badge-room-header"><Link to={returnTo}>{copyText('badgeRoom.back')}</Link><h1 ref={heading} tabIndex={-1}>{copyText('badgeRoom.title')}</h1><span>{copyText('badgeRoom.account')}</span></header>
  <div className="badge-room" data-scene-failed={sceneFailed||undefined}>
   {!sceneFailed&&<picture className="badge-room-scenery" aria-hidden="true"><source media="(max-width:767px)" srcSet="/assets/badge-room/room-768.webp"/><img src="/assets/badge-room/room-1536.webp" alt="" onError={()=>setSceneFailed(true)}/></picture>}
   <div className="badge-room-display">
    {remote.loading?<div className="badge-room-status" aria-busy="true"><Spin/><span>{copyText('badgeRoom.loading')}</span></div>:remote.error?<Alert type="warning" title={copyText('badgeRoom.error')} description={remote.error} action={<PixelButton onClick={remote.read}>{copyText('next3.retry')}</PixelButton>}/>:<>
     <section aria-labelledby="badge-room-earned"><h2 id="badge-room-earned">{copyText('badgeRoom.earnedTitle')} <span>{items.earned.length}</span></h2><div className="badge-room-grid">{items.earned.map(b=>display(b))}</div>{!items.earned.length&&<p className="badge-room-empty">{copyText('badgeRoom.noEarned')}</p>}</section>
     <section aria-labelledby="badge-room-locked"><h2 id="badge-room-locked">{copyText('badgeRoom.lockedTitle')} <span>{items.locked.length}</span></h2><div className="badge-room-grid">{items.locked.map(b=>display(b))}</div>{!items.locked.length&&<p className="badge-room-empty">{copyText(items.earned.length?'badgeRoom.allEarned':'badgeRoom.noDefinitions')}</p>}</section>
     {highlight&&!items.earned.some(b=>b.id===highlight)&&<p role="status" className="badge-room-empty">{copyText('badgeRoom.missingHighlight')}</p>}
     {!!demos.length&&<section className="badge-room-demo" aria-labelledby="badge-room-demo"><h2 id="badge-room-demo">{copyText('badgeRoom.demo.title')}</h2><p>{copyText('badgeRoom.demo.scope')}</p><div className="badge-room-grid">{demos.map(b=>display(b,true))}</div></section>}
    </>}
   </div>
  </div>
  <section className="badge-room-demo-shop" aria-label={copyText('badgeRoom.demo.shop')}><h2>{copyText('badgeRoom.demo.shop')}</h2><Rewards giftType="badge"/></section>
  <Modal open={!!selected} centered zIndex={1320} title={selected?.name} onCancel={()=>setSelection(null)} footer={<PixelButton onClick={()=>setSelection(null)}>{copyText('badgeRoom.close')}</PixelButton>} width={520} rootClassName="student-pixel student-interactions badge-room-modal" focusable={{trap:true,focusTriggerAfterClose:false}} modalRender={node=><div onKeyDownCapture={trapFocus}>{node}</div>} afterClose={()=>{const target=trigger.current?.isConnected?trigger.current:heading.current;target?.focus({preventScroll:true});}}>
   {selected&&<div className={'badge-room-detail '+(selected.earned?'is-earned':'is-locked')}>
    <div className="badge-room-detail-art">{art(selected)}</div><p className="badge-room-detail-status">{copyText(selected.earned?'badgeRoom.earned':'badgeRoom.locked')}</p><p>{selected.description||copyText('badgeRoom.noDescription')}</p>
    <h3>{copyText('badgeRoom.condition')}</h3>{selection?.startsWith('demo:')?<><p>{selected.condition}</p><p>{copyText('badgeRoom.demo.scope')}</p></>:selected.earned?<><p>{copyText('badgeRoom.earnedCondition')}</p><dl><dt>{copyText('badgeRoom.time')}</dt><dd>{formatBeijingTime(selected.earned_at)}</dd><dt>{copyText('badgeRoom.source')}</dt><dd>{selected.course_title} · {selected.lesson_title}</dd></dl>{selected.accessible?<Link to={`/courses/${selected.course_id}/lessons/${selected.lesson_id}/learn`}>{copyText('next3.badges.lesson')}</Link>:<p role="status">{copyText('next3.badges.history')}</p>}</>:<ul>{selected.checks?.map(c=><li key={c.key} className={c.satisfied?'is-satisfied':undefined}>{c.reason}{c.satisfied?' · '+copyText('badgeRoom.satisfied'):''}</li>)}</ul>}
   </div>}
  </Modal>
 </div>;
}
