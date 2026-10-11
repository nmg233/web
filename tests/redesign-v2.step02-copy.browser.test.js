import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setup,login,go} from './helpers/step02.fixture.mjs';
import {root} from './v2-fixture.mjs';
const reviewDir=path.resolve(root,process.env.PBL_COPY_REVIEW_DIR||'docs/redesign-v2/step-02'),baseline=path.join(reviewDir,'copy-baseline.json');
test('文案交接：人工 HTML 导出、特殊字符、双来源冲突与真实删除显示',{timeout:90000},async t=>{
 const isolated=path.join(mkdtempSync(path.join(os.tmpdir(),'pbl-copy-source-')),'frontend');mkdirSync(isolated,{recursive:true});
 for(const name of ['src','package.json','vite.config.js','index.html'])cpSync(path.join(root,'frontend',name),path.join(isolated,name),{recursive:true});
 for(const name of ['public','node_modules'])symlinkSync(path.join(root,'frontend',name),path.join(isolated,name),'junction');
 const f=await setup({frontendDir:isolated}),dir=path.join(root,'test-results/redesign-v2/step02-copy');mkdirSync(dir,{recursive:true});
 mkdirSync(path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-screenshots'),'step02-screenshots'),{recursive:true});
 const jsx=path.join(isolated,'src/content/uiCopy.jsx'),original=readFileSync(jsx,'utf8'),data=JSON.parse(original.split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''));
 const special='“我的引导” <img src=x onerror=alert(1)> ${answer}\n保留第二行';
 const html=await f.browser.newPage();
 try{
  await t.test('本地审阅页保存 HTML 与 JSON 保留 ID、显隐和特殊字符',async()=>{
   await html.goto(pathToFileURL(path.join(reviewDir,'copy-review.html')).href);assert.equal(await html.locator('[data-copy-id]').count(),Object.keys(JSON.parse(readFileSync(baseline,'utf8'))).length);
   await html.locator('[data-copy-id="avatar.hint"]').fill(special);await html.locator('[data-enabled-id="avatar.hint"]').uncheck();
   if(reviewDir.endsWith('step-03'))await html.locator('[data-copy-id="maintenance.title"]').fill(special);
   let download=html.waitForEvent('download');await html.getByRole('button',{name:'保存已修改 HTML',exact:true}).click();await(await download).saveAs(path.join(dir,'edited.html'));
   download=html.waitForEvent('download');await html.getByRole('button',{name:'导出文案修改 JSON',exact:true}).click();await(await download).saveAs(path.join(dir,'edited.json'));
   const exported=JSON.parse(readFileSync(path.join(dir,'edited.json'),'utf8')),entry=exported.edits.find(e=>e.id==='avatar.hint');assert.equal(entry.text,special);assert.equal(entry.enabled,false);
   await html.goto(pathToFileURL(path.join(dir,'edited.html')).href);assert.equal(await html.locator('[data-copy-id="avatar.hint"]').inputValue(),special);assert.equal(await html.locator('[data-enabled-id="avatar.hint"]').isChecked(),false);assert.equal(await html.locator('.copy-entry img').count(),0);
   execFileSync(path.join(root,'.venv/Scripts/python.exe'),['scripts/extract-copy-edits.py',path.join(dir,'edited.html'),'--baseline',baseline,'--out',path.join(dir,'proposals.json')],{cwd:root,stdio:'pipe'});const result=JSON.parse(readFileSync(path.join(dir,'proposals.json'),'utf8'));assert.equal(result.changes[0].text,special);assert.equal(result.applied,false);if(reviewDir.endsWith('step-03'))assert.equal(result.changes.find(e=>e.id==='maintenance.title').text,special);
   await html.screenshot({path:path.join(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-screenshots'),'copy-review-edited.png'),fullPage:false});
  });
  await t.test('修改 JSX 后提取 HTML 报告冲突，不自动覆盖',async()=>{
   data['avatar.hint'].text='JSX 中人工修改的提示';writeFileSync(jsx,original.split(/export const uiCopy\s*=\s*/)[0]+'export const uiCopy = '+JSON.stringify(data,null,2)+';\n');
   execFileSync(path.join(root,'.venv/Scripts/python.exe'),['scripts/extract-copy-edits.py',path.join(dir,'edited.html'),'--baseline',baseline,'--jsx',jsx,'--out',path.join(dir,'conflicts.json')],{cwd:root,stdio:'pipe'});const result=JSON.parse(readFileSync(path.join(dir,'conflicts.json'),'utf8'));assert.equal(result.conflicts[0].id,'avatar.hint');assert.equal(result.applied,false);assert.equal(data['avatar.hint'].text,'JSX 中人工修改的提示');
  });
  await t.test('真实课程页面可选文案真正删除，返回标签改稿不改变实验入口与跳转',async()=>{
   data['avatar.hint'].text='';data['avatar.hint'].enabled=true;data['assistant.empty.hint'].enabled=false;
   writeFileSync(jsx,original.split(/export const uiCopy\s*=\s*/)[0]+'export const uiCopy = '+JSON.stringify(data,null,2)+';\n');
   const p=await f.browser.newPage();await login(p);await go(p,'/courses/9001');await p.getByRole('button',{name:'选择角色头像',exact:true}).click();await p.locator('.course-avatar-grid').waitFor();assert.equal(await p.locator('[data-copy-id="avatar.hint"]').count(),0);await p.locator('.ant-modal-close').click();await p.locator('.course-robot').click();await p.locator('#assistant-question').waitFor();assert.equal(await p.locator('[data-copy-id="assistant.empty.hint"]').count(),0);assert.equal(await p.getByText('说说你正在做什么、遇到了什么困难，以及已经尝试的方法',{exact:true}).count(),0);await p.screenshot({path:path.join(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-screenshots'),'copy-optional-deleted.png')});
   data['avatar.hint'].text=special;writeFileSync(jsx,original.split(/export const uiCopy\s*=\s*/)[0]+'export const uiCopy = '+JSON.stringify(data,null,2)+';\n');await p.reload();await p.getByRole('button',{name:'选择角色头像',exact:true}).click();await p.locator('[data-copy-id="avatar.hint"]').waitFor();assert.equal(await p.locator('[data-copy-id="avatar.hint"]').innerText(),special);assert.equal(await p.locator('[data-copy-id="avatar.hint"] img').count(),0);assert.deepEqual(Object.keys(data),Object.keys(JSON.parse(original.split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,''))));
   await p.locator('.ant-modal-close').click();
   data['flight.return.source'].text='自定义返回';data['system.flight.041'].text='自定义返回';writeFileSync(jsx,original.split(/export const uiCopy\s*=\s*/)[0]+'export const uiCopy = '+JSON.stringify(data,null,2)+';\n');
   // Apply source edits by an explicit reload; HMR can replace the open modal itself.
   await p.reload();await p.locator('.route-node').first().waitFor();await go(p,'/courses/9001/glider');await p.getByRole('button',{name:'自定义返回',exact:true}).waitFor();await p.getByRole('button',{name:'返回实验室',exact:true}).click();await p.waitForURL('**/courses/9001/lab');
  });
 }finally{writeFileSync(jsx,original);await f.close();}
});
