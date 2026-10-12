import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readCopy} from './fortune-copy.mjs';
import {applyPageEdits,mergePayloads} from './copy-validation.mjs';
export {applyPageEdits,mergePayloads};

export function readReviewHtml(file){
 const root=path.resolve(import.meta.dirname,'..'),python=process.env.PBL_COPY_PYTHON||path.join(root,'.venv/Scripts/python.exe');
 return JSON.parse(execFileSync(python,[path.join(root,'scripts/read-review-html.py'),path.resolve(file)],{encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=process.argv.slice(2).filter(s=>s!=='--apply');if(!files.length)throw Error('用法：node scripts/page-copy.mjs 改稿.json或.html [...更多文件] [--apply]，默认只检查');
 const source=path.resolve(import.meta.dirname,'../frontend/src/content/uiCopy.jsx'),system=path.resolve(import.meta.dirname,'../frontend/src/content/systemCopy.js'),a=readCopy(source),b=JSON.parse(fs.readFileSync(system,'utf8').split('export const systemCopy = ')[1].trim().replace(/;$/,'')),current={...a,...b};
 const payload=mergePayloads(files.map(file=>file.endsWith('.html')?{format:'page-copy-review-v1',edits:readReviewHtml(file).edits}:JSON.parse(fs.readFileSync(file,'utf8'))));
 const {next,issues}=applyPageEdits(current,payload);if(process.argv.includes('--apply')){fs.writeFileSync(source,'export const uiCopy = '+JSON.stringify(Object.fromEntries(Object.keys(a).map(id=>[id,next[id]])),null,2)+';\n');fs.writeFileSync(system,'export const systemCopy = '+JSON.stringify(Object.fromEntries(Object.keys(b).map(id=>[id,next[id]])),null,2)+';\n');}
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),changed:payload.edits.map(e=>e.id),issues},null,2));
}
