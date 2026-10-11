import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
import {prepareSkeleton} from '../scripts/teaching.mjs';

const phase=process.env.PBL_PATCH_RUN||'first',out=path.join(root,'docs/lesson-authoring/browser','patch-'+phase);
const base='http://127.0.0.1:4268',api='http://127.0.0.1:3238';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8pAAAAAASUVORK5CYII=','base64');
async function ready(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Not ready');}
test('教材防丢稿与报告预览：独立合成库原生操作',{timeout:360000},async t=>{
 fs.mkdirSync(out,{recursive:true});
 const f=fixture(3238,4268),db=new Database(f.env.DB_PATH),plan=prepareSkeleton(db),[visit,theory]=plan.lessonIds,id=plan.courseId;
 db.prepare("UPDATE lessons SET content_state='ready' WHERE id=?").run(theory);
 for(let i=1;i<=2;i++)db.prepare("INSERT INTO knowledge_cards(lesson_id,title,content,status,created_by,sort_order) VALUES(?,?,'合成卡片内容','published',2,?)").run(theory,'防丢卡片 '+i,i);
 const backend=spawn(process.execPath,['backend/app.js'],{cwd:root,env:f.env,stdio:'ignore',windowsHide:true});await ready(api+'/api/health');
 const dist=path.join(root,'build/teaching');
 const front=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){const p=http.request(api+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});p.on('error',()=>{res.writeHead(502);res.end();});req.pipe(p);return;}
  const candidate=path.resolve(dist,'.'+new URL(req.url,base).pathname),file=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>front.listen(4268,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true}),records=[],errors=[];
 const context=await browser.newContext({viewport:{width:1440,height:900}}),m=await context.newPage();m.setDefaultTimeout(10000);m.on('pageerror',e=>errors.push(e.message));
 await m.addInitScript(()=>{const append=FormData.prototype.append;FormData.prototype.append=function(name,value,...args){if(name==='file')window.patchSubmittedOriginalFile=value===window.patchSelectedFile;return append.call(this,name,value,...args);};});
 await m.goto(base+'/login');await m.getByLabel('账号',{exact:true}).fill('mentor_zhang');await m.getByLabel('密码',{exact:true}).fill('mentor123');await m.getByRole('button',{name:'登录',exact:true}).click();await m.waitForURL(u=>u.pathname!='/login');
 const panel=()=>m.getByTestId('authoring-panel'),queue=()=>panel().getByTestId('upload-resource');
 const region=key=>m.locator(`[data-authoring-region="${key}"]`).getByRole('button',{name:/^编辑这里/}).first();
 const lessonRow=l=>db.prepare('SELECT * FROM lessons WHERE id=?').get(l);
 async function open(l){
  // Native navigation discards only on explicit acceptance; each scene starts clean.
  const accept=d=>d.accept();m.on('dialog',accept);await m.goto(base+'/courses');m.off('dialog',accept);await m.locator('a[href="/courses/'+id+'"]').click();await m.getByRole('tab',{name:'课程内容维护',exact:true}).click();
  await m.getByRole('tab',{name:'可视化填写 / 学生效果预览',exact:true}).click();const select=m.locator('#preview-lesson');await select.click();
  if(l===theory)await select.press('ArrowDown');await select.press('Enter');await m.locator('.teaching-preview .study-header h2').filter({hasText:lessonRow(l).title}).waitFor();
 }
 async function selectImage(name='待上传.png'){
  await queue().locator('input[type=file]').evaluate(input=>input.addEventListener('change',event=>{window.patchSelectedFile=event.target.files[0];},{capture:true,once:true}));
  await queue().locator('input[type=file]').setInputFiles({name,mimeType:'image/png',buffer:png});await queue().getByTestId('upload-item').last().waitFor();
  await queue().evaluate(element=>{window.patchQueueRoot=element;});
 }
 async function originalFile(){assert.equal(await queue().evaluate(element=>element===window.patchQueueRoot&&window.patchSelectedFile instanceof File),true,'取消保留队列节点及原选件来源');}
 async function saveBody(){await panel().locator('button[type=submit]').click();await panel().getByText(/已保存教材/).waitFor();}
 async function changeLesson(){const select=m.locator('#preview-lesson');await select.click();await select.press('ArrowDown');await select.press('Enter');}
 async function dialogAction(action,accept=false){let count=0;const handle=async d=>{count++;await (accept?d.accept():d.dismiss());};m.on('dialog',handle);try{await action();}finally{m.off('dialog',handle);}return count;}
 async function shot(name){await m.evaluate(()=>document.fonts.ready);assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');await m.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});}
 async function scene(name,fn){if(process.env.PBL_PATCH_ONLY&&!name.includes(process.env.PBL_PATCH_ONLY))return;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){records.push({name,status:'failed',error:e.message});await shot('failure-'+records.length).catch(()=>{});throw e;}});}
 try{
  await scene('阶段切换取消保留原文，确认丢弃后不残留假 dirty',async()=>{
   await open(theory);const before=lessonRow(theory).review_content;await region('review_content').click();const input=panel().getByLabel('课堂回顾正文',{exact:true});await input.fill('未保存正文：取消必须原样保留');assert.equal(await dialogAction(()=>region('review_content').click()),0,'再次点击当前编辑入口应保持当前草稿');assert.equal(await input.inputValue(),'未保存正文：取消必须原样保留');
   assert.equal(await dialogAction(()=>m.locator('.study-stage').nth(2).click()),1,'切换阶段必须确认');
   assert.equal(await input.inputValue(),'未保存正文：取消必须原样保留');assert.equal(await m.locator('.study-stage').nth(0).getAttribute('aria-current'),'step');assert.equal(lessonRow(theory).review_content,before);await shot('stage-cancel');
   assert.equal(await dialogAction(()=>m.locator('.study-stage').nth(2).click(),true),1);assert.equal(await panel().count(),0);
   assert.equal(await dialogAction(()=>m.locator('.study-stage').nth(0).click()),0);await region('review_content').click();assert.equal(await panel().getByLabel('课堂回顾正文',{exact:true}).inputValue(),before||'');
   assert.equal(await dialogAction(()=>panel().getByRole('button',{name:'关闭编辑',exact:true}).click()),0);
  });
  await scene('仅选图片关闭取消保留 File、标题说明与未上传状态',async()=>{
   await open(visit);await region('article').click();const before=lessonRow(visit).article_blocks;const resources=db.prepare('SELECT COUNT(*) n FROM resources').get().n;await selectImage();
   await queue().getByLabel('名称 待上传.png',{exact:true}).fill('队列原标题');await queue().getByLabel('资料说明 待上传.png',{exact:true}).fill('队列原说明');
   assert.equal(await dialogAction(()=>panel().getByRole('button',{name:'关闭编辑',exact:true}).click()),1,'仅选件也必须确认');
   assert.equal(await queue().getByLabel('名称 待上传.png',{exact:true}).inputValue(),'队列原标题');assert.equal(await queue().getByLabel('资料说明 待上传.png',{exact:true}).inputValue(),'队列原说明');assert.match(await queue().getByTestId('upload-item').innerText(),/待上传/);
   assert.equal(lessonRow(visit).article_blocks,before);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources').get().n,resources);await originalFile();await shot('queue-close-cancel');
   await queue().getByRole('button',{name:'上传待处理文件',exact:true}).click();await queue().getByText('上传成功',{exact:true}).waitFor();const uploaded=db.prepare("SELECT * FROM resources WHERE title='队列原标题'").get();assert.ok(uploaded?.upload_token);assert.equal(await m.evaluate(()=>window.patchSubmittedOriginalFile),true,'实际上传使用取消前同一 File 对象');assert.equal(uploaded.description,'队列原说明');assert.deepEqual(fs.readFileSync(uploaded.file_path),png,'取消后原 File 字节仍可上传');
   assert.equal(await dialogAction(()=>panel().getByRole('button',{name:'关闭编辑',exact:true}).click(),true),1);assert.equal(lessonRow(visit).article_blocks,before);
  });
  await scene('正文已保存仍保护待上传队列，预览取消不丢选件',async()=>{
   await open(visit);await region('article').click();await selectImage('保存后待上传.png');await panel().getByLabel('文章标题',{exact:true}).fill('只保存正文，尚未上传图片');await panel().locator('button[type=submit]').click();await panel().getByText(/已保存教材/).waitFor();
   assert.equal(await dialogAction(()=>m.getByRole('button',{name:'查看学生效果',exact:true}).click()),1,'保存正文不得清队列 dirty');assert.equal(await queue().getByTestId('upload-item').count(),1);assert.match(await queue().innerText(),/待上传/);assert.equal(lessonRow(visit).article_title,'只保存正文，尚未上传图片');
   assert.equal(await dialogAction(()=>m.getByRole('button',{name:'查看学生效果',exact:true}).click(),true),1);assert.equal(await panel().count(),0);assert.equal(await dialogAction(()=>m.getByRole('button',{name:'返回编辑',exact:true}).click()),0);
  });
  await scene('教师编辑与学生效果的五项报告名称完整，禁止提交且不读学生私有状态',async()=>{
   await open(theory);const privateRequests=[];const listener=req=>{if(/\/learning\/lessons\/|\/(?:rewards|reports|progress|reflections)(?:\/|$)/.test(new URL(req.url()).pathname))privateRequests.push(req.url());};m.on('request',listener);
   await m.locator('.study-stage').nth(2).click();
   // Compare names to the reviewed copy registry rather than invent new labels.
   const source=fs.readFileSync(path.join(root,'frontend/src/content/uiCopy.jsx'),'utf8');
   const labels=[55,56,57,58,59].map(n=>{const block=source.split('"system.learning.'+String(n).padStart(3,'0')+'":')[1].split('\n  },')[0];return JSON.parse(block.match(/"text":\s*("(?:[^"\\]|\\.)*")/)[1]);});
   assert.equal(labels.length,5);assert.ok(labels.every(Boolean));
   for(const preview of [false,true]){if(preview)await m.getByRole('button',{name:'查看学生效果',exact:true}).click();for(const label of labels){const input=m.getByLabel(label,{exact:true});assert.equal(await input.count(),1,'missing accessible report label '+label);assert.equal(await input.isDisabled(),true);assert.equal(await input.inputValue(),'');}assert.equal(await m.getByRole('button',{name:'提交学习报告与反思',exact:true}).isDisabled(),true);await shot(preview?'report-preview':'report-edit');await m.locator('.teaching-preview form').screenshot({path:path.join(out,preview?'report-preview-fields.png':'report-edit-fields.png'),animations:'disabled'});}
   m.off('request',listener);assert.deepEqual(privateRequests,[]);
  });
  await scene('卡片切换和关联编辑入口取消保留指导，确认后清理',async()=>{
   await open(theory);await m.locator('.study-stage').nth(1).click();await m.getByRole('button',{name:'1. 防丢卡片 1',exact:true}).waitFor();await region('experiment_guidance').click();const input=panel().getByLabel('实验操作指导',{exact:true});const before=lessonRow(theory).experiment_guidance;await input.fill('卡片一未保存的指导');
   assert.equal(await dialogAction(()=>m.getByRole('button',{name:'2. 防丢卡片 2',exact:true}).click()),1);assert.equal(await input.inputValue(),'卡片一未保存的指导');assert.equal(await m.getByRole('button',{name:'1. 防丢卡片 1',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(lessonRow(theory).experiment_guidance,before);
   assert.equal(await dialogAction(()=>m.getByRole('button',{name:'课时标题与安排',exact:true}).click()),1);assert.equal(await input.inputValue(),'卡片一未保存的指导');assert.equal(await m.locator('.maintenance-editor').count(),0);
   assert.equal(await dialogAction(()=>m.getByRole('button',{name:'2. 防丢卡片 2',exact:true}).click(),true),1);assert.equal(await panel().count(),0);assert.equal(await dialogAction(()=>m.getByRole('button',{name:'1. 防丢卡片 1',exact:true}).click()),0);
  });
  await scene('失败图片与正文分别保存，取消课时/路由/后退仍保留队列并可重试',async()=>{
   await open(visit);await region('article').click();const before=lessonRow(visit).article_blocks,resourceCount=db.prepare('SELECT COUNT(*) n FROM resources').get().n;await selectImage('失败图片.png');await queue().getByLabel('名称 失败图片.png',{exact:true}).fill('失败保留原标题');await queue().getByLabel('资料说明 失败图片.png',{exact:true}).fill('失败保留说明');
   const tokens=[];const fail=async route=>{const body=route.request().postDataBuffer().toString();tokens.push(body.match(/name="upload_token"\r\n\r\n([^\r]+)/)[1]);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离环境上传故障'})});};await m.route('**/api/courses/'+id+'/resources',fail);
   await queue().getByRole('button',{name:'上传待处理文件',exact:true}).click();await queue().getByText('上传失败，可重试',{exact:true}).waitFor();await m.unroute('**/api/courses/'+id+'/resources',fail);
   await panel().getByLabel('文章标题',{exact:true}).fill('失败选件不随正文保存消失');await saveBody();
   assert.equal(await dialogAction(changeLesson),1);assert.equal(await panel().getByLabel('文章标题',{exact:true}).inputValue(),'失败选件不随正文保存消失');await originalFile();
   const url=m.url();assert.equal(await dialogAction(()=>m.locator('.staff-sidebar .ant-menu-item').first().click()),1);assert.equal(m.url(),url);const nextDialog=m.waitForEvent('dialog'),back=m.goBack();await (await nextDialog).dismiss();await back;await m.waitForURL(url);assert.equal(await queue().getByLabel('资料说明 失败图片.png',{exact:true}).inputValue(),'失败保留说明');await originalFile();
   assert.equal(lessonRow(visit).article_blocks,before);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources').get().n,resourceCount);await shot('failed-queue-cancel');
   const retry=async route=>{tokens.push(route.request().postDataBuffer().toString().match(/name="upload_token"\r\n\r\n([^\r]+)/)[1]);await route.continue();};await m.route('**/api/courses/'+id+'/resources',retry);await queue().getByRole('button',{name:'只重试失败项',exact:true}).click();await queue().getByText('上传成功',{exact:true}).waitFor();await m.unroute('**/api/courses/'+id+'/resources',retry);assert.equal(await m.evaluate(()=>window.patchSubmittedOriginalFile),true,'失败重试使用同一 File 对象');assert.equal(tokens.length,2);assert.equal(tokens[0],tokens[1]);assert.equal(db.prepare("SELECT COUNT(*) n FROM resources WHERE title='失败保留原标题'").get().n,1);await saveBody();
  });
  await scene('结果未确认时保留 token 和原 File，核对重试只产生一个真实 ID',async()=>{
   await open(visit);await region('article').click();await selectImage('结果未确认.png');let token,idBefore;const uncertain=async route=>{token=route.request().postDataBuffer().toString().match(/name="upload_token"\r\n\r\n([^\r]+)/)[1];const response=await route.fetch();idBefore=(await response.json()).id;await route.abort('failed');};await m.route('**/api/courses/'+id+'/resources',uncertain);await queue().getByRole('button',{name:'上传待处理文件',exact:true}).click();await queue().getByText('请求结果未确认，请先核对列表',{exact:true}).waitFor();await m.unroute('**/api/courses/'+id+'/resources',uncertain);
   await panel().getByLabel('文章标题',{exact:true}).fill('仅保存正文仍需核对上传结果');await saveBody();assert.equal(await dialogAction(()=>m.getByRole('button',{name:'查看学生效果',exact:true}).click()),1);await originalFile();assert.match(await queue().innerText(),/结果未确认/);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources WHERE upload_token=?').get(token).n,1);await shot('uncertain-queue-cancel');
   await queue().getByRole('button',{name:'只重试失败项',exact:true}).click();await queue().getByText('上传成功',{exact:true}).waitFor();assert.equal(await m.evaluate(()=>window.patchSubmittedOriginalFile),true,'未确认重试使用同一 File 对象');assert.match(await queue().innerText(),new RegExp('#'+idBefore+'\\b'));assert.equal(db.prepare('SELECT COUNT(*) n FROM resources WHERE upload_token=?').get(token).n,1);await saveBody();assert.equal(await dialogAction(()=>m.getByRole('button',{name:'查看学生效果',exact:true}).click()),0);
  });
  await scene('保存与上传进行中禁止静默卸载，结束后可正常继续',async()=>{
   await open(theory);await region('review_content').click();await panel().getByLabel('课堂回顾正文',{exact:true}).fill('处理中正文');let release,started;let gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);const hold=async route=>{started();await gate;await route.continue();};const endpoint='**/api/courses/'+id+'/maintenance/lessons/'+theory;await m.route(endpoint,hold);
   try{await panel().locator('button[type=submit]').click();await entered;assert.equal(await dialogAction(()=>m.locator('.study-stage').nth(2).click()),0);assert.equal(await panel().getByLabel('课堂回顾正文',{exact:true}).inputValue(),'处理中正文');assert.equal(await panel().getByRole('button',{name:'关闭编辑',exact:true}).isDisabled(),true);const url=m.url();await m.locator('.staff-sidebar .ant-menu-item').first().click();assert.equal(m.url(),url);}finally{release();}await panel().getByText(/已保存教材/).waitFor();await m.unroute(endpoint,hold);await m.locator('.study-stage').nth(2).click();assert.equal(await panel().count(),0);
   await open(visit);await region('article').click();await selectImage('上传进行中.png');gate=new Promise(r=>release=r);entered=new Promise(r=>started=r);const uploadEndpoint='**/api/courses/'+id+'/resources';await m.route(uploadEndpoint,hold);
   try{await queue().getByRole('button',{name:'上传待处理文件',exact:true}).click();await entered;await m.getByRole('button',{name:'查看学生效果',exact:true}).click();assert.equal(await panel().count(),1);assert.equal(await panel().getByRole('button',{name:'关闭编辑',exact:true}).isDisabled(),true);await originalFile();}finally{release();}await queue().getByText('上传成功',{exact:true}).waitFor();await m.unroute(uploadEndpoint,hold);await saveBody();
  });
  await scene('五尺寸原位文字/段落/图片选件取消保留，报告预览标签可读且禁用',async()=>{
   const evidence=[];
   for(const [width,height] of [[1920,1080],[1440,900],[1024,768],[768,1024],[390,844]]){
    await m.setViewportSize({width,height});await open(visit);await region('article').click();const before=lessonRow(visit),count=db.prepare('SELECT COUNT(*) n FROM resources').get().n;await panel().getByLabel('文章标题',{exact:true}).fill('五尺寸未保存标题 '+width);await panel().getByRole('button',{name:'添加段落',exact:true}).click();const text=panel().getByTestId('article-block').last().locator('textarea');await text.fill('五尺寸保留段落 '+width);const image=panel().getByTestId('article-block').filter({has:m.getByRole('combobox')}).first();assert.equal(await image.count(),1);const choice=image.getByRole('combobox');await choice.click();await choice.press('ArrowDown');await choice.press('Enter');const selected=await image.locator('.ant-select').innerText(),imageTitle=image.locator('input:not([role=combobox])').first(),caption=image.locator('textarea');await imageTitle.fill('未保存图片标题 '+width);await caption.fill('未保存图片说明 '+width);await selectImage('尺寸'+width+'.png');assert.equal(await dialogAction(()=>panel().getByRole('button',{name:'关闭编辑',exact:true}).click()),1);await originalFile();assert.equal(await image.locator('.ant-select').innerText(),selected);assert.equal(await imageTitle.inputValue(),'未保存图片标题 '+width);assert.equal(await caption.inputValue(),'未保存图片说明 '+width);assert.equal(await text.inputValue(),'五尺寸保留段落 '+width);assert.equal(await panel().getByLabel('文章标题',{exact:true}).inputValue(),'五尺寸未保存标题 '+width);assert.deepEqual(lessonRow(visit),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources').get().n,count);await text.scrollIntoViewIfNeeded();await shot('input-'+width);await queue().scrollIntoViewIfNeeded();await shot('upload-'+width);evidence.push({width,height,input:await text.inputValue(),title:await panel().getByLabel('文章标题',{exact:true}).inputValue(),queue:await queue().getByTestId('upload-item').innerText(),queueMounted:true,sourceFileRetained:true,imageChoice:selected,imageTitle:await imageTitle.inputValue(),imageCaption:await caption.inputValue(),serverUnchanged:true});await dialogAction(()=>panel().getByRole('button',{name:'关闭编辑',exact:true}).click(),true);
    await open(theory);await m.locator('.study-stage').nth(2).click();await m.getByRole('button',{name:'查看学生效果',exact:true}).click();const labels=await m.locator('.teaching-preview form .ant-form-item-label label').allTextContents();assert.equal(labels.slice(0,5).filter(Boolean).length,5);for(const label of labels.slice(0,5))assert.equal(await m.getByLabel(label,{exact:true}).isDisabled(),true);await m.getByLabel(labels[0],{exact:true}).scrollIntoViewIfNeeded();await shot('report-'+width);await m.locator('.teaching-preview form').screenshot({path:path.join(out,'report-fields-'+width+'.png'),animations:'disabled'});
   }fs.writeFileSync(path.join(out,'cancel-evidence.json'),JSON.stringify(evidence,null,2));
  });
  assert.deepEqual(errors,[]);
 }finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,browser:browser.version(),scope:'Isolated synthetic SQLite. Native controls; no real teaching mutations.'},null,2));await context.close();await browser.close();await new Promise(r=>front.close(r));const stopped=new Promise(r=>backend.once('exit',r));backend.kill();await stopped;db.close();
 }
});
