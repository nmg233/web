// Explicit source list: never rewrites teaching data or existing manual copy.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'frontend/package.json')),{parse}=require('@babel/parser');
const files=['mentor/WorkspaceDashboard','mentor/SchoolAccounts','mentor/Organization','mentor/TeachingHub','mentor/Guide','courses/SchoolScope','mentor/ApplicationInbox','mentor/ApplicationThread','mentor/CourseFeedback','feedback/ReceptionControls','feedback/Form','feedback/Detail'];
const target=path.join(root,'content/mentor-workspace/copy.json');fs.mkdirSync(path.dirname(target),{recursive:true});
const catalog=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{version:1,entries:{}};
for(const short of files){
 const file=path.join(root,'frontend/src/pages',short+'.jsx'),source=fs.readFileSync(file,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']}),replacements=[];
 const visit=(node,parent)=>{
  if(!node||typeof node!=='object')return;
  const raw=node.type==='JSXText'?node.value.replace(/\s+/g,' ').trim():node.type==='StringLiteral'?node.value:null;
  if(raw&&/[\u3400-\u9fff]/.test(raw)){
   const id=short.replaceAll('/','.')+'.'+crypto.createHash('sha256').update(raw).digest('hex').slice(0,12);
   catalog.entries[id]??={text:raw,page:short,source:'frontend/src/pages/'+short+'.jsx'};
   const call=`mentorText(${JSON.stringify(id)})`;
   replacements.push({start:node.start,end:node.end,value:node.type==='JSXText'||parent?.type==='JSXAttribute'?'{'+call+'}':call});return;
  }
  for(const[key,value]of Object.entries(node))if(!['loc','extra','comments'].includes(key)){if(Array.isArray(value))value.forEach(child=>visit(child,node));else if(value&&typeof value==='object')visit(value,node);}
 };
 visit(ast,null);if(!replacements.length)continue;
 let result=source;for(const r of replacements.sort((a,b)=>b.start-a.start))result=result.slice(0,r.start)+r.value+result.slice(r.end);
 const from=short.startsWith('mentor/')?'./workspaceCopy':'../mentor/workspaceCopy';if(!source.includes('import {mentorText}'))result=`import {mentorText} from '${from}';\n`+result;fs.writeFileSync(file,result);
}
fs.writeFileSync(target,JSON.stringify(catalog,null,2)+'\n');console.log('导师系统文案条目 '+Object.keys(catalog.entries).length+'，未读取或改写教学数据库。');
