import {uiCopy} from '../content/uiCopy.jsx';
import {systemCopy} from '../content/systemCopy.js';
export const reviewCopy={...uiCopy,...systemCopy};
export function changedEdits(draft){return Object.entries(draft).filter(([id,e])=>Object.hasOwn(reviewCopy,id)&&(e.text!==reviewCopy[id].text||e.enabled!==reviewCopy[id].enabled)).map(([id,e])=>({id,text:e.text,enabled:e.enabled,baseText:reviewCopy[id].text,baseEnabled:reviewCopy[id].enabled}));}
export function storeReviewDraft(accountId,draft){
 const edits=changedEdits(draft);localStorage.setItem('pbl-copy-review:'+accountId,JSON.stringify({format:'page-copy-review-v1',accountId,edits}));
}
export function restoreReviewDraft(accountId){
 const value=JSON.parse(localStorage.getItem('pbl-copy-review:'+accountId)||'null');if(!value)return {};
 if(value.format!=='page-copy-review-v1'||String(value.accountId)!==String(accountId)||!Array.isArray(value.edits))throw Error('草稿范围无效');
 const draft={},seen=new Set();for(const e of value.edits){if(!Object.hasOwn(reviewCopy,e.id)||seen.has(e.id)||typeof e.text!=='string'||e.text.length>10000||typeof e.enabled!=='boolean')throw Error('草稿无效');if(e.baseText!==reviewCopy[e.id].text||e.baseEnabled!==reviewCopy[e.id].enabled)throw Error('文案基线已变化');draft[e.id]={text:e.text,enabled:e.enabled};seen.add(e.id);}return draft;
}
export function downloadDraft(draft,name='页面文案改稿.json'){
 const url=URL.createObjectURL(new Blob([JSON.stringify({format:'page-copy-review-v1',edits:changedEdits(draft)},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
