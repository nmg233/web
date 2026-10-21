import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Button,Input,Select,Space} from 'antd';
import client from '../../api/client';
import RichArticle from '../../student/space/RichArticle';
import {useLessonDraft} from './LessonDraftContext';
import {maintenanceAPI as api} from './maintenanceApi';
import {requestError} from '../../utils/requestError';
export default function ArticleDraftFields({lesson,resources,refresh,disabled,onBusyChange}) {
 const d=useLessonDraft(),[url,setUrl]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[error,setError]=useState(''),key=useRef(crypto.randomUUID()),pending=useRef(false),fileInput=useRef(null);
 useEffect(()=>{const check=()=>pending.current?Promise.reject(new Error('文章导入来源尚未处理；请先导入或清除选择，再保存课时')):Promise.resolve();d.validators.current.add(check);return()=>d.validators.current.delete(check);},[d.validators]);
 const blocks=d.values.article_blocks||[],images=resources.filter(r=>r.lesson_id===lesson.id&&['jpg','jpeg','png','webp','gif'].includes(r.file_type));
 const download=useCallback(id=>api.download(d.courseId,id),[d.courseId]);
 const update=fn=>d.patch(current=>{const before=current.article_blocks||[],next=fn(before);return next===before?null:{article_blocks:next};});
 const run=async method=>{
  if(busy)return;const sourceAtStart=d.values.article_url;setBusy(true);onBusyChange?.(true);setError('');
  try{
   const latest=(await api.read(d.courseId)).lessons.find(l=>l.id===lesson.id);
   const body=new FormData();body.append('expected_revision',latest.content_revision);body.append('requestKey',key.current);
   if(method==='url')body.append('url',url);else if(file)body.append('article',file);else throw Error('请选择文章 HTML 或 ZIP');
   const r=await client.post(`/courses/${d.courseId}/maintenance/lessons/${lesson.id}/article-import`,body,{headers:{'Content-Type':undefined},silent:true,timeout:240000});
   update(list=>list.some(block=>block.id===r.block.id)?list:[...list,r.block]);
   if(r.sourceUrl)d.patch(current=>current.article_url===sourceAtStart?{article_url:r.sourceUrl}:null);
   setNotice(r);pending.current=false;setFile(null);setUrl('');if(fileInput.current)fileInput.current.value='';key.current=crypto.randomUUID();await refresh();
  }catch(e){setError(requestError(e));}finally{setBusy(false);onBusyChange?.(false);}
 };
 return <section id="lesson-article-editor" className="authoring-section"><h3>课堂文章 · 导入与可视化修改</h3><p>参观体验优先导入文章。本站保存正文和图片；保留安全的段落、对齐、颜色、字号、表格和边框，移除脚本、全局样式、外部字体、背景图及嵌入视频/音频。视频可另行上传。</p><label>微信公众号文章链接<Input aria-label="微信公众号文章链接" value={url} onChange={e=>{setUrl(e.target.value);pending.current=Boolean(e.target.value||file);d.patch({});key.current=crypto.randomUUID();}} placeholder="https://mp.weixin.qq.com/s/…" disabled={disabled||busy}/></label><Button disabled={disabled||busy||!url} loading={busy} onClick={()=>void run('url')}>读取公众号正文和图片</Button><details><summary>链接失败：导入 HTML＋图片包</summary><p>选择 UTF-8 HTML（无图片时）或 ≤20MiB ZIP：唯一 HTML、相对路径图片，可选 image-map.json。包内图片全部核验后才提交；缺图明确失败。每张图片 ≤5MB，每次最多40张。不运行网页或脚本。</p><input ref={fileInput} aria-label="文章 HTML 或图片包" type="file" accept=".html,.htm,.zip" disabled={disabled||busy} onChange={e=>{setFile(e.target.files?.[0]||null);pending.current=Boolean(e.target.files?.[0]||url);d.patch({});key.current=crypto.randomUUID();}}/><Button disabled={disabled||busy||!file} loading={busy} onClick={()=>void run('file')}>导入本站文章草稿</Button></details><Button disabled={disabled||busy} onClick={()=>{pending.current=false;setFile(null);setUrl('');if(fileInput.current)fileInput.current.value='';}}>清除尚未导入的来源选择</Button>{error&&<Alert type="error" title={error}/>} {notice&&<Alert type={notice.complete?'info':'warning'} title={notice.message} description={notice.warnings.join('；')||'正文和图片已核对；请继续预览及保存本课时，不等于发布。'}/>}
 <label>文章标题<Input aria-label="文章标题" value={d.values.article_title||''} maxLength={120} disabled={disabled} onChange={e=>d.patch({article_title:e.target.value})}/></label>
 {blocks.map((b,index)=><section key={b.id} data-testid="article-block" className="authoring-block"><Space wrap><strong>{index+1} · {b.type==='rich'?'导入图文':b.type==='paragraph'?'段落':b.type==='image'?'图片':'附件'}</strong><Button disabled={disabled||!index} onClick={()=>update(list=>{const a=[...list];[a[index-1],a[index]]=[a[index],a[index-1]];return a;})}>上移</Button><Button disabled={disabled} danger onClick={()=>update(list=>list.filter(x=>x.id!==b.id))}>移除引用</Button></Space>{b.type==='rich'?<RichArticle html={b.html} resources={resources} download={download} editable={!disabled} onChange={html=>update(list=>list.map(x=>x.id===b.id?{...x,html}:x))}/>:b.type==='paragraph'?<Input.TextArea aria-label={'文章段落 '+(index+1)} rows={4} maxLength={10000} disabled={disabled} value={b.text} onChange={e=>update(list=>list.map(x=>x.id===b.id?{...x,text:e.target.value}:x))}/>:<><Select aria-label={'文章图片或附件 '+(index+1)} disabled={disabled} style={{width:'100%'}} value={b.resourceId} options={resources.filter(r=>r.lesson_id===lesson.id&&(b.type==='image'?images.includes(r):!images.includes(r))).map(r=>({value:r.id,label:r.title}))} onChange={resourceId=>update(list=>list.map(x=>x.id===b.id?{...x,resourceId}:x))}/><Input aria-label={'图片或附件说明 '+(index+1)} disabled={disabled} value={b.caption} onChange={e=>update(list=>list.map(x=>x.id===b.id?{...x,caption:e.target.value}:x))}/></>}</section>)}
 <Space wrap><Button disabled={disabled} onClick={()=>update(list=>[...list,{id:crypto.randomUUID(),type:'paragraph',text:''}])}>添加文字段落</Button><Button disabled={disabled||!images.length} onClick={()=>update(list=>[...list,{id:crypto.randomUUID(),type:'image',resourceId:images[0].id,title:'',caption:''}])}>添加本站图片</Button></Space></section>;
}
