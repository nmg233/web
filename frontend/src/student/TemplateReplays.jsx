import {useEffect,useRef,useState} from 'react';
import {Button,Space} from 'antd';
import Alert from './visual/StudentAlert';
import {StudySection} from './visual/StudyUI';
import {useCourseApis} from './useCourseApis';
import {copyText} from '../content/copy';
export default function TemplateReplays({rows}){
 const{courseAPI}=useCourseApis(),[player,setPlayer]=useState({id:null,url:'',error:'',loading:false}),sequence=useRef(0);
 useEffect(()=>()=>{sequence.current++;},[]);
 const play=async id=>{const ticket=++sequence.current;setPlayer({id,url:'',error:'',loading:true});try{const result=await courseAPI.streamUrl(id),url=new URL(result.url,location.origin);if(url.origin!==location.origin||url.pathname!==`/api/courses/replays/${id}/stream`)throw Error(copyText('system.review.034'));if(ticket===sequence.current)setPlayer({id,url:url.href,error:'',loading:false});}catch(e){if(ticket===sequence.current)setPlayer({id,url:'',error:e.response?.data?.error||copyText('system.learning.083'),loading:false});}};
 if(!rows?.length)return null;
 return <StudySection title={copyText('system.review.036')}><Space wrap>{rows.map(r=><Button key={r.id} onClick={()=>play(r.id)} loading={player.loading&&player.id===r.id}>{r.title}</Button>)}</Space>{player.error&&<Alert type="warning" title={player.error} action={<Button onClick={()=>play(player.id)}>{copyText('system.learning.082')}</Button>}/>} {player.url&&<video className="study-video" controls src={player.url} onError={()=>setPlayer(v=>({...v,error:copyText('system.learning.083')}))}/>}</StudySection>;
}
