import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';

const copy=JSON.parse(fs.readFileSync(path.join(root,'content/student-copy/registry.json')));
const text=key=>copy['maintenance.'+key].text;
const routingErrors=[];
const lessonPath=id=>`/api/courses/91001/maintenance/lessons/${id}`;

// Hold only the return trip: the real Express handler and SQLite transaction have finished.
async function holdResponse(page,pattern,method,{drop=false,failRead=false}={}){
  let release,entered,used=false,inFlight;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const handler=route=>{
    if(used||route.request().method()!==method)return route.continue();
    used=true;inFlight=(async()=>{const response=await route.fetch();
    entered({status:response.status(),body:await response.json()});
    await gate;
    if(drop)return route.abort('failed');
    if(failRead)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"隔离回读失败，保留新输入"}'});
    return route.fulfill({response});})().catch(e=>{routingErrors.push(e.message);entered({status:0,error:e.message});});return inFlight;
  };
  await page.route(pattern,handler);
  return {started,release,remove:async()=>{release();await inFlight;await page.unroute(pattern,handler);}};
}
async function deadline(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('真实后端响应未到达延迟闸门')),12000);})]);}finally{clearTimeout(timer);}}
const saveButton=p=>p.locator('.authoring-save-bar').getByRole('button',{name:'保存当前课时草稿',exact:true});
async function settled(p){await p.waitForFunction(()=>!document.querySelector('.authoring-save-bar button')?.classList.contains('ant-btn-loading'));}
const article=p=>p.locator('#lesson-article-editor');
async function chooseArticle(p){await article(p).getByText('链接失败：导入 HTML＋图片包',{exact:true}).click();await p.getByLabel('文章 HTML 或图片包',{exact:true}).setInputFiles({name:'synthetic-article.html',mimeType:'text/html',buffer:Buffer.from('<p>新导入的合成文章<strong>重点</strong></p>')});}
async function queueFile(p){const section=p.locator('#lesson-files');await section.locator('input[type=file]').setInputFiles({name:'race-queue.txt',mimeType:'text/plain',buffer:Buffer.from('合成待上传材料')});await section.getByRole('textbox',{name:text('upload.description')+' race-queue.txt',exact:true}).fill('延迟响应后仍要保留的说明');}
async function assertQueue(p){const section=p.locator('#lesson-files');assert.equal(await section.getByTestId('upload-item').count(),1);assert.equal(await section.getByRole('textbox',{name:text('upload.description')+' race-queue.txt',exact:true}).inputValue(),'延迟响应后仍要保留的说明');}

