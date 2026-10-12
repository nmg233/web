import fs from 'node:fs';import path from 'node:path';import {readCopy} from './fortune-copy.mjs';import {applyPageEdits} from './copy-validation.mjs';
const source=path.resolve(import.meta.dirname,'../frontend/src/content/uiCopy.jsx'),pool=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../shared/fortunePool.json'))),current=readCopy(source),file=process.argv[2];
if(!file)throw Error('node scripts/fortune-library.mjs 词库.json [--export|--apply]；默认校验变化项');
if(process.argv.includes('--export')){
 if(fs.existsSync(file))throw Error('保留已有纯文字改稿文件，请另存新路径');
 fs.writeFileSync(file,JSON.stringify({format:'fortune-library-v1',good:pool.good.map(id=>({id,text:current[id].text,baseText:current[id].text,baseEnabled:current[id].enabled})),avoid:pool.avoid.map(id=>({id,text:current[id].text,baseText:current[id].text,baseEnabled:current[id].enabled}))},null,2));
 console.log('已导出真实受控词库；只改 text，新建议替换一个现有位置，ID 保持稳定');
}else{
 const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.format!=='fortune-library-v1')throw Error('不支持的纯文字词库格式');const entries=[],seen=new Set();
 for(const type of['good','avoid']){if(!Array.isArray(data[type])||data[type].length!==30)throw Error('宜、忌各保持30条');for(const e of data[type]){if(!e||!pool[type].includes(e.id)||seen.has(e.id)||Object.keys(e).some(k=>!['id','text','baseText','baseEnabled'].includes(k))||typeof e.text!=='string')throw Error('词库 ID/范围无效');if(e.baseText!==current[e.id].text||e.baseEnabled!==current[e.id].enabled)throw Error('词库基线冲突：'+e.id);if(e.text!==e.baseText)entries.push({...e,enabled:true});seen.add(e.id);}}
 const payload={format:'fortune-review-v1',edits:entries},result=applyPageEdits(current,payload);if(process.argv.includes('--apply'))fs.writeFileSync(source,'export const uiCopy = '+JSON.stringify(result.next,null,2)+';\n');console.log(JSON.stringify({applied:process.argv.includes('--apply'),changed:entries.map(e=>e.id),issues:result.issues}));
}
