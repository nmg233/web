import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root} from '../tests/v2-fixture.mjs';
const base='http://127.0.0.1:4174',dir=path.join(root,'docs/redesign-v2/step-02/visual-patch'),hash=b=>createHash('sha256').update(b).digest('hex');
const record={url:base,assets:[],screenshots:[],errors:[],sizes:[[1440,900],[1920,1080],[768,1024],[390,844],[360,640],[844,390]]};
const html=await(await fetch(base)).text(),dist=readFileSync(path.join(root,'frontend/dist/index.html'),'utf8');if(html!==dist)throw Error('4174 HTML 与当前 dist 不一致');record.indexSha256=hash(html);
for(const url of [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1])){const response=await fetch(base+url),bytes=Buffer.from(await response.arrayBuffer());if(response.status!==200||hash(bytes)!==hash(readFileSync(path.join(root,'frontend/dist',url))))throw Error('预览产物不一致 '+url);record.assets.push({url,status:response.status,sha256:hash(bytes)});}
const browser=await chromium.launch({channel:'msedge',headless:true}),p=await browser.newPage({viewport:{width:1440,height:900}});record.browser=browser.version();p.setDefaultTimeout(15000);p.on('pageerror',e=>record.errors.push(e.message));mkdirSync(path.join(dir,'preview-screenshots'),{recursive:true});
async function shot(name){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);if(!await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error('溢出 '+name);await p.screenshot({path:path.join(dir,'preview-screenshots',name+'.png'),animations:'disabled'});record.screenshots.push(name);}
async function contrast(name,text,panel){
 const colors=await p.evaluate(({text,panel})=>({foreground:getComputedStyle(document.querySelector(text)).color,background:getComputedStyle(document.querySelector(panel)).backgroundColor}),{text,panel});
 const parse=c=>c.match(/[\d.]+/g).map(Number),fg=parse(colors.foreground),bg=parse(colors.background),alpha=bg[3]??1;
 const lum=rgb=>rgb.slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const background=bg.slice(0,3).map(v=>v*alpha),a=lum(fg),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 if(ratio<4.5)throw Error('正文对比度不足 '+name+' '+ratio);
 (record.contrast??=[]).push({name,...colors,method:'actual computed colors; translucent panel composited over worst black scene, not image sampling',ratio:Number(ratio.toFixed(2))});
}
try{
 await p.goto(base+'/login');await p.locator('.patch-login-scene img').waitFor();await shot('login');await contrast('登录说明','.login-panel .service-muted','.login-panel');
 await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/explore/);
 for(const[width,height]of record.sizes){await p.setViewportSize({width,height});for(const[page,url,selector]of [['selector','/explore','[data-testid="home-course-card"]'],['personal','/me','.fortune-result'],['map','/courses/9001','.route-node'],['learning','/courses/9001/lessons/90011/learn','.study-section'],['lab','/courses/9001/lab','.lab-experiment-cover'],['archive','/courses/9001/archives','.archive-overview']]){await p.goto(base+url);await p.locator(selector).first().waitFor();await shot(page+'-'+width);if(page==='map'){await p.locator('.route-node').first().click();await p.locator('.space-lesson-modal .ant-modal').waitFor();await shot('detail-'+width);await p.keyboard.press('Escape');}}
  await p.locator('.course-robot').click();await p.locator('#assistant-question').waitFor();await p.getByText('灵境小智暂未启用',{exact:true}).waitFor();await shot('chat-disabled-'+width);
 }
 await p.setViewportSize({width:1440,height:900});await p.goto(base+'/courses/9001/lessons/90011/learn');await p.locator('.course-page-header h2').waitFor();await p.screenshot();const cdp=await p.context().newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root:doc}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'.course-page-header h2'});record.font=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;if(!record.font.some(f=>f.isCustomFont&&f.postScriptName==='ChillReunion_Round'&&f.glyphCount>0))throw Error('实际字体字形不匹配');
 await contrast('学习标题正文','.course-page-heading .study-header-main p','.course-page-heading');
 const result=await p.evaluate(async()=>{const r=await fetch('/api/account/daily-fortune',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}});return{status:r.status,data:await r.json(),cache:r.headers.get('Cache-Control')};});if(result.status!==200||result.cache!=='no-store')throw Error('预览运势后端未更新');record.fortune=result;
 await p.goto(base+'/me');await p.locator('.fortune-result').waitFor();await contrast('运势边界说明','.fortune-boundary','.daily-fortune');await contrast('我的账号说明','.space-personal-header p','.space-personal-header');
 await p.goto('file:///'+path.join(dir,'assets.html').replaceAll('\\','/'));await p.locator('.assets img').last().scrollIntoViewIfNeeded();for(const img of await p.locator('.assets img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}if(await p.locator('.assets img').count()!==11)throw Error('素材未完整展示');record.assetPreviewDecodedImages=11;
 await p.goto('file:///'+path.join(dir,'copy-review.html').replaceAll('\\','/'));record.copyEntries=await p.locator('[data-copy-id]').count();if(record.copyEntries!==839)throw Error('交接索引数量错误');for(const href of await p.locator('figure img').evaluateAll(es=>es.map(e=>e.getAttribute('src'))))if(!existsSync(path.resolve(dir,href)))throw Error('文案页图片缺失 '+href);
 await p.goto('file:///'+path.join(dir,'index.html').replaceAll('\\','/'));record.galleryLinks=await p.locator('figure a[href]').count();for(const href of await p.locator('figure img').evaluateAll(es=>es.map(e=>e.getAttribute('src'))))if(!existsSync(path.resolve(dir,href)))throw Error('图集图片缺失 '+href);record.galleryOpened=true;
 if(record.errors.length)throw Error('浏览器错误 '+record.errors.join(';'));
 writeFileSync(path.join(dir,'evidence/preview-4174.json'),JSON.stringify(record,null,2)+'\n');console.log('4174 当前构建字节、真实字体、运势后端、六尺寸、素材和文案图集全部核对通过');
}finally{await browser.close();}
