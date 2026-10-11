import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'docs/redesign-v2/step-02'),base='http://127.0.0.1:4174';
const hash=b=>createHash('sha256').update(b).digest('hex'),record={url:base,assets:[],screenshots:[],font:null};
const html=await(await fetch(base)).text(),dist=readFileSync(path.join(root,'frontend/dist/index.html'),'utf8');
if(html!==dist)throw Error('4174 不是当前 dist/index.html');record.indexSha256=hash(html);
for(const url of [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1])){const response=await fetch(base+url),bytes=Buffer.from(await response.arrayBuffer()),file=path.join(root,'frontend/dist',url);if(hash(bytes)!==hash(readFileSync(file)))throw Error('产物不一致 '+url);record.assets.push({url,status:response.status,sha256:hash(bytes)});}
const browser=await chromium.launch({channel:'msedge',headless:true});record.browser=browser.version();
const p=await browser.newPage({viewport:{width:1440,height:900}});p.setDefaultTimeout(12000);
async function shot(name,fullPage=false){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);if(!await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error('溢出 '+name);await p.screenshot({path:path.join(dir,'screenshots',name+'.png'),fullPage,animations:'disabled'});record.screenshots.push(name);}
try{
 await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/explore/);
 for(const [width,height]of [[1440,900],[768,1024],[390,844],[360,800],[844,390]]){await p.setViewportSize({width,height});for(const [page,url,selector]of [['map','/courses/9001','.route-node'],['learning','/courses/9001/lessons/90011/learn','.study-section'],['lab','/courses/9001/lab','.lab-experiment'],['archive','/courses/9001/archives','.archive-overview']]){await p.goto(base+url);await p.locator(selector).first().waitFor();if(!await p.locator('.course-avatar-button>.pixel-image,.course-avatar-button>.pixel-icon').isVisible())throw Error('头像缩略图不可见 '+width);await shot('preview-'+page+'-'+width);}
  await p.locator('.course-robot').click();await p.locator('#assistant-question').waitFor();await p.getByText('灵境小智暂未启用',{exact:true}).waitFor();await shot('preview-chat-disabled-'+width);
 }
 await p.setViewportSize({width:1440,height:900});await p.goto(base+'/courses/9001/lessons/90011/learn');await p.locator('.course-page-header h2').waitFor();await p.screenshot();const c=await p.context().newCDPSession(p);await c.send('DOM.enable');await c.send('CSS.enable');const {root:doc}=await c.send('DOM.getDocument');const {nodeId}=await c.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'.course-page-header h2'});record.font=(await c.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;if(!record.font.some(f=>f.isCustomFont&&f.postScriptName==='ChillReunion_Round'&&f.glyphCount>0))throw Error('课时中文真实字体未确认');await c.detach();
 await p.getByRole('button',{name:'选择角色头像',exact:true}).click();await p.locator('.course-avatar-grid').waitFor();await p.locator('.course-avatar-grid>button').filter({hasText:'程以宁'}).click();await p.getByRole('status').filter({hasText:'头像已保存到当前账号'}).waitFor();await shot('preview-avatar-saved');await p.locator('.ant-modal-close').click();await p.reload();await p.locator('.course-avatar-button').getByText('程以宁').waitFor();record.avatarActualReadback=true;
 await p.goto(base+'/courses/9002');await p.locator('.route-node').waitFor();if(await p.locator('.course-avatar-button').count())throw Error('普通主题泄露六角色');await shot('preview-campus-course');
 await p.goto(pathToFileURL(path.join(dir,'assets.html')).href);await p.locator('.assets figure img').last().waitFor();await p.waitForFunction(()=>[...document.images].length===10&&[...document.images].every(img=>img.complete&&img.naturalWidth>0));record.assetPreviewDecodedImages=await p.locator('img').count();await shot('assets-preview',true);await p.goto(pathToFileURL(path.join(dir,'index.html')).href);await p.getByRole('heading',{name:'新版第 2/3 步 · 真实课程页面'}).waitFor();record.galleryOpened=true;
 writeFileSync(path.join(dir,'evidence/preview-4174.json'),JSON.stringify(record,null,2)+'\n');console.log('4174 当前 dist、真实字体、头像读写、五尺寸与素材图集核对通过。');
}finally{await browser.close();}
