import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),legacy=path.join(root,'docs/redesign-v2/step-02'),dir=path.resolve(root,process.argv[2]||'docs/redesign-v2/step-02');
const file=path.join(root,'frontend/src/content/uiCopy.jsx');
const copy=JSON.parse(readFileSync(file,'utf8').split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''));
const snapshots=existsSync(path.join(legacy,'teaching-snapshots.json'))?JSON.parse(readFileSync(path.join(legacy,'teaching-snapshots.json'),'utf8')):[];
const entries={...copy,...Object.fromEntries(snapshots.map(e=>[e.id,e]))};
const sourceHref=path.relative(dir,file).replaceAll('\\','/'),guideHref=path.relative(dir,path.join(legacy,'copy-edit-guide.md')).replaceAll('\\','/');
const archivePreview=existsSync(path.join(dir,'screenshots/archive-1440.png'))?'screenshots/archive-1440.png':'regression-screenshots/archive-1440.png';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
// 初次生成后，基线与人工 HTML 不可被无条件重建。
if(existsSync(path.join(dir,'copy-review.html')))throw new Error('文案预览已存在，保留人工修改；请先提取并核对差异。');
writeFileSync(path.join(dir,'copy-baseline.json'),JSON.stringify(entries,null,2)+'\n');
const cards=Object.entries(entries).map(([id,e])=>`<article class="copy-entry" data-entry-id="${escape(id)}" data-page="${escape(e.page)}">
<header><strong>${escape(e.page)} / ${escape(e.position)}</strong><code>${escape(id)}</code></header>
<p class="meta">用途：${escape(e.purpose)} · 类型：${e.scope==='system'?'系统固定文案':'教学来源快照与建议'} · ${e.optional?'可选，可删除或留空':'必要操作/状态，保留可见'} · 第三步维护者填写：${e.futureTeacher?'是':'否'}</p>
<p class="meta">来源：${escape(e.sourceField||'前端系统文案')} ${escape(e.sourceFile||'')}${e.sourceLine?' : '+e.sourceLine:''} ${e.courseId?'· courseId='+e.courseId:''}${e.objectId?' · objectId='+e.objectId:''}</p>
${e.scope!=='system'?`<details><summary>只读来源快照（合成测试材料）</summary><pre>${escape(e.snapshot??e.text)}</pre></details>`:''}
<label class="copy-label">${e.scope==='system'?'当前文案':'建议改稿，不修改真实课程'}<textarea data-copy-id="${escape(id)}" rows="2">${escape(e.text)}</textarea></label>
<label><input type="checkbox" data-enabled-id="${escape(id)}" ${e.enabled!==false?'checked':''} ${!e.optional?'disabled':''}> 显示此文案</label>
</article>`).join('\n');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第二步 · 文案人工审阅</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf2f6;color:#183552;font:16px/1.7 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1200px;margin:auto;padding:28px}h1{font-size:29px}a{color:#245e9a}.toolbar{position:sticky;top:0;background:#fff7e3;border:2px solid #849cb8;padding:12px;display:flex;flex-wrap:wrap;gap:12px;z-index:2}button,input,select,textarea{font:inherit}button{cursor:pointer;padding:6px 12px;background:#fff;border:1px solid #7190b0;color:inherit}.copy-entry{margin:20px 0;background:white;border:1px solid #a8bacd;padding:18px}.copy-entry header{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between}code{font-size:13px;color:#67511d}.meta{font-size:13px;color:#526a80;margin:6px 0}.copy-label{display:block;font-size:14px;margin:10px 0}textarea{display:block;width:100%;min-height:70px;margin-top:6px;padding:10px;border:1px solid #9cb2c9;line-height:1.7;color:#193555;background:#fffdf4}pre{white-space:pre-wrap;overflow-wrap:anywhere}.copy-entry:has(input:not(:checked)) textarea{background:#edf0f3;color:#697887}figure{display:inline-block;width:30%;margin:1%}figure img{width:100%}figcaption{font-size:13px}#notice{min-height:26px}
@media(max-width:600px){main{padding:16px}figure{width:46%}.copy-entry{padding:12px}}
</style></head><body><main><h1>第二步 · 可人工修改的文案</h1>
<p>修改来源：<a href="${sourceHref}">uiCopy.jsx</a>。也可以直接在此 HTML 编辑文字、关闭可选小字。两份都修改且结果不同时，会列出冲突，第三步不会自动选择一份覆盖。教学条目是测试 API 来源快照和建议改稿，本页不会保存到业务数据库。</p>
<p><a href="${guideHref}">简短编辑说明</a> · <a href="index.html">页面截图与定位</a> · <a href="copy-baseline.json">稳定 ID 基线</a></p>
<details><summary>真实页面位置预览</summary><figure><img src="screenshots/learning-1440.png" alt="课时学习真实截图"><figcaption>学习：顶部标题、阶段列、正文与操作</figcaption></figure><figure><img src="screenshots/chat-390.png" alt="手机聊天真实截图"><figcaption>机器人：标题、记录、输入说明</figcaption></figure><figure><img src="${archivePreview}" alt="档案真实截图"><figcaption>档案：概览、标签页、反馈</figcaption></figure></details>
<div class="toolbar"><label>筛选 <input id="search" placeholder="页面、ID或当前文案"></label><button id="save-html">保存已修改 HTML</button><button id="export">导出文案修改 JSON</button><span>${Object.keys(entries).length} 个稳定 ID</span></div><p id="notice" role="status">修改后点击保存；浏览器下载文件会出现在你的下载目录。</p>
<section id="entries">${cards}</section></main><script>
const originalIds=new Set([...document.querySelectorAll('[data-copy-id]')].map(e=>e.dataset.copyId));
function edits(){return [...document.querySelectorAll('[data-copy-id]')].filter(e=>originalIds.has(e.dataset.copyId)).map(e=>({id:e.dataset.copyId,text:e.value,enabled:document.querySelector('[data-enabled-id="'+e.dataset.copyId+'"]').checked}));}
function download(name,type,text){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('notice').textContent='已下载 '+name+'；请保留文件并交回。尚未写入网站或课程数据库。';}
document.getElementById('export').onclick=()=>download('step-02-copy-edits.json','application/json',JSON.stringify({version:1,edits:edits()},null,2));
document.getElementById('save-html').onclick=()=>{const clone=document.documentElement.cloneNode(true);for(const e of edits()){clone.querySelector('[data-copy-id="'+e.id+'"]').textContent=e.text;const checkbox=clone.querySelector('[data-enabled-id="'+e.id+'"]');if(e.enabled)checkbox.setAttribute('checked','');else checkbox.removeAttribute('checked');}for(const a of clone.querySelectorAll('.copy-entry'))a.hidden=false;clone.querySelector('#search').setAttribute('value','');download('copy-review-edited.html','text/html','<!doctype html>\\n'+clone.outerHTML);};
document.getElementById('search').oninput=e=>{const q=e.target.value.toLowerCase();for(const a of document.querySelectorAll('.copy-entry'))a.hidden=!(a.innerText+' '+a.querySelector('textarea').value).toLowerCase().includes(q);};
</script></body></html>`;
const output=path.basename(dir)==='step-03'?html.replaceAll('第二步 ·','第三步 ·').replaceAll('step-02-copy-edits.json','step-03-copy-edits.json').replaceAll('第三步不会自动选择','不会自动选择').replaceAll('screenshots/learning-1440.png','screenshots/student-return-card.png').replaceAll('screenshots/chat-390.png','regression/step02-screenshots/chat-390.png').replaceAll(archivePreview,'screenshots/student-archive.png'):html;
writeFileSync(path.join(dir,'copy-review.html'),output);console.log('Created editable copy review:',Object.keys(entries).length);
