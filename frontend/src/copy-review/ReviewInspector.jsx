import {copyText as siteText} from "../content/copy";
import {useEffect,useState} from 'react';
import {Button,Modal,Input,Select} from 'antd';
import {Link} from 'react-router-dom';
import {useAuth} from '../store/AuthContext';
import {visibleText} from '../content/visibleText';
import {reviewCopy,downloadDraft,changedEdits} from './reviewData';
import './review.css';
export default function ReviewInspector(){
 const {user}=useAuth(),[active,setActive]=useState(false),[ids,setIds]=useState([]),[id,setId]=useState(''),[text,setText]=useState(''),[draft,setDraft]=useState({});
 useEffect(()=>{
  if(!active||user?.role!=='admin')return;
  const click=e=>{
   if(e.target.closest('.copy-review-toolbar,.ant-modal,.copy-review'))return;
   const explicit=e.target.closest('[data-copy-id]')?.dataset.copyId;
   const label=(e.target.textContent||'').trim();
   const found=explicit&&Object.hasOwn(reviewCopy,explicit)?[explicit]:Object.keys(reviewCopy).filter(key=>visibleText(reviewCopy[key]).trim()===label&&label);
   if(!found.length)return;
   e.preventDefault();e.stopPropagation();setIds(found);setId(found[0]);setText((draft[found[0]]||reviewCopy[found[0]]).text);
  };
  document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);
 },[active,draft,user?.role]);
 if(user?.role!=='admin')return null;
 return <><aside className="copy-review-toolbar" aria-label={siteText("site.f8ae35e7be64a171")}><Button size="small" onClick={()=>setActive(v=>!v)}>{active?siteText("site.7e4a0697539a5922"):siteText("site.7d74844c913a8fc7")}</Button><Link to="/copy-review">{siteText("site.96f59b57740aac6a")}</Link>{active&&<><span>{siteText("site.e96bc6fd6449f0ac")}</span><Button size="small" onClick={()=>downloadDraft(draft)}>{siteText("site.afa9f1548dc0c66a")}{changedEdits(draft).length}{siteText("site.77254a5540f656fd")}</Button></>}</aside><Modal open={!!ids.length} title={siteText("site.ff4785ff6c717692")} onCancel={()=>setIds([])} onOk={()=>{setDraft(d=>({...d,[id]:{text,enabled:reviewCopy[id].enabled}}));setIds([]);}} okText={siteText("site.6872b1dcf8de0db5")} cancelText={siteText("site.22cdd32cea0d2ab0")}><p>{siteText("site.803e1567e8afc5e3")}</p><Select style={{width:'100%'}} value={id} onChange={key=>{setId(key);setText((draft[key]||reviewCopy[key]).text);}} options={ids.map(key=>({value:key,label:key+' / '+reviewCopy[key].position}))}/><Input.TextArea aria-label={siteText("site.fd156cba977ec3df")} value={text} rows={4} onChange={e=>setText(e.target.value)}/></Modal></>;
}
