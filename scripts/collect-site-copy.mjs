// One-time, display-context-only extraction. Never change API values, conditions,
// submitted teaching/student data, SQL, URLs or permission identifiers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {readCopy} from './fortune-copy.mjs';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'frontend/package.json'));
const {parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
const toolOnly=process.argv.includes('--review-tools-only');
if(!toolOnly&&fs.existsSync(path.join(root,'frontend/src/content/systemCopy.js')))throw Error('一次性抽取已完成；请在既有稳定 ID 上维护，禁止重新生成覆盖改稿');
const source=path.join(root,'frontend/src'),copyFile=path.join(source,'content/uiCopy.jsx'),copy={...readCopy(copyFile),...(toolOnly?JSON.parse(fs.readFileSync(path.join(source,'content/systemCopy.js'),'utf8').split('export const systemCopy = ')[1].trim().replace(/;$/,'')):{})},uses=JSON.parse(fs.readFileSync(path.join(root,'docs/experience-patch/site-copy-uses.json'),'utf8')),remainder=[];
const displayKeys=new Set(['label','title','subTitle','eyebrow','description','placeholder','message','content','tooltip','emptyText','okText','cancelText','help','extra','alt','aria-label','ariaLabel','children','text','action','buttonLabel','downloadLabel','notice','reason','hint','nameLabel','prefix','suffix']);
const chinese=s=>/[\u3400-\u9fff]/u.test(s);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.(jsx|js)$/.test(e.name)?[path.join(dir,e.name)]:[]);}
for(const file of files(source)){
 const rel=path.relative(root,file).replaceAll('\\','/');
 if(toolOnly&&!/\/copy-review\/(CopyReview|ReviewInspector)\.jsx$/.test(rel))continue;
 if(/\/content\/|\/visual\/PixelPreview|\/rewards\/demo|\/identity\.js$/.test(rel))continue;
 const code=fs.readFileSync(file,'utf8'),ast=parse(code,{sourceType:'module',plugins:['jsx']}),patches=[];let useTemplate=false,useText=false;
 const add=(p,text,mode)=>{
  if(!chinese(text)||!text.trim())return;
  const func=p.findParent(x=>x.isFunction()),functionName=func?.node.id?.name||func?.parentPath?.node.id?.name||'页面/公共状态';
  const jsx=p.findParent(x=>x.isJSXElement())?.node.openingElement.name;
  const position=jsx?.name||jsx?.property?.name||p.parentPath.node.key?.name||functionName;
  const id='site.'+crypto.createHash('sha256').update(rel+'|'+mode+'|'+text).digest('hex').slice(0,16);
  const optional=mode==='jsx'&&['p','small'].includes(position)&&!/(错误|失败|无权限|演示|不可|不能|请先|未登录)/.test(text);
  copy[id]??={text,enabled:true,optional,page:rel.replace('frontend/src/','').replace(/\.(jsx|js)$/,''),position:functionName+' / '+position,purpose:mode==='template'?'动态模板；保留 {slotN} 占位符':'系统界面文字',scope:'system',type:'system',sourceFile:rel,sourceLine:p.node.loc.start.line,futureTeacher:false};
  uses.push({id,sourceFile:rel,sourceLine:p.node.loc.start.line,region:functionName,position,mode});
  let replacement;
  if(mode==='template'){
   useTemplate=true;replacement='siteTemplate('+JSON.stringify(id)+', {'+p.node.expressions.map((e,i)=>'slot'+i+': ('+code.slice(e.start,e.end)+')').join(', ' )+'})';
  }else{useText=true;replacement='siteText('+JSON.stringify(id)+')';}
  if(mode==='jsx'||p.parentPath.isJSXAttribute())replacement='{'+replacement+'}';
  patches.push({start:p.node.start,end:p.node.end,text:replacement});
 };
 function context(p){
  const parent=p.parentPath;
  if(parent.isConditionalExpression()&&parent.node.test!==p.node)return context(parent);
  if(parent.isLogicalExpression()&&parent.node.right===p.node)return context(parent);
  if(parent.isBinaryExpression()&&parent.node.operator==='+')return context(parent);
  if(parent.isArrayExpression())return context(parent);
  if(parent.isAssignmentPattern())return true;
  if(parent.isJSXAttribute())return displayKeys.has(parent.node.name.name);
  if(parent.isJSXExpressionContainer())return true;
  if(parent.isObjectProperty()&&(displayKeys.has(parent.node.key.name||parent.node.key.value)||p.findParent(x=>x.isVariableDeclarator()&&/(LABEL|TEXT|DESC|OUTCOME|STATUS)/i.test(x.node.id.name||'')))){
   // Data sent to a server and initial form values remain real user/teaching data.
   return !p.findParent(x=>(x.isCallExpression()&&(/^(post|put|patch|setFieldsValue)$/.test(x.node.callee.property?.name||'')))||(x.isJSXAttribute()&&x.node.name.name==='initialValues'));
  }
  if(parent.isCallExpression()){
   const c=parent.node.callee,name=c.name||c.property?.name,obj=c.object?.name;
   return (obj==='message'&&['success','error','warning','info','loading'].includes(name))||['setError','setNotice','setChatError','setAuthReason','setContextError','invalidateSession','setMessage'].includes(name);
  }
  return parent.isNewExpression()&&parent.node.callee.name==='Error';
 }
 traverse(ast,{
  JSXText(p){const text=p.node.value.replace(/\s+/g,' ').trim();add(p,text,'jsx');},
  StringLiteral(p){if(!chinese(p.node.value))return;if(context(p))add(p,p.node.value,'string');else remainder.push({sourceFile:rel,line:p.node.loc.start.line,text:p.node.value,context:p.parentPath.type});},
  TemplateLiteral(p){if(context(p)&&p.node.quasis.some(q=>chinese(q.value.cooked||''))){add(p,p.node.quasis.map((q,i)=>(q.value.cooked||'')+(i<p.node.expressions.length?'{slot'+i+'}':'')).join(''),'template');p.skip();}}
 });
 if(!patches.length)continue;
 patches.sort((a,b)=>b.start-a.start);
 for(let i=1;i<patches.length;i++)if(patches[i].end>patches[i-1].start)throw Error('Overlapping extraction '+rel);
 let result=code;for(const p of patches)result=result.slice(0,p.start)+p.text+result.slice(p.end);
 const imports=[useText?'copyText as siteText':null,useTemplate?'copyTemplate as siteTemplate':null].filter(Boolean);
 let module=path.relative(path.dirname(file),path.join(source,'content/copy')).replaceAll('\\','/');if(!module.startsWith('.'))module='./'+module;
 const existing=result.match(/^import \{([^\n]*siteText[^\n]*)\} from [^\n]+;\r?\n/m);
 if(existing){const merged=[...new Set([...existing[1].split(',').map(s=>s.trim()),...imports])];result=result.replace(existing[0],'import {'+merged.join(', ')+'} from '+JSON.stringify(module)+';\n');}
 else result='import {'+imports.join(', ')+'} from '+JSON.stringify(module)+';\n'+result;
 // Preserve ESLint file-level directives at the beginning.
 result=result.replace(/^(import[^\n]+\n)(\/\* eslint-disable[^\n]+\n)/,'$2$1');
 fs.writeFileSync(file,result);
}
if(toolOnly)fs.writeFileSync(path.join(source,'content/systemCopy.js'),'export const systemCopy = '+JSON.stringify(Object.fromEntries(Object.entries(copy).filter(([id])=>id.startsWith('site.'))),null,2)+';\n');
else fs.writeFileSync(copyFile,'export const uiCopy = '+JSON.stringify(copy,null,2)+';\n');
const out=path.join(root,'docs/experience-patch');fs.writeFileSync(path.join(out,'site-copy-uses.json'),JSON.stringify(uses,null,2));fs.writeFileSync(path.join(out,toolOnly?'review-tool-remainder.json':'copy-semantic-remainder.json'),JSON.stringify(remainder,null,2));
console.log(JSON.stringify({newIds:new Set(uses.map(e=>e.id)).size,uses:uses.length,files:new Set(uses.map(e=>e.sourceFile)).size,untransformedSemanticValues:remainder.length}));
