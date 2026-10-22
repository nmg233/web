import {useEffect,useRef,useState} from 'react';
import {Button,Space} from 'antd';
import {useCourseApis} from '../useCourseApis';

// Only server-sanitized HTML is accepted. Shadow DOM isolates article formatting.
export default function RichArticle({html,resources=[],download,editable=false,onChange}) {
  const host=useRef(null),root=useRef(null),emitted=useRef(null),change=useRef(onChange);
  const [initial]=useState(html),renderHtml=editable?initial:html;
  const {courseAPI}=useCourseApis(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{change.current=onChange;},[onChange]);
  const ids=JSON.stringify(resources.map(r=>r.id));
  useEffect(()=>{
    if(!host.current)return;
    const shadow=root.current||(root.current=host.current.attachShadow({mode:'open'}));
    const style=document.createElement('style');style.textContent=':host{display:block}article{font:inherit;line-height:1.8;color:inherit;overflow-wrap:anywhere}article:focus{outline:2px solid #087f78}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #b6ae95;padding:6px}p{margin:.8em 0}blockquote{margin:1em 0;padding:0 1em;border-left:3px solid #087f78}';
    const content=document.createElement('article');content.innerHTML=(editable&&emitted.current!==null?emitted.current:renderHtml)||'';
    content.setAttribute('data-testid','rich-article-content');
    if(editable){content.contentEditable='true';content.setAttribute('role','textbox');content.setAttribute('aria-label','可视化文章正文');content.setAttribute('aria-multiline','true');}
    const urls=[],images=[...content.querySelectorAll('img')];let live=true;
    const read=download||courseAPI.downloadResource;
    for(const img of images){const source=img.getAttribute('src'),id=/^pbl-resource:(\d+)$/.exec(source||'')?.[1];img.removeAttribute('src');if(id)img.dataset.resourceId=id;}
    shadow.replaceChildren(style,content);
    const update=()=>{const copy=content.cloneNode(true);for(const img of copy.querySelectorAll('img')){if(img.dataset.resourceId)img.setAttribute('src','pbl-resource:'+img.dataset.resourceId);img.removeAttribute('data-resource-id');}emitted.current=copy.innerHTML;change.current?.(copy.innerHTML);};
    const paste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));update();};
    const drop=e=>e.preventDefault();
    if(editable){content.addEventListener('input',update);content.addEventListener('paste',paste);content.addEventListener('drop',drop);}
    setError('');
    void Promise.all(images.map(async img=>{const id=Number(img.dataset.resourceId);if(!id||!resources.some(r=>r.id===id)){if(live)setError('文章有图片不可访问，请重新核对；正文仍保留');return;}try{const blob=await read(id);if(!live)return;const url=URL.createObjectURL(blob);urls.push(url);img.src=url;img.onerror=()=>{if(live)setError('文章图片加载失败，正文保留，可重试');};}catch{if(live)setError('文章图片读取失败，正文保留，可重试');}}));
    return()=>{live=false;urls.forEach(URL.revokeObjectURL);content.removeEventListener('input',update);content.removeEventListener('paste',paste);content.removeEventListener('drop',drop);};
  // Parent may reread resource metadata; stable resource IDs avoid losing the editor selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[renderHtml,editable,download,courseAPI,ids,attempt]);
  const format=command=>{document.execCommand(command,false);root.current?.querySelector('article')?.dispatchEvent(new Event('input',{bubbles:true}));};
  return <section className="rich-article">{editable&&<Space wrap><Button onMouseDown={e=>e.preventDefault()} onClick={()=>format('bold')}>加粗</Button><Button onMouseDown={e=>e.preventDefault()} onClick={()=>format('justifyCenter')}>居中</Button><Button onMouseDown={e=>e.preventDefault()} onClick={()=>format('justifyLeft')}>左对齐</Button><small>直接点击正文修改；粘贴仅保留文字，保存时再次安全清洗</small></Space>}<div ref={host} data-testid="rich-article"/>{error&&<p role="alert">{error}<Button onClick={()=>setAttempt(n=>n+1)}>重读文章图片</Button></p>}</section>;
}
