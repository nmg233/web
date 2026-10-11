// The remainder from the first display-context pass is reviewed here. Business
// comparison tokens, CSV round-trip headers, submitted enum values and fixed
// character identities are catalogued read-only, never rewritten as UI labels.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'frontend/package.json')),{parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
const file=path.join(root,'frontend/src/content/systemCopy.js'),copy=JSON.parse(fs.readFileSync(file,'utf8').split('export const systemCopy = ')[1].trim().replace(/;$/,'')),usesFile=path.join(root,'docs/experience-patch/site-copy-uses.json'),uses=JSON.parse(fs.readFileSync(usesFile)),remaining=JSON.parse(fs.readFileSync(path.join(root,'docs/experience-patch/copy-semantic-remainder.json'))),decisions=[];
for(const sourceFile of new Set(remaining.map(e=>e.sourceFile))){
 const input=path.join(root,sourceFile),code=fs.readFileSync(input,'utf8'),values=new Set(remaining.filter(e=>e.sourceFile===sourceFile).map(e=>e.text)),ast=parse(code,{sourceType:'module',plugins:['jsx']}),patches=[];
 traverse(ast,{StringLiteral(p){
  const text=p.node.value;if(!values.has(text)||!/[\u3400-\u9fff]/.test(text))return;
  let reason='';const parent=p.parentPath,c=parent.node.callee,name=c?.property?.name||c?.name;
  if(/space\/avatars\.js$/.test(sourceFile))reason='既定角色姓名/形象设定，保留身份定义';
  if(/utils\/accountExport\.js$/.test(sourceFile)||(/pages\/students\/List/.test(sourceFile)&&(/csv|登录账号,姓名|BJFX-|M-0001|T-BJFX/.test(text))))reason='CSV身份导入/导出协议与文件名，不能作为任意系统文案修改';
  if(parent.isBinaryExpression()&&parent.node.operator!=='+')reason='业务比较或权限错误分类匹配词';
  if((parent.isCallExpression()||parent.isOptionalCallExpression())&&['includes','replace','replaceAll','startsWith','endsWith','join','indexOf','split','exportCsv','downloadCSV'].includes(name))reason='业务匹配/替换或导出协议片段';
  if(parent.isArrayExpression()&&(/pages\/(archives\/Index|works\/Detail)\.jsx$|student\/archiveModel\.js$/.test(sourceFile)))reason='原能力评价维度协议，同时作为对象键，保留原字段';
  if(parent.isArrayExpression()&&/pages\/courses\/Detail/.test(sourceFile))reason='原活动类型取值，不能通过改文案改变提交枚举';
  if(parent.isObjectProperty()&&(parent.node.key.name||parent.node.key.value)==='value')reason='提交或筛选的真实业务值';
  if(reason){decisions.push({sourceFile,line:p.node.loc.start.line,text,editable:false,reason});return;}
  const id='site.'+createHash('sha256').update(sourceFile+'|remaining|'+text).digest('hex').slice(0,16),func=p.findParent(x=>x.isFunction()),region=func?.node.id?.name||'显示映射/状态';
  copy[id]??={text,enabled:true,optional:false,page:sourceFile.replace('frontend/src/','').replace(/\.(jsx|js)$/,''),position:region,purpose:'系统固定状态或显示映射；业务值另存',scope:'system',type:'system',sourceFile,sourceLine:p.node.loc.start.line,futureTeacher:false};uses.push({id,sourceFile,sourceLine:p.node.loc.start.line,region,position:region,mode:'remaining-display'});
  const expr='siteText('+JSON.stringify(id)+')';patches.push({start:p.node.start,end:p.node.end,text:parent.isJSXAttribute()?'{'+expr+'}':expr});decisions.push({sourceFile,line:p.node.loc.start.line,text,editable:true,id});
 }});
 if(!patches.length)continue;let result=code;for(const p of patches.sort((a,b)=>b.start-a.start))result=result.slice(0,p.start)+p.text+result.slice(p.end);
 if(!/import \{[^\n]*copyText as siteText/.test(result)){let module=path.relative(path.dirname(input),path.join(root,'frontend/src/content',sourceFile.endsWith('.js')?'systemText.js':'copy')).replaceAll('\\','/');if(!module.startsWith('.'))module='./'+module;result='import {copyText as siteText} from '+JSON.stringify(module)+';\n'+result;result=result.replace(/^(import[^\n]+\n)(\/\* eslint-disable[^\n]+\n)/,'$2$1');}
 fs.writeFileSync(input,result);
}
fs.writeFileSync(file,'export const systemCopy = '+JSON.stringify(copy,null,2)+';\n');fs.writeFileSync(usesFile,JSON.stringify(uses,null,2));fs.writeFileSync(path.join(root,'docs/experience-patch/copy-remainder-decisions.json'),JSON.stringify(decisions,null,2));console.log(JSON.stringify({reviewed:decisions.length,editable:decisions.filter(e=>e.editable).length,readOnly:decisions.filter(e=>!e.editable).length}));
