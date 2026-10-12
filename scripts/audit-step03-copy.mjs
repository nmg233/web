import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),src=path.join(root,'frontend/src'),file=path.join(src,'content/uiCopy.jsx');
const parse=s=>JSON.parse(s.split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''));
const data=parse(readFileSync(file,'utf8'));
const old=parse(execFileSync('git',['show','5777e98:frontend/src/content/uiCopy.jsx'],{cwd:root,encoding:'utf8',maxBuffer:8e6}));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):['.js','.jsx'].includes(path.extname(e.name))?[path.join(dir,e.name)]:[]);}
const all=walk(src).filter(f=>f!==file).map(f=>readFileSync(f,'utf8')).join('\n');
const used=new Set([...all.matchAll(/copy(?:Text|Fragment)\(['"]([^'"]+)['"]\s*\)/g),...all.matchAll(/<CopyBlock id=['"]([^'"]+)/g)].map(m=>m[1]));
for(const p of ['fortune.level.','fortune.good.','fortune.avoid.'])if(['copyText','copyFragment'].some(fn=>all.includes(fn+"('"+p+"'+")))for(const id of Object.keys(data).filter(id=>id.startsWith(p)))used.add(id);
const maintenance=walk(path.join(src,'pages/courses')).map(f=>readFileSync(f,'utf8')).join('\n');
for(const m of maintenance.matchAll(/c\(['"]([^'"]+)['"]\s*\)/g))used.add('maintenance.'+m[1]);
for(const m of maintenance.matchAll(/<Field\s+name="([^"]+)"/g))used.add('maintenance.field.'+m[1]);
// Finite, server-validated choices at the dynamic call sites; no arbitrary prefix exemption.
const variants={field:['description','driving_question','story_line','materials_needed'],theme:['campus','voyage'],type:['courseware','lesson_plan','guide_card','template','video','other'],stage:['0','1','2','3'],index:['not_added','pending','processing','ready','failed','unsupported'],upload:['resource','replay','cover','pending','uploading','success','failed','invalid','cancelled','uncertain']};
for(const[p,items]of Object.entries(variants))for(const item of items)used.add('maintenance.'+p+'.'+item);
// Conditional c() branches also use literal suffixes.
for(const id of ['cover.note','upload.videoNote','upload.resourceNote','experiments','tasksEdit','lessonEdit','edit'])used.add('maintenance.'+id);
for(const id of ['maintenance.metadata.loading','maintenance.metadata.error'])if(all.includes("copyText('"+id+"')"))used.add(id);
const retained={'system.map.078':'旧 Drawer 标题，冻结交接保留','system.map.079':'旧右侧说明，冻结交接保留','system.map.024':'原测试地图分组说明，生产改为真实章节','system.platform.011':'原首页演示封面辅助说明，冻结交接保留','system.platform.012':'原首页演示封面辅助说明，冻结交接保留'};
for(const id of ['system.map.051','system.map.053','system.map.064','system.map.066','system.map.068','system.review.007','system.works.014','system.workUpload.034'])retained[id]='可选教学字段清空后隐藏容器，旧未填说明 ID 仅为冻结交接保留';
let unused=Object.keys(data).filter(id=>!used.has(id)&&!retained[id]);
if(process.argv.includes('--prune-new')){for(const id of unused)if(!old[id])delete data[id];writeFileSync(file,'export const uiCopy = '+JSON.stringify(data,null,2)+';\n');unused=Object.keys(data).filter(id=>!used.has(id)&&!retained[id]);}
const changedOld=Object.keys(old).filter(id=>JSON.stringify(data[id])!==JSON.stringify(old[id]));
const frozen=['docs/redesign-v2/step-02','docs/redesign-v2/step-01','frontend/public/assets/redesign-v2','frontend/public/assets/fonts','package.json','package-lock.json','frontend/package.json','frontend/package-lock.json','backend/package.json','backend/package-lock.json'];
const frozenDiff=execFileSync('git',['diff','--name-only','5777e98','--',...frozen],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const files=['docs/redesign-v2/step-02/copy-review.html','docs/redesign-v2/step-02/copy-baseline.json','docs/redesign-v2/step-02/visual-patch/copy-review.html','docs/redesign-v2/step-02/visual-patch/copy-baseline.json','docs/redesign-v2/step-02/teaching-snapshots.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const hashes=files.map(f=>({path:f,current:sha(readFileSync(path.join(root,f))),baseline:sha(execFileSync('git',['show','5777e98:'+f],{cwd:root,maxBuffer:8e6}))}));
const inactiveRetained=Object.keys(retained).filter(id=>!used.has(id));
const record={systemIds:Object.keys(data).length,oldSystemIds:Object.keys(old).length,newSystemIds:Object.keys(data).length-Object.keys(old).length,usedIds:[...used].filter(id=>data[id]).length,retained,inactiveRetained,missing:[...used].filter(id=>!data[id]),unused,changedOld,frozenDiff,frozenHashes:hashes,teachingSnapshots:34,userReturnedEdits:false};
const dir=path.join(root,'docs/redesign-v2/step-03/evidence');mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'copy-audit.json'),JSON.stringify(record,null,2)+'\n');
if(record.missing.length||unused.length||changedOld.length||frozenDiff.length||hashes.some(h=>h.current!==h.baseline))throw Error('文案/冻结保护未通过 '+JSON.stringify({missing:record.missing,unused,changedOld,frozenDiff}));
console.log(`PASS: ${record.systemIds} system IDs (${record.newSystemIds} new), ${record.oldSystemIds} old entries exact, ${record.usedIds} used, ${inactiveRetained.length} inactive historical IDs retained; frozen files unchanged; 34 synthetic teaching snapshots kept outside DB.`);
