import StudentCopyText from '../../content/ManagedText';
/* eslint-disable react-refresh/only-export-components */
import {useEffect,useState} from 'react';
import {Button} from 'antd';
import {useCourseApis} from '../useCourseApis';

import {copyText} from '../../content/copy';

import './article-content.css';
import RichArticle from './RichArticle';
import {validArticleBlocks,hasTeachingValue} from '../../utils/teachingContent';
export function articleBlocks(value){return validArticleBlocks(value);}
export function ProtectedPhoto({resource,download,title,caption}){
 const {courseAPI}=useCourseApis(),[state,setState]=useState({url:'',failed:false}),[attempt,setAttempt]=useState(0);
 // Clear the previous protected URL before reading a different resource.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{let live=true,url;setState({url:'',failed:false});const read=download||courseAPI.downloadResource;read(resource.id).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setState({url,failed:false});}).catch(()=>{if(live)setState({url:'',failed:true});});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[resource.id,download,courseAPI,attempt]);
 return <figure className="teaching-photo">{state.url?<img src={state.url} alt={title||resource.title} onError={()=>setState({url:'',failed:true})}/>:<p>{<StudentCopyText id={state.failed?'next.visit.photoUnavailable':'authoring.image.loading'}/>}{state.failed&&<Button onClick={()=>setAttempt(n=>n+1)}>{<StudentCopyText id={'authoring.retry'}/>}</Button>}</p>}<figcaption>{title??resource.title}{hasTeachingValue(caption??resource.description)&&<p>{caption??resource.description}</p>}</figcaption></figure>;
}
function ArticleFile({resource,download,title,caption}){
 const {courseAPI}=useCourseApis(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const open=async()=>{if(busy)return;setBusy(true);setError('');try{const blob=await(download||courseAPI.downloadResource)(resource.id),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=resource.file_name||resource.title;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError(copyText('inline.article.fileUnavailable'));}finally{setBusy(false);}};
 return <section className="teaching-file"><Button onClick={()=>void open()} loading={busy}>{title||resource.title}</Button>{hasTeachingValue(caption??resource.description)&&<p>{caption??resource.description}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
export default function ArticleContent({blocks,resources,download}){
 const visible=validArticleBlocks(blocks,resources);if(!visible.length)return null;
 return <article className="lesson-article" data-testid="lesson-article">{visible.map(block=>block.type==='rich'?<RichArticle key={block.id} html={block.html} resources={resources} download={download}/>:block.type==='paragraph'?<p key={block.id} className="study-prose">{block.text}</p>:(()=>{const resource=resources.find(r=>r.id===block.resourceId);return block.type==='file'?<ArticleFile key={block.id} resource={resource} download={download} title={block.title} caption={block.caption}/>:<ProtectedPhoto key={block.id} resource={resource} download={download} title={block.title} caption={block.caption}/>;})())}</article>;
}
