import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'frontend/src'),file=path.join(source,'content/uiCopy.jsx');
const data=JSON.parse(readFileSync(file,'utf8').split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):['.js','.jsx'].includes(path.extname(e.name))?[path.join(dir,e.name)]:[]);}
const all=walk(source).filter(f=>f!==file).map(f=>readFileSync(f,'utf8')).join('\n');
const used=new Set([...all.matchAll(/copy(?:Text|Fragment)\(['"]([^'"]+)['"]\s*\)/g),...all.matchAll(/<CopyBlock id=['"]([^'"]+)/g)].map(m=>m[1]));
const dynamicPrefixes=['fortune.level.','fortune.good.','fortune.avoid.'];
for(const prefix of dynamicPrefixes)if(['copyText','copyFragment'].some(fn=>all.includes(fn+"('"+prefix+"'+")))for(const id of Object.keys(data).filter(id=>id.startsWith(prefix)))used.add(id);
const retained=['system.map.078','system.map.079']; // Old Drawer/aside IDs stay in frozen handoff, replaced by one dialog.
const record={systemIds:Object.keys(data).length,usedIds:used.size,retainedIds:retained,missing:[...used].filter(id=>!data[id]),unused:Object.keys(data).filter(id=>!used.has(id)&&!retained.includes(id)),teachingSnapshots:JSON.parse(readFileSync(path.join(root,'docs/redesign-v2/step-02/teaching-snapshots.json'),'utf8')).length};
writeFileSync(path.resolve(root,process.argv[2]||'docs/redesign-v2/step-02/evidence/copy-id-audit.json'),JSON.stringify(record,null,2)+'\n');
if(record.missing.length||record.unused.length)throw Error('文案 ID 接入不一致 '+JSON.stringify(record));console.log(`${record.usedIds} 个现用 UI ID，${record.retainedIds.length} 个旧布局 ID 保留，${record.teachingSnapshots} 个教学来源快照独立；没有缺失或未登记的闲置项。`);