test('真实延迟响应：课时保存与文章导入不丢最新草稿',{timeout:180000},async t=>{
  const f=prepareMentorFixture(3606,4636),db=new Database(f.env.DB_PATH);
  const blocks=[{id:'p0',type:'paragraph',text:'IMPORT-BASE'},{id:'p1',type:'paragraph',text:'待删除段落'},{id:'p2',type:'paragraph',text:'待上移段落'}];
  db.prepare("UPDATE lessons SET publication_state='draft',content_state='ready',presentation_type='experiment',cards_required=0,review_content='INITIAL',article_blocks=? WHERE id=91001").run(JSON.stringify(blocks));
  for(const id of[91011,91012,91013,91014])db.prepare("INSERT INTO lessons(id,course_id,title,publication_state,content_state,presentation_type,cards_required,review_content,article_blocks) VALUES(?,91001,?,'draft','ready','experiment',0,'INITIAL',?)").run(id,'延迟回归 · '+id,JSON.stringify(blocks));
  const imagePath=path.join(f.env.UPLOAD_PATH,'race-preserved.png');
  fs.writeFileSync(imagePath,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8pAAAAAASUVORK5CYII=','base64'));
  const imageId=Number(db.prepare("INSERT INTO resources(course_id,lesson_id,resource_type,title,file_name,file_type,file_path,file_size,upload_by) VALUES(91001,91011,'other','保留的合成图','race-preserved.png','png',?,?,10002)").run(imagePath,fs.statSync(imagePath).size).lastInsertRowid);
  db.prepare('UPDATE lessons SET article_blocks=? WHERE id=91011').run(JSON.stringify([...blocks,{id:'preserved-image',type:'image',resourceId:imageId,title:'保留的合成图',caption:'图片引用不能丢'}]));
  const runtime=await serveFixture(f,3606,4636),browser=await chromium.launch({channel:'msedge',headless:true});
  const out=path.join(root,'docs/content-authoring/draft-race-patch/evidence',new Date().toISOString().replaceAll(/[:.]/g,'-'));
  fs.mkdirSync(out,{recursive:true});const records=[],errors=[];
  const history=()=>Object.fromEntries(['student_lesson_versions','lesson_content_versions','lesson_learning_reports','student_coin_ledger','student_badge_grants','works','card_exercise_attempts','glider_simulations'].map(name=>[name,db.prepare('SELECT * FROM '+name).all()]));const beforeHistory=history();
  const open=async id=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(runtime.base+'/login');await page.getByLabel('账号',{exact:true}).fill('mentor_review_mentor');await page.getByLabel('密码',{exact:true}).fill(f.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname!='/login');
    await page.goto(runtime.base+`/courses/91001?tab=maintenance&lesson=${id}`);await page.getByLabel('课堂回顾正文',{exact:true}).waitFor();return page;
  };
  const scene=async(name,id,fn)=>{
    if(process.env.PBL_DRAFT_RACE_ONLY&&!name.includes(process.env.PBL_DRAFT_RACE_ONLY))return;
    await t.test(name,async()=>{const p=await open(id);try{await fn(p);records.push({name,status:'passed'});}catch(e){records.push({name,status:'failed',error:e.message});await p.screenshot({path:path.join(out,`failure-${id}.png`),animations:'disabled'});fs.writeFileSync(path.join(out,`failure-${id}.json`),JSON.stringify({url:p.url(),body:await p.locator('body').innerText()},null,2));throw e;}finally{await p.context().close();}});
  };
  try{
    await scene('保存响应等待：最新文字仍为dirty，再保存真正写入，队列与切换保护保留',91001,async p=>{
      const review=p.getByLabel('课堂回顾正文',{exact:true});await review.fill('SAVE-A');await queueFile(p);
      const held=await holdResponse(p,'**'+lessonPath(91001),'PUT');
      try{
        await saveButton(p).click();assert.equal((await deadline(held.started)).status,200);assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91001').get().review_content,'SAVE-A');
        await review.fill('EDIT-B-WHILE-SAVING');await p.getByLabel('选填介绍',{exact:true}).fill('保存后新增的介绍');await p.getByLabel('文章段落 1',{exact:true}).fill('保存后新增的段落');
        await p.getByRole('tab',{name:'课程总体填写',exact:true}).click();assert.ok(await review.isVisible());
        await p.getByRole('button',{name:copy['authoring.mode.preview'].text,exact:true}).click();await p.getByRole('button',{name:copy['authoring.mode.edit'].text,exact:true}).click();
        await review.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'save-pending.png'),animations:'disabled'});
        const reread=p.waitForResponse(r=>r.url().endsWith('/maintenance')&&r.request().method()==='GET');held.release();await reread;await settled(p);
        assert.equal(await review.inputValue(),'EDIT-B-WHILE-SAVING');assert.equal(await p.getByLabel('文章段落 1',{exact:true}).inputValue(),'保存后新增的段落');
        assert.match(await p.locator('.authoring-save-bar [role=status]').innerText(),/仍有新的未保存修改/);
        await assertQueue(p);await p.screenshot({path:path.join(out,'save-response-kept.png'),animations:'disabled'});
        const put=p.waitForResponse(r=>r.url().endsWith(lessonPath(91001))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await put).status(),200);await settled(p);
        const saved=db.prepare('SELECT review_content,description,article_blocks FROM lessons WHERE id=91001').get();assert.equal(saved.review_content,'EDIT-B-WHILE-SAVING');assert.equal(saved.description,'保存后新增的介绍');assert.equal(JSON.parse(saved.article_blocks)[0].text,'保存后新增的段落');await assertQueue(p);
        p.once('dialog',d=>d.dismiss());await p.getByRole('tab',{name:'课程总体填写',exact:true}).click();assert.ok(await review.isVisible());
      }finally{held.release();await held.remove();}
    });
    await scene('导入响应等待：合并最新增删排序，不覆盖段落或标题',91011,async p=>{
      await queueFile(p);await chooseArticle(p);const held=await holdResponse(p,'**'+lessonPath(91011)+'/article-import','POST');
      try{
        await p.getByRole('button',{name:'导入本站文章草稿',exact:true}).click();assert.equal((await deadline(held.started)).status,200);
        await p.getByLabel('文章段落 1',{exact:true}).fill('EDIT-DURING-IMPORT-MUST-KEEP');await article(p).getByTestId('article-block').nth(1).getByRole('button',{name:'移除引用',exact:true}).click();await article(p).getByTestId('article-block').nth(1).getByRole('button',{name:/^上\s*移$/}).click();
        await p.getByRole('button',{name:'添加文字段落',exact:true}).click();await p.getByLabel('文章段落 4',{exact:true}).fill('IMPORT-WAIT-ADDED');await p.getByLabel('文章标题',{exact:true}).fill('等待期间的新标题');
        await p.getByRole('button',{name:copy['authoring.mode.preview'].text,exact:true}).click();await p.getByRole('button',{name:copy['authoring.mode.edit'].text,exact:true}).click();await p.getByLabel('文章段落 1',{exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'import-pending.png'),animations:'disabled'});
        held.release();await article(p).getByTestId('rich-article').waitFor();await p.waitForFunction(()=>!document.querySelector('#lesson-article-editor button.ant-btn-loading'));
        assert.equal(await p.getByLabel('文章段落 1',{exact:true}).inputValue(),'待上移段落');assert.equal(await p.getByLabel('文章段落 2',{exact:true}).inputValue(),'EDIT-DURING-IMPORT-MUST-KEEP');assert.equal(await p.getByLabel('文章段落 4',{exact:true}).inputValue(),'IMPORT-WAIT-ADDED');assert.equal(await article(p).getByTestId('article-block').count(),5);assert.equal(await p.getByLabel('文章图片或附件 3',{exact:true}).locator('..').getAttribute('title'),'保留的合成图');await p.getByRole('img',{name:'保留的合成图',exact:true}).waitFor();assert.equal(await p.getByRole('img',{name:'保留的合成图',exact:true}).evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await p.getByLabel('文章标题',{exact:true}).inputValue(),'等待期间的新标题');await assertQueue(p);
        await p.screenshot({path:path.join(out,'import-response-kept.png'),animations:'disabled'});const put=p.waitForResponse(r=>r.url().endsWith(lessonPath(91011))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await put).status(),200);await settled(p);
        const saved=JSON.parse(db.prepare('SELECT article_blocks FROM lessons WHERE id=91011').get().article_blocks);assert.deepEqual(saved.slice(0,2).map(b=>b.id),['p2','p0']);assert.deepEqual(saved.slice(0,2).map(b=>b.text),['待上移段落','EDIT-DURING-IMPORT-MUST-KEEP']);assert.equal(saved[2].resourceId,imageId);assert.equal(saved[3].text,'IMPORT-WAIT-ADDED');assert.equal(fs.existsSync(imagePath),true);assert.equal(saved.filter(b=>b.type==='rich').length,1);
      }finally{held.release();await held.remove();}
    });
    await scene('回读等待失败：新输入与来源仍受保护，后续409核对不丢稿',91012,async p=>{
      const review=p.getByLabel('课堂回顾正文',{exact:true});await review.fill('READ-A');await queueFile(p);const held=await holdResponse(p,'**/api/courses/91001/maintenance','GET',{failRead:true});
      try{
        await saveButton(p).click();assert.equal((await deadline(held.started)).status,200);assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91012').get().review_content,'READ-A');
        await review.fill('READ-B-DURING-REFRESH');await p.getByLabel('文章段落 1',{exact:true}).fill('回读等待的新段落');await p.getByLabel('微信公众号文章链接',{exact:true}).fill('https://mp.weixin.qq.com/s/not-imported');held.release();await settled(p);await p.getByText('本次提交已保存，回读失败；新修改和上传队列保留，请重新读取确认',{exact:true}).waitFor();
        assert.equal(await review.inputValue(),'READ-B-DURING-REFRESH');assert.match(await p.locator('.authoring-save-bar [role=status]').innerText(),/仍有新的未保存修改/);await assertQueue(p);
        await saveButton(p).click();await p.getByText('文章导入来源尚未处理；请先导入或清除选择，再保存课时',{exact:true}).waitFor();assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91012').get().review_content,'READ-A');await p.getByRole('button',{name:'清除尚未导入的来源选择',exact:true}).click();await held.remove();
        const put=p.waitForResponse(r=>r.url().endsWith(lessonPath(91012))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await put).status(),200);await settled(p);assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91012').get().review_content,'READ-B-DURING-REFRESH');
        await review.fill('我的冲突草稿');db.prepare("UPDATE lessons SET review_content='另一位维护者的最新稿' WHERE id=91012").run();const conflict=p.waitForResponse(r=>r.url().endsWith(lessonPath(91012))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await conflict).status(),409);await settled(p);assert.equal(await review.inputValue(),'我的冲突草稿');await p.getByRole('button',{name:'核对最新修订（保留草稿）',exact:true}).click();await p.getByRole('dialog').getByText('服务器：另一位维护者的最新稿',{exact:true}).waitFor();await p.getByRole('dialog').locator('.ant-btn-primary').click();const retry=p.waitForResponse(r=>r.url().endsWith(lessonPath(91012))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await retry).status(),200);await settled(p);assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91012').get().review_content,'我的冲突草稿');await assertQueue(p);
      }finally{held.release();await held.remove();}
    });
    await scene('导入响应丢失重试：同请求编号只追加一次，保存失败和清除来源保留草稿',91013,async p=>{
      await chooseArticle(p);await queueFile(p);const keys=[];const capture=r=>{if(r.url().endsWith('/article-import')&&r.method()==='POST')keys.push(/name="requestKey"\r\n\r\n([^\r]+)/.exec(r.postData()||'')?.[1]);};p.on('request',capture);
      const first=await holdResponse(p,'**'+lessonPath(91013)+'/article-import','POST',{drop:true});let imported;
      try{
        await p.getByRole('button',{name:'导入本站文章草稿',exact:true}).click();imported=await deadline(first.started);assert.equal(imported.status,200);await p.getByLabel('文章段落 1',{exact:true}).fill('失败返回前的新输入');first.release();await p.waitForFunction(()=>!document.querySelector('#lesson-article-editor button.ant-btn-loading'));assert.equal(await p.getByLabel('文章段落 1',{exact:true}).inputValue(),'失败返回前的新输入');assert.equal(await article(p).getByTestId('rich-article').count(),0);assert.equal(await p.getByLabel('文章 HTML 或图片包',{exact:true}).evaluate(input=>input.files[0]?.name),'synthetic-article.html');await assertQueue(p);
      }finally{first.release();await first.remove();}
      const second=await holdResponse(p,'**'+lessonPath(91013)+'/article-import','POST');
      try{
        await p.getByRole('button',{name:'导入本站文章草稿',exact:true}).click();const replay=await deadline(second.started);assert.equal(replay.status,200);assert.equal(replay.body.block.id,imported.body.block.id);assert.equal(keys.length,2);assert.ok(keys[0]);assert.equal(keys[0],keys[1]);await p.getByLabel('文章段落 1',{exact:true}).fill('重试返回前的最新输入');second.release();await article(p).getByTestId('rich-article').waitFor();await p.waitForFunction(()=>!document.querySelector('#lesson-article-editor button.ant-btn-loading'));assert.equal(await p.getByLabel('文章段落 1',{exact:true}).inputValue(),'重试返回前的最新输入');assert.equal(await article(p).getByTestId('article-block').count(),4);await assertQueue(p);
      }finally{second.release();await second.remove();p.off('request',capture);}
      const failed=r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"隔离草稿保存失败"}'});await p.route('**'+lessonPath(91013),failed);await saveButton(p).click();await p.getByText('隔离草稿保存失败',{exact:true}).waitFor();assert.equal(await p.getByLabel('文章段落 1',{exact:true}).inputValue(),'重试返回前的最新输入');await p.unroute('**'+lessonPath(91013),failed);
      await p.getByLabel('微信公众号文章链接',{exact:true}).fill('https://mp.weixin.qq.com/s/clear-source');await p.getByRole('button',{name:'清除尚未导入的来源选择',exact:true}).click();assert.equal(await article(p).getByTestId('article-block').count(),4);const put=p.waitForResponse(r=>r.url().endsWith(lessonPath(91013))&&r.request().method()==='PUT');await saveButton(p).click();assert.equal((await put).status(),200);await settled(p);const saved=JSON.parse(db.prepare('SELECT article_blocks FROM lessons WHERE id=91013').get().article_blocks);assert.equal(saved[0].text,'重试返回前的最新输入');assert.equal(saved.filter(b=>b.id===imported.body.block.id).length,1);await assertQueue(p);
    });
    await scene('成功回读等待：仅新增文章来源也保持dirty，清除后不重复写入正文',91014,async p=>{
      const review=p.getByLabel('课堂回顾正文',{exact:true});await review.fill('ONLY-SOURCE-SAVED');let puts=0;const count=r=>{if(r.url().endsWith(lessonPath(91014))&&r.method()==='PUT')puts++;};p.on('request',count);const held=await holdResponse(p,'**/api/courses/91001/maintenance','GET');
      try{
        await saveButton(p).click();assert.equal((await deadline(held.started)).status,200);await p.getByLabel('微信公众号文章链接',{exact:true}).fill('https://mp.weixin.qq.com/s/pending-source-only');held.release();await settled(p);assert.match(await p.locator('.authoring-save-bar [role=status]').innerText(),/仍有新的未保存修改/);assert.equal(await p.getByLabel('微信公众号文章链接',{exact:true}).inputValue(),'https://mp.weixin.qq.com/s/pending-source-only');
        p.once('dialog',d=>d.dismiss());await p.getByRole('tab',{name:'课程总体填写',exact:true}).click();assert.equal(await review.inputValue(),'ONLY-SOURCE-SAVED');await saveButton(p).click();await p.getByText('文章导入来源尚未处理；请先导入或清除选择，再保存课时',{exact:true}).waitFor();assert.equal(puts,1);await p.getByRole('button',{name:'清除尚未导入的来源选择',exact:true}).click();await saveButton(p).click();await settled(p);assert.equal(puts,1);assert.match(await p.locator('.authoring-save-bar [role=status]').innerText(),/课时草稿已保存/);assert.equal(db.prepare('SELECT review_content FROM lessons WHERE id=91014').get().review_content,'ONLY-SOURCE-SAVED');
      }finally{held.release();await held.remove();p.off('request',count);}
    });
    assert.deepEqual(history(),beforeHistory,'草稿补修不得改写已存在的学生历史、成绩、作品、试飞及奖励记录');
  }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Synthetic SQLite + real API; held actual responses, no fake save/import success',records,pageErrors:errors,routingErrors,historyUnchanged:JSON.stringify(history())===JSON.stringify(beforeHistory)},null,2));console.log('Evidence:',path.relative(root,out));await browser.close();await runtime.close();db.close();}
  assert.deepEqual(errors,[]);assert.deepEqual(routingErrors,[]);
});
