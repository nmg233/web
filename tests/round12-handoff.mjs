import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const docs=['README.md','SOURCE.md','DESIGN.md','frontend/README.md','docs/HANDOFF.md','docs/BOUNDARIES.md','docs/round-12.md','docs/archive-backend-todos.md','docs/work-course-access-todos.md','docs/round-12/matrix.md'];
for(const file of docs)for(const[,target]of readFileSync(path.join(root,file),'utf8').matchAll(/\]\(([^)]+)\)/g)){const local=target.split('#')[0];if(local&&!/^https?:/.test(local))assert.ok(existsSync(path.resolve(root,path.dirname(file),local)),`${file} -> ${local}`);}
const browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{await p.goto(pathToFileURL(path.join(root,'docs/acceptance/index.html')).href);await p.locator('img').evaluateAll(imgs=>imgs.forEach(img=>img.loading='eager'));await p.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));assert.equal(await p.locator('img').count(),34);
 for(const width of[1440,768,390]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.getByRole('link',{name:'本轮实拍',exact:true}).click();assert.match(p.url(),/#current$/);}
 const links=await p.locator('a').evaluateAll(els=>els.map(e=>e.getAttribute('href')));for(const href of links){if(href.startsWith('#')){assert.equal(await p.locator(href).count(),1);continue;}if(/^https?:/.test(href))continue;assert.ok(existsSync(path.resolve(root,'docs/acceptance',href.split('#')[0])),href);}
 // 所有本轮主图必须来自实际截图并保留对应视口宽高。
 const names=readdirSync(path.join(root,'docs/round-12/screenshots')).filter(x=>x.endsWith('.png')&&x!=='failure.png');for(const name of names){const b=readFileSync(path.join(root,'docs/round-12/screenshots',name));const w=b.readUInt32BE(16),h=b.readUInt32BE(20);const expected=name.includes('390')?[390,844]:name.includes('768')?[768,1024]:[1440,900];assert.deepEqual([w,h],expected,name);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:browser.version(),galleryImages:34,round12Images:names.length,viewports:[1440,768,390],localLinks:'all exist',errors},null,2));
}finally{await browser.close();}
