import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {readCopy} from './fortune-copy.mjs';
export const format='step03-review-v1';
export function applyStep03Edits(current,payload){
 if(payload?.format!==format||!Array.isArray(payload.edits))throw Error('不是第三步改稿格式');const next=structuredClone(current),seen=new Set();
 for(const e of payload.edits){if(!e||typeof e.id!=='string'||!e.id.startsWith('next3.')||!current[e.id]||seen.has(e.id))throw Error('非法或重复的第三步文案 ID');if(Object.keys(e).some(k=>!['id','text','enabled','baseText','baseEnabled'].includes(k))||typeof e.text!=='string'||typeof e.enabled!=='boolean'||e.text.length>10000)throw Error('非法改稿字段');if(current[e.id].text!==e.baseText||current[e.id].enabled!==e.baseEnabled)throw Error('文案已变化，请重新核对：'+e.id);if(!current[e.id].optional&&(!e.enabled||!e.text.trim()))throw Error('必要状态不能关闭或清空：'+e.id);next[e.id]={...current[e.id],text:e.text,enabled:e.enabled};seen.add(e.id);}
 return next;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=path.resolve(import.meta.dirname,'../frontend/src/content/uiCopy.jsx'),file=process.argv[2];if(!file)throw Error('用法：node scripts/next-step03-copy.mjs 改稿.json [--apply]；默认只检查');const current=readCopy(source),payload=JSON.parse(fs.readFileSync(file,'utf8')),next=applyStep03Edits(current,payload);console.log(JSON.stringify({changed:payload.edits.map(e=>e.id),applied:process.argv.includes('--apply')}));if(process.argv.includes('--apply'))fs.writeFileSync(source,'export const uiCopy = '+JSON.stringify(next,null,2)+';\n');
}
