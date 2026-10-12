import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/experience-patch/actual'),mode=process.argv[2]||'after';fs.mkdirSync(out,{recursive:true});
const report=JSON.parse(fs.readFileSync(path.join(root,'.local/teaching/import-report.json'))),copy=JSON.parse(fs.readFileSync(path.join(root,'frontend/src/content/uiCopy.jsx'),'utf8').split('export const uiCopy = ')[1].trim().replace(/;$/,''));
const browser=await chromium.launch({channel:'msedge',headless:true}),p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())&&!r.url().includes('/auth/'))writes.push({method:r.method(),path:new URL(r.url()).pathname});});
try{
 await p.goto('http://127.0.0.1:4184/login');await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
 const fortune=await p.evaluate(async()=>{const r=await fetch('/api/account/daily-fortune',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}});return {status:r.status,dto:await r.json()};});const dto=fortune.dto;
 fs.writeFileSync(path.join(out,'fortune-'+mode+'.json'),JSON.stringify({url:'http://127.0.0.1:4184/api/account/daily-fortune',...fortune,display:{good:dto.good?.map(id=>copy['fortune.good.'+id]?.text),avoid:dto.avoid?.map(id=>copy['fortune.avoid.'+id]?.text)},scope:'Authenticated actual local 4184, real server date; no clock or response overrides'},null,2));
 if(mode==='before')returnResult();
 else{
  for(const [width,height]of[[1440,900],[768,1024],[390,844],[360,800],[844,390]]){
   await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:4184/courses/'+report.courseId);await p.locator('.route-node').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);await p.screenshot({path:path.join(out,`map-${width}x${height}.png`),animations:'disabled'});await p.locator('.pixel-map-route-canvas').screenshot({path:path.join(out,`route-full-${width}x${height}.png`)});
  }
  await p.setViewportSize({width:1440,height:900});await p.goto('http://127.0.0.1:4184/me');await p.locator('.fortune-result').waitFor();await p.locator('.account-avatar-trigger').click();await p.getByRole('button',{name:'校园银杏',exact:true}).waitFor();await p.screenshot({path:path.join(out,'avatar-current-1440.png'),animations:'disabled'});await p.keyboard.press('Escape');await p.screenshot({path:path.join(out,'me-current-1440.png'),animations:'disabled'});
 }
 function returnResult(){}
 fs.writeFileSync(path.join(out,'result-'+mode+'.json'),JSON.stringify({base:'http://127.0.0.1:4184',api:'http://127.0.0.1:3154',courseId:report.courseId,browser:browser.version(),pageErrors:errors,businessRequests:writes,scope:'Actual local teaching data, no synthetic writes or clock interception. Existing badge reconcile request can run on normal student navigation; row preservation independently audited.'},null,2));if(errors.length)throw Error('Actual page error');
}finally{await browser.close();}
