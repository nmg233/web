import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function probeFrontend(root,address){
 const base=new URL(address),index=fs.readFileSync(path.join(root,'index.html'));
 if(!['http:','https:'].includes(base.protocol))throw Error('前端探测必须使用 HTTP(S)');
 const read=async(url,expected)=>{
  url=new URL(url);url.searchParams.set('_release_probe',crypto.randomUUID());
  const res=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
  if(!res.ok)throw Error(`前端探测失败：${url.pathname} HTTP ${res.status}`);
  if(digest(Buffer.from(await res.arrayBuffer()))!==digest(expected))throw Error(`前端版本或静态资源不匹配：${url.pathname}`);
 };
 await read(base,index);
 const assets=[...index.toString('utf8').matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(m=>new URL(m[1],base));
 if(!assets.some(a=>a.pathname.endsWith('.js')))throw Error('构建首页未引用 JS，不能确认前端可运行');
 for(const url of assets){
  if(url.origin!==base.origin)throw Error('构建资源必须来自本站，不能验证外部资源');
  const relative=decodeURIComponent(url.pathname.startsWith(base.pathname)?url.pathname.slice(base.pathname.length):url.pathname.replace(/^\//,''));
  const target=path.resolve(root,relative),within=path.relative(path.resolve(root),target);
  if(!within||within.startsWith('..')||path.isAbsolute(within))throw Error('静态资源路径超出构建目录');
  await read(url,fs.readFileSync(target));
 }
 return {verified:true,assets:assets.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await probeFrontend(process.argv[2],process.argv[3])));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
