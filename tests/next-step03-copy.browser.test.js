import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {readCopy} from '../scripts/fortune-copy.mjs';
import {applyStep03Edits} from '../scripts/next-step03-copy.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/next-version/step-03'),file=path.join(out,'copy-review.html');
test('第三步文案真实编辑、下载、保存重开和当前素材图集无缺图',async()=>{
 const original=fs.readFileSync(file),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:900}});await p.goto(pathToFileURL(file).href);
  const id='next3.checkin.scope',value='本地演示 </textarea><script>window.invalidCopy=true</script>';
  await p.getByLabel(id,{exact:true}).fill(value);
  const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'导出修改 JSON',exact:true}).click()]);
  const payload=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(payload.edits.length,1);assert.equal(payload.edits[0].id,id);
  const current=readCopy(path.join(root,'frontend/src/content/uiCopy.jsx')),next=applyStep03Edits(current,payload);
  assert.equal(next[id].text,value);for(const k of Object.keys(current).filter(k=>!k.startsWith('next3.')))assert.deepEqual(next[k],current[k]);
  assert.throws(()=>applyStep03Edits(current,{...payload,edits:[{...payload.edits[0],text:''}]}),/不能关闭或清空/);
  await p.screenshot({path:path.join(out,'copy-review-browser.png')});
  const [saved]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'保存改稿 HTML',exact:true}).click()]);
  const reopened=path.join(root,'test-results','step03-copy-return.html');fs.mkdirSync(path.dirname(reopened),{recursive:true});fs.copyFileSync(await saved.path(),reopened);
  await p.goto(pathToFileURL(reopened).href);assert.equal(await p.getByLabel(id,{exact:true}).inputValue(),value);assert.equal(await p.evaluate(()=>window.invalidCopy),undefined);
  assert.deepEqual(fs.readFileSync(file),original);
  const pages=[];for(const name of ['index.html','assets.html']){
   await p.goto(pathToFileURL(path.join(out,name)).href);await p.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode();}});
   const count=await p.locator('img').count();assert.equal(count,name==='index.html'?27:3);pages.push({page:name,decodedImages:count});
   await p.screenshot({path:path.join(out,name==='assets.html'?'asset-preview-browser.png':'acceptance-browser.png')});
  }
  fs.writeFileSync(path.join(out,'copy-browser-result.json'),JSON.stringify({status:'passed',entryCount:50,exportedChanges:1,savedHtmlReopened:true,oldCopyUnchanged:true,scriptTextEscaped:true,necessaryEmptyRejected:true,pages},null,2));
 }finally{await browser.close();}
});
