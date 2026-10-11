// 本次迁移工具：固定 ID 留在源码；后续不要用新默认文案覆盖人工修改。
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'frontend/package.json')),{parse}=require('espree');
const copyFile=path.join(root,'frontend/src/content/uiCopy.jsx');
const entries=JSON.parse(readFileSync(copyFile,'utf8').split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''));
if(entries['system.platform.001'])throw Error('文案已完成集中迁移；稳定 ID 与人工改稿不得再次自动覆盖。');
const files=[
 ['platform','student/ExploreHome.jsx'],['me','student/space/Personal.jsx'],['shell','student/visual/StudentShell.jsx'],
 ['map','student/Explore.jsx'],['learning','pages/learning/LessonLearn.jsx'],['workUpload','pages/works/Upload.jsx'],
 ['works','student/StudentWorks.jsx'],['workDetail','student/StudentWorkDetail.jsx'],['lab','student/Lab.jsx'],
 ['flight','student/StudentGliderWorkspace.jsx'],['archive','student/StudentArchive.jsx'],['reports','student/ArchiveReports.jsx'],
 ['records','student/ArchiveRecords.jsx'],['reflection','pages/archives/Reflection.jsx'],['review','student/CourseReview.jsx'],
 ['tasks','student/StudentTasks.jsx'],['avatar','student/space/AvatarPreference.jsx'],['robot','student/space/FloatingAssistant.jsx'],['assistant','student/StudentAssistant.jsx'],
];
for(const [page,relative]of files){
 const file=path.join(root,'frontend/src',relative),source=readFileSync(file,'utf8');
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true},range:true,loc:true});
 const edits=[];let count=0,blocks=false;
 const register=(text,node,optional,position)=>{
  let id;do{id=`system.${page}.${String(++count).padStart(3,'0')}`;}while(entries[id]);
  entries[id]={text,enabled:true,optional,page,position,purpose:position,scope:'system',type:'system',sourceField:null,futureTeacher:false,sourceFile:'frontend/src/'+relative,sourceLine:node.loc.start.line};
  return id;
 };
 const chinese=value=>typeof value==='string'&&/[\u3400-\u9fff]/.test(value)&&!value.includes('\n');
 function walk(node,parent){
  if(!node||typeof node!=='object')return;
  if(node.type==='JSXElement'){
   const name=node.openingElement.name.name,children=node.children.filter(n=>n.type!=='JSXText'||n.value.trim());
   if(['p','small'].includes(name)&&children.length===1&&children[0].type==='JSXText'&&chinese(children[0].value.trim())){
    const text=children[0].value.trim(),id=register(text,node,true,`${name} 说明文字`);
    const attrs=node.openingElement.attributes.map(a=>source.slice(...a.range)).join(' ');
    edits.push({start:node.range[0],end:node.range[1],text:`<CopyBlock id="${id}" as="${name}" ${attrs}/>`});blocks=true;return;
   }
  }
  if(node.type==='JSXText'&&chinese(node.value.trim())){
   const text=node.value.trim();if(!text)return;
   const id=register(text,node,false,parent?.openingElement?.name?.name||'组件文字');
   edits.push({start:node.range[0],end:node.range[1],text:`{copyText('${id}')}`});return;
  }
  if(node.type==='Literal'&&chinese(node.value)){
   if(parent?.type==='JSXAttribute'&&!['title','description','placeholder','label','extra','aria-label'].includes(parent.name.name))return;
   if(parent?.type==='Property'&&parent.key===node&&!parent.computed)return;
   const optional=parent?.type==='JSXAttribute'&&['description','placeholder','extra'].includes(parent.name.name);
   const id=register(node.value,node,Boolean(optional),parent?.type==='JSXAttribute'?parent.name.name:'组件状态/标签');
   edits.push({start:node.range[0],end:node.range[1],text:parent?.type==='JSXAttribute'?`{copyText('${id}')}`:`copyText('${id}')`});return;
  }
  for(const [key,value]of Object.entries(node)){if(['loc','range'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>walk(child,node));else if(value&&typeof value==='object')walk(value,node);}
 }
 walk(tree,null);
 if(edits.length){let result=source;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);
  const depth=relative.split('/').length-1,content='../'.repeat(depth)+'content/';
  result=`import {copyText} from '${content}copy';\n${blocks?`import CopyBlock from '${content}CopyBlock';\n`:''}`+result;
  // 已有公共 copy 引用不重复声明。
  const lines=result.split('\n'),seen=new Set();result=lines.filter(line=>{if(!/^import .* (copyText|CopyBlock)/.test(line)&&!/^import (\{ ?copyText ?\}|CopyBlock)/.test(line))return true;const key=line.includes('copyText')?'copyText':'CopyBlock';if(seen.has(key))return false;seen.add(key);return true;}).join('\n');
  writeFileSync(file,result);
 }
}
writeFileSync(copyFile,'// 人工修改来源：纯文本、稳定 ID、显式可见性。可选条目空字符串不会补默认。\nexport const uiCopy = '+JSON.stringify(entries,null,2)+';\n');
console.log(Object.keys(entries).length,'stable copy IDs');
