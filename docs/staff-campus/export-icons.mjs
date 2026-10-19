import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(import.meta.dirname,'art/icons');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'frontend/src/components/StaffPixelIcon.jsx'),'utf8');
const colors={ink:'#132a49',paper:'#fbf6e8',teal:'#087f80',light:'#baf6ff',gold:'#ffd276'},icons=[];
for(const match of source.matchAll(/^  (\w+): <>([\s\S]*?)<\/>,/gm)){
 const name=match[1],body=match[2].replace(/\{(ink|paper|teal|light|gold)\}/g,(_,key)=>`"${colors[key]}"`).replace(/strokeWidth=/g,'stroke-width=');
 if(/[{}]/.test(body))throw Error('Unconverted JSX in '+name);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72" shape-rendering="crispEdges">${body}</svg>`;
 fs.writeFileSync(path.join(out,name+'.svg'),svg);icons.push({name,file:'art/icons/'+name+'.svg',sha256:crypto.createHash('sha256').update(svg).digest('hex')});
}
if(icons.length!==17)throw Error('Expected 17 original glyphs, received '+icons.length);
fs.writeFileSync(path.join(import.meta.dirname,'icon-manifest.json'),JSON.stringify({source:'frontend/src/components/StaffPixelIcon.jsx',grid:'24x24',count:icons.length,kind:'original native SVG, no model/image generation',icons},null,2)+'\n');
fs.writeFileSync(path.join(import.meta.dirname,'icons.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理端17枚原生像素图标</title><style>body{font:18px/1.8 system-ui;background:#fbf6e8;color:#132a49;margin:24px}main{max-width:1100px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px}figure{margin:0;padding:20px;border:2px solid #32566e;background:#fffbed;box-shadow:3px 3px #bbc7bc}img{display:block;width:72px;height:72px;image-rendering:pixelated}figcaption{margin-top:12px}</style><main><h1>管理端17枚原生像素图标</h1><p>24×24逻辑格，代码原生SVG。图标为装饰，不添加按钮或替换文字。功能状态图标保留原语义。</p><p><a href="index.html">返回验收入口</a> · <a href="art/index.html">横竖场景与母版</a></p><div class="grid">${icons.map(x=>`<figure><img src="${x.file}" alt="${x.name}"><figcaption>${x.name}</figcaption></figure>`).join('')}</div></main></html>`);
console.log(JSON.stringify({icons:icons.length,preview:'docs/staff-campus/icons.html'}));
