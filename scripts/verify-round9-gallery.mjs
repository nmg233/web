
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(pathToFileURL(path.resolve('docs/round-09/index.html')).href);
 await page.selectOption('#size','all');
 const decoded=await page.locator('main img').evaluateAll(async images=>{await Promise.all(images.map(image=>{image.loading='eager';return image.decode();}));return images.map(image=>({src:image.getAttribute('src'),width:image.naturalWidth,height:image.naturalHeight}));});
 assert.equal(decoded.length,66);assert.ok(decoded.every(image=>image.width>0&&image.height>0));
 const counts={};for(const value of ['desktop','tablet','mobile','extra']){await page.selectOption('#size',value);counts[value]=await page.locator('figure:visible').count();}
 assert.deepEqual(counts,{desktop:19,tablet:19,mobile:19,extra:9});
 await page.setViewportSize({width:390,height:844});await page.selectOption('#size','mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.selectOption('#group','帮助与反馈');assert.equal(await page.locator('figure:visible').count(),10);
 console.log(JSON.stringify({gallery:'passed',images:decoded.length,counts,smallViewport:true}));
} finally {await browser.close();}
