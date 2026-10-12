/* eslint-disable react-refresh/only-export-components */
import {useEffect,useState} from 'react';
import {Button} from 'antd';
import {useCourseApis} from '../useCourseApis';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
import './article-content.css';
export function articleBlocks(value){try{const blocks=typeof value==='string'?JSON.parse(value):value;return Array.isArray(blocks)?blocks:[];}catch{return [];}}
export function ProtectedPhoto({resource,download,title,caption}){
 const {courseAPI}=useCourseApis(),[state,setState]=useState({url:'',failed:false}),[attempt,setAttempt]=useState(0);
 // Clear the previous protected URL before reading a different resource.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{let live=true,url;setState({url:'',failed:false});const read=download||courseAPI.downloadResource;read(resource.id).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setState({url,failed:false});}).catch(()=>{if(live)setState({url:'',failed:true});});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[resource.id,download,courseAPI,attempt]);
 return <figure className="teaching-photo">{state.url?<img src={state.url} alt={title||resource.title} onError={()=>setState({url:'',failed:true})}/>:<p>{copyText(state.failed?'next.visit.photoUnavailable':'authoring.image.loading')}{state.failed&&<Button onClick={()=>setAttempt(n=>n+1)}>{copyText('authoring.retry')}</Button>}</p>}<figcaption>{title??resource.title}<Sentence>{caption??resource.description}</Sentence></figcaption></figure>;
}
export default function ArticleContent({blocks,resources,download}){
 return <article className="lesson-article" data-testid="lesson-article">{articleBlocks(blocks).map(block=>block.type==='paragraph'?<Sentence key={block.id} className="study-prose">{block.text}</Sentence>:block.type==='image'?(()=>{const resource=resources.find(r=>r.id===block.resourceId);return resource?<ProtectedPhoto key={block.id} resource={resource} download={download} title={block.title} caption={block.caption}/>:<p key={block.id}>{copyText('next.visit.photoUnavailable')}</p>;})():null)}</article>;
}
