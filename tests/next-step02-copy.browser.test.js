import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {readCopy} from '../scripts/fortune-copy.mjs';
import {applyStep02Edits} from '../scripts/step02-copy.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/next-version/step-02')),file=path.join(root,'docs/next-version/step-02/copy-review.html');
test('第二步独立文案 HTML 真实编辑、JSON 导出、保存重开，旧稿不变',async()=>{
 const original=fs.readFileSync(file),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const p=await browser.newPage({viewport:{width:1440,height:900}});await p.goto(pathToFileURL(file).href);
 const id='next2.reflection.entry',value='今天留下的记录 </textarea><script>window.invalidCopy=true</script>';
 await p.getByLabel(id,{exact:true}).fill(value);
 const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'导出 JSON 改稿',exact:true}).click()]);
 const payload=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 assert.equal(payload.edits.length,1);assert.equal(payload.edits[0].id,id);
 const current=readCopy(path.join(root,'frontend/src/content/uiCopy.jsx')),next=applyStep02Edits(current,payload);
 assert.equal(next[id].text,value);for(const k of Object.keys(current).filter(k=>!k.startsWith('next2.')))assert.deepEqual(next[k],current[k]);
 await p.screenshot({path:path.join(out,'copy-review-browser.png')});
 const [saved]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'保存可继续编辑的 HTML',exact:true}).click()]);
 const reopened=path.join(root,'test-results','step02-copy-return.html');fs.mkdirSync(path.dirname(reopened),{recursive:true});fs.copyFileSync(await saved.path(),reopened);await p.goto(pathToFileURL(reopened).href);assert.equal(await p.getByLabel(id,{exact:true}).inputValue(),value);assert.equal(await p.evaluate(()=>window.invalidCopy),undefined);
 assert.deepEqual(fs.readFileSync(file),original);
 fs.writeFileSync(path.join(out,'copy-browser-result.json'),JSON.stringify({status:'passed',entryCount:Object.keys(current).filter(k=>k.startsWith('next2.')).length,exportedChanges:1,savedHtmlReopened:true,oldCopyUnchanged:true,scriptTextEscaped:true},null,2));
 }finally{await browser.close();}
});
