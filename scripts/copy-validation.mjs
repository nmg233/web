export function applyPageEdits(current,payload){
 if(!['page-copy-review-v1','fortune-review-v1'].includes(payload?.format)||!Array.isArray(payload.edits))throw Error('不支持的文案改稿格式');
 const next=structuredClone(current),seen=new Set(),issues=[];
 for(const e of payload.edits){
  if(!e||typeof e.id!=='string'||!Object.hasOwn(current,e.id)||seen.has(e.id)||(payload.format==='fortune-review-v1'&&!e.id.startsWith('fortune.')))throw Error('非法或重复文案 ID');
  if(Object.keys(e).some(k=>!['id','text','enabled','baseText','baseEnabled'].includes(k))||typeof e.text!=='string'||typeof e.enabled!=='boolean'||e.text.length>10000)throw Error('非法改稿字段');
  if(e.baseText!==current[e.id].text||e.baseEnabled!==current[e.id].enabled)throw Error('基线冲突：'+e.id);
  const slots=s=>[...new Set(s.match(/\{slot\d+\}/g)||[])].sort().join('|');
  if(slots(e.text)!==slots(e.baseText))throw Error('动态占位符必须保留：'+e.id);
  if(!current[e.id].optional&&(!e.text.trim()||!e.enabled))issues.push({id:e.id,reason:'必要动作、权限或失败/演示状态不能清空；其他修改可应用'});
  else next[e.id]={...current[e.id],text:e.text,enabled:e.enabled};
  seen.add(e.id);
 }
 for(const prefix of ['fortune.good.','fortune.avoid.']){
  const texts=new Set();for(const [id,e]of Object.entries(next).filter(([id])=>id.startsWith(prefix))){const text=displayText(e.text).trim().replace(/\s+/g,' ');if(!e.enabled||!text||texts.has(text))throw Error('运势候选关闭、为空或实际显示重复：'+id);texts.add(text);}
  if(texts.size!==30)throw Error('运势候选必须各为30条');
 }
 return {next,issues};
}
export function mergePayloads(payloads){
 const edits=new Map();for(const p of payloads){if(!['page-copy-review-v1','fortune-review-v1'].includes(p?.format)||!Array.isArray(p.edits))throw Error('非法改稿格式');for(const e of p.edits){if(edits.has(e.id)){if(JSON.stringify(edits.get(e.id))!==JSON.stringify(e))throw Error('多文件公共 ID 冲突：'+e.id);}else edits.set(e.id,e);}}
 return {format:'page-copy-review-v1',edits:[...edits.values()]};
}
import {displayText} from '../frontend/src/content/displayText.js';
