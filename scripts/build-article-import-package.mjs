// Uses the user's existing private source. The resulting package is never a public repository asset.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url)),JSZip=require('jszip');
export async function buildArticlePackage(sourceDir){
 const text=fs.readFileSync(path.join(sourceDir,'公众号正文片段.html'),'utf8');
 const records=JSON.parse(fs.readFileSync(path.join(sourceDir,'图片下载记录.json'),'utf8'));
 const zip=new JSZip(),map={};
 for(const r of records){const name=r.file.replaceAll('\\','/');if(!/^images\/image-\d+\.jpg$/.test(name))throw Error('源图片路径无效');zip.file(name,fs.readFileSync(path.join(sourceDir,name)));map[r.source]=name;}
 zip.file('article.html',text);zip.file('image-map.json',JSON.stringify(map,null,2));
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(!args.includes('--source-dir')||!args.includes('--output'))throw Error('用法：node scripts/build-article-import-package.mjs --source-dir <原文与图片目录> --output <私有ZIP路径>');
 const output=path.resolve(get('--output'));if(fs.existsSync(output))throw Error('目标已存在，不覆盖原包');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,await buildArticlePackage(path.resolve(get('--source-dir'))),{flag:'wx'});console.log('已生成私有文章包：'+output);
}
