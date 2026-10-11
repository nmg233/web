import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:4174',dir='docs/redesign-v2/step-01/patch';
const sizes=[[1440,900],[768,1024],[390,844],[360,800],[844,390]];
const browser=await chromium.launch({channel:'msedge',headless:true});
mkdirSync(dir+'/after',{recursive:true});
try {
  const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[],resources=[],viewports=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(r.url().includes('/assets/redesign-v2/')||r.resourceType()==='font')resources.push(r.url());});
  const response=await p.goto(base+'/login'),html=await response.text(),dist=readFileSync('frontend/dist/index.html','utf8');
  const bundles=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(m=>m[1]);
  assert.ok(bundles.length>=2);for(const bundle of bundles)assert.ok(dist.includes(bundle));
  await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL('**/explore');await p.getByTestId('home-course-card').first().waitFor();
  for(const[width,height]of sizes){
    await p.setViewportSize({width,height});await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();await p.evaluate(()=>document.fonts.ready);
    await p.waitForFunction(()=>[...document.querySelectorAll('.space-place-art')].slice(0,3).every(i=>i.complete&&i.naturalWidth));
    await p.waitForTimeout(120);assert.equal(await p.locator('.route-node').count(),6);
    const metric=await p.evaluate(()=>({width:innerWidth,height:innerHeight,mapTop:document.querySelector('.pixel-map-stage').getBoundingClientRect().top,firstNodeBottom:document.querySelector('.route-node').getBoundingClientRect().bottom,documentWidth:document.documentElement.scrollWidth,font:getComputedStyle(document.body).fontFamily}));
    assert.ok(metric.documentWidth<=width+1);assert.match(metric.font,/ChillReunion/);
    if(width<=390){assert.ok(metric.mapTop<height/2);assert.ok(metric.firstNodeBottom<height-16);}
    viewports.push(metric);await p.screenshot({path:dir+`/after/map-${width}.png`,animations:'disabled'});
    await p.locator('.route-node').first().click();await p.getByTestId('lesson-details').getByText('观察与提问',{exact:true}).waitFor();
    if(width<992)await p.waitForFunction(()=>{const el=document.querySelector('.space-lesson-drawer.ant-drawer-open .ant-drawer-content-wrapper');return el&&Math.abs(el.getBoundingClientRect().bottom-innerHeight)<1;});
    await p.screenshot({path:dir+`/after/detail-${width}.png`,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);assert.equal(resources.some(r=>r.includes('/masters/')||r.includes('SmileySans')),false);
  assert.ok(resources.some(r=>r.includes('ChillReunion-Round.woff2')));
  writeFileSync(dir+'/evidence/preview-4174.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),url:base,matchedBuiltBundles:bundles,viewports,requestedArtAndFont:[...new Set(resources)],pageErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({viewports,bundles,pageErrors:errors},null,2));
} finally {await browser.close();}
