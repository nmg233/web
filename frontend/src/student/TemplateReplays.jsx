import ConfigCopyText from '../content/ConfigText';
import {useState} from 'react';
import {Button,Space} from 'antd';
import {StudySection} from './visual/StudyUI';
import {useCourseApis} from './useCourseApis';
import {copyText} from '../content/copy';
import SignedReplayPlayer from '../components/common/SignedReplayPlayer';
export default function TemplateReplays({rows}){
 const {courseAPI}=useCourseApis(),[selected,setSelected]=useState(null);
 if(!rows?.length)return null;
 return <StudySection title={copyText('system.review.036')} data-copy-bindings={JSON.stringify(['system.review.036'])}><Space wrap>{rows.map(r=><Button key={r.id} aria-pressed={selected===r.id} onClick={()=>setSelected(r.id)}><ConfigCopyText object={r} field="title" value={r.title}/></Button>)}</Space>{selected&&<SignedReplayPlayer key={selected} replayId={selected} streamUrl={courseAPI.streamUrl} className="study-video"/>}</StudySection>;
}
