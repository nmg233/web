import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {setup,login,go,gate} from './helpers/step02.fixture.mjs';
import {root} from './v2-fixture.mjs';

const run=process.env.PBL_PATCH_RUN||'final';
const out=path.join(root,'docs/redesign-v2/step-03/patch');
const shots=path.join(out,'screenshots',run);
const button=(scope,name)=>name==='保存'?scope.locator('button[type=submit]'):scope.getByRole('button',{name:new RegExp('(?:^| )'+[...name].join('\\s*')+'$')});
const modal=p=>p.locator('.ant-modal').filter({visible:true});
const files=(prefix,count)=>Array.from({length:count},(_,i)=>({name:`${prefix}-${i+1}.txt`,mimeType:'text/plain',buffer:Buffer.from('隔离补修合成资料，不是正式教学内容。')}));
async function saved(d,id){await d.getByText('已保存 #'+id,{exact:true}).waitFor();await d.locator('.ant-btn-loading').waitFor({state:'hidden'});}
async function json(p,url,method,body){return p.evaluate(async({url,method,body})=>{const r=await fetch('/api'+url,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};},{url,method,body});}

test('第三步补修：创建转更新与队列容量恢复（真实隔离 API）',{timeout:300000},async t=>{
 mkdirSync(shots,{recursive:true});const f=await setup(),records=[],pageErrors=[];
 const scenario=async(name,fn)=>t.test(name,async()=>{
  const context=await f.browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);
  const dialogs={accept:true,count:0};p.on('dialog',d=>{dialogs.count++;void (dialogs.accept?d.accept():d.dismiss());});p.on('pageerror',e=>pageErrors.push(e.message));
  try{await login(p,'mentor_zhang','mentor123');await go(p,'/courses/9001?tab=maintenance');await p.getByTestId('content-maintenance').waitFor();await fn(p,dialogs);records.push({name,result:'pass'});}
  catch(error){records.push({name,result:'fail',error:error.message});await p.screenshot({path:path.join(shots,'failure-'+records.length+'.png')});throw error;}
  finally{await context.close();}
 });
 const tab=(p,name)=>p.getByTestId('content-maintenance').getByRole('tab',{name,exact:true}).click();
 const capture=async(p,name)=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(shots,name+'.png'),animations:'disabled'});};
 const trace=(p,part)=>{const requests=[];p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/courses/9001/maintenance/'+part)&&['POST','PUT'].includes(r.method()))requests.push({method:r.method(),path:new URL(r.url()).pathname});});return requests;};
 const resourceCount=()=>f.db.prepare('SELECT count(*) n FROM resources WHERE course_id=9001').get().n;
 try{
  await scenario('新增章节同弹窗再次保存更新原 ID，学生读取改名且数据库不增副本',async p=>{
   const before=f.db.prepare('SELECT count(*) n FROM course_chapters WHERE course_id=9001').get().n,requests=trace(p,'chapters');
   await tab(p,'章节与课时');await button(p,'新增章节').click();const d=modal(p);
   await d.getByLabel('名称',{exact:true}).fill('补修：新增后改名章节');await button(d,'保存').click();await d.getByText(/已保存 #/).waitFor();await d.locator('.ant-btn-loading').waitFor({state:'hidden'});
   const id=f.db.prepare("SELECT id FROM course_chapters WHERE course_id=9001 AND title='补修：新增后改名章节'").get().id;
   await d.getByLabel('名称',{exact:true}).fill('补修：同一个章节已改名');await button(d,'保存').click();await saved(d,id);
   assert.equal(f.db.prepare('SELECT count(*) n FROM course_chapters WHERE course_id=9001').get().n,before+1);assert.equal(f.db.prepare('SELECT title FROM course_chapters WHERE id=?').get(id).title,'补修：同一个章节已改名');assert.deepEqual(requests.map(r=>r.method),['POST','PUT']);
   assert.equal((await json(p,'/courses/9001/maintenance/lessons/90014','PUT',{chapter_id:id})).status,200);await capture(p,'chapter-same-id');
   const student=await f.browser.newPage();try{await login(student);await go(student,'/courses/9001');await student.locator('.pixel-map-region').getByText('补修：同一个章节已改名',{exact:false}).waitFor();await capture(student,'student-updated-chapter');}finally{await student.close();}
  });
  await scenario('新增滑翔机关联同弹窗转 PUT，同课对象链和唯一约束保留',async p=>{
   const before=f.db.prepare('SELECT count(*) n FROM course_experiments WHERE course_id=9001').get().n,requests=trace(p,'experiments');
   await tab(p,'实验关联');await button(p,'新增滑翔机关联').click();const d=modal(p);await d.getByLabel('关联入口名称',{exact:true}).fill('补修：新增自由入口');await button(d,'保存').click();await d.getByText(/已保存 #/).waitFor();await d.locator('.ant-btn-loading').waitFor({state:'hidden'});
   const id=f.db.prepare("SELECT id FROM course_experiments WHERE label='补修：新增自由入口'").get().id;await d.getByLabel('关联入口名称',{exact:true}).fill('补修：同一入口已改名');await button(d,'保存').click();await saved(d,id);
   assert.equal(f.db.prepare('SELECT count(*) n FROM course_experiments WHERE course_id=9001').get().n,before+1);assert.equal(f.db.prepare('SELECT label FROM course_experiments WHERE id=?').get(id).label,'补修：同一入口已改名');assert.deepEqual(requests.map(r=>r.method),['POST','PUT']);
   assert.equal((await json(p,'/courses/9001/maintenance/experiments','POST',{experiment:'glider',label:'不得重复',enabled:true})).status,409);assert.equal((await json(p,'/courses/9001/maintenance/experiments/'+id,'PUT',{experiment:'glider',lessonId:90021,stage:0,label:'不得串课',enabled:true})).status,400);assert.equal(f.db.prepare('SELECT label FROM course_experiments WHERE id=?').get(id).label,'补修：同一入口已改名');await capture(p,'experiment-same-id');
  });
  await scenario('创建成功但回读失败保真实 ID，重读不 POST，再编辑仍更新同一章节和关联',async p=>{
   for(const kind of ['chapter','experiment']){
    const part=kind==='chapter'?'chapters':'experiments',table=kind==='chapter'?'course_chapters':'course_experiments',field=kind==='chapter'?'title':'label',name='补修：回读失败-'+kind,requests=trace(p,part);
    const before=f.db.prepare(`SELECT count(*) n FROM ${table} WHERE course_id=9001`).get().n;
    await tab(p,kind==='chapter'?'章节与课时':'实验关联');await button(p,kind==='chapter'?'新增章节':'新增滑翔机关联').click();const d=modal(p);
    if(kind==='experiment'){await d.getByLabel('所属课时',{exact:true}).click();await p.locator('.ant-select-dropdown').filter({visible:true}).getByText('记录实验条件',{exact:true}).click();}
    await d.getByLabel(kind==='chapter'?'名称':'关联入口名称',{exact:true}).fill(name);
    await p.route('**/courses/9001/maintenance',r=>r.request().method()==='GET'?r.fulfill({status:503,json:{error:'补修验收：创建后回读失败'}}):r.continue());
    await button(d,'保存').click();await d.getByText('已保存，列表读取失败；请重新读取，不要重复提交',{exact:true}).waitFor();const id=f.db.prepare(`SELECT id FROM ${table} WHERE ${field}=?`).get(name).id;
    await d.getByText('已保存对象 ID #'+id,{exact:true}).waitFor();assert.equal(await d.getByLabel(kind==='chapter'?'名称':'关联入口名称',{exact:true}).inputValue(),name);await capture(p,'created-read-error-'+kind);
    await p.unroute('**/courses/9001/maintenance');
    if(kind==='chapter'){await button(d,'重新读取').click();await saved(d,id);assert.equal(requests.filter(r=>r.method==='POST').length,1);}
    await d.getByLabel(kind==='chapter'?'名称':'关联入口名称',{exact:true}).fill(name+'-已更新');await button(d,'保存').click();await saved(d,id);
    assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table} WHERE course_id=9001`).get().n,before+1);assert.equal(f.db.prepare(`SELECT ${field} v FROM ${table} WHERE id=?`).get(id).v,name+'-已更新');assert.deepEqual(requests.map(r=>r.method),['POST','PUT']);await d.locator('.ant-modal-close').click();await p.locator('.maintenance-editor').waitFor({state:'hidden'});
   }
  });
  await scenario('真正创建写失败保留输入和离开提醒，重试创建后再次保存仍转更新',async(p,dialogs)=>{
   await tab(p,'章节与课时');await button(p,'新增章节').click();const d=modal(p);const before=f.db.prepare('SELECT count(*) n FROM course_chapters').get().n;
   await d.getByLabel('名称',{exact:true}).fill('补修：写失败保留输入');await p.route('**/courses/9001/maintenance/chapters',r=>r.fulfill({status:503,json:{error:'补修验收：创建写失败'}}));await button(d,'保存').click();await d.getByText('补修验收：创建写失败',{exact:true}).waitFor();assert.equal(await d.getByLabel('名称',{exact:true}).inputValue(),'补修：写失败保留输入');assert.equal(f.db.prepare('SELECT count(*) n FROM course_chapters').get().n,before);
   dialogs.accept=false;const prompts=dialogs.count;await d.locator('.ant-modal-close').click();assert.equal(dialogs.count,prompts+1);assert.equal(await d.isVisible(),true);await capture(p,'write-error-keeps-input');dialogs.accept=true;await p.unroute('**/courses/9001/maintenance/chapters');
   await button(d,'保存').click();await d.getByText(/已保存 #/).waitFor();await d.locator('.ant-btn-loading').waitFor({state:'hidden'});const id=f.db.prepare("SELECT id FROM course_chapters WHERE title='补修：写失败保留输入'").get().id;await d.getByLabel('名称',{exact:true}).fill('补修：失败恢复后同 ID');await button(d,'保存').click();await saved(d,id);assert.equal(f.db.prepare('SELECT count(*) n FROM course_chapters').get().n,before+1);
  });
  await scenario('20 份待处理上限仍有效，全部取消后不刷新可选新批次并清容量提示',async p=>{
   await tab(p,'教学资料与回放');const q=p.getByTestId('upload-resource'),before=resourceCount();
   await q.locator('input[type=file]').setInputFiles(files('补修取消',21));await q.getByText('每次最多选择 20 份资料',{exact:true}).waitFor();assert.equal(await q.getByTestId('upload-item').count(),20);
   await button(q,'取消待上传文件').click();assert.equal(await q.getByText('已取消',{exact:true}).count(),20);
   await q.locator('input[type=file]').setInputFiles(files('补修新批次',1));await q.getByTestId('upload-item').filter({hasText:'补修新批次-1.txt'}).waitFor();assert.equal(await q.getByTestId('upload-item').count(),21);assert.equal(await q.getByText('每次最多选择 20 份资料',{exact:true}).count(),0);assert.equal(resourceCount(),before);await q.getByTestId('upload-item').filter({hasText:'补修新批次-1.txt'}).scrollIntoViewIfNeeded();await capture(p,'cancelled-batch-new-selection');
  });
  await scenario('20 份成功历史保留 ID，新批次可上传且失败输入与 token 不丢，成功项不重传',async p=>{
   await tab(p,'教学资料与回放');const q=p.getByTestId('upload-resource'),before=resourceCount(),requests=[];p.on('request',r=>{if(new URL(r.url()).pathname==='/api/courses/9001/resources'&&r.method()==='POST')requests.push(r);});
   await q.locator('input[type=file]').setInputFiles(files('补修成功历史',20));await button(q,'上传待处理文件').click();await q.getByText('上传成功',{exact:true}).nth(19).waitFor();await q.locator('.ant-btn-loading').waitFor({state:'hidden'});assert.equal(resourceCount(),before+20);
   const stored=f.db.prepare("SELECT id,file_name,upload_token FROM resources WHERE file_name LIKE '补修成功历史-%' ORDER BY id").all();assert.equal(stored.length,20);
   await q.locator('input[type=file]').setInputFiles(files('补修后续批次',2));await q.getByTestId('upload-item').filter({hasText:'补修后续批次-2.txt'}).waitFor();await q.getByLabel('名称 补修后续批次-2.txt',{exact:true}).fill('失败项自填名称');await q.getByLabel('资料说明 补修后续批次-2.txt',{exact:true}).fill('失败项自填说明');
   let fail=true,failedToken;await p.route('**/courses/9001/resources',r=>{const body=r.request().postDataBuffer();if(body?.includes(Buffer.from('补修后续批次-2.txt'))&&fail){fail=false;failedToken=body.toString().match(/name="upload_token"\r\n\r\n([^\r]+)/)?.[1];return r.fulfill({status:503,json:{error:'补修验收：保留失败项'}});}return r.continue();});await button(q,'上传待处理文件').click();await q.getByText('补修验收：保留失败项',{exact:true}).waitFor();await q.locator('.ant-btn-loading').waitFor({state:'hidden'});
   assert.equal(await q.getByLabel('名称 补修后续批次-2.txt',{exact:true}).inputValue(),'失败项自填名称');assert.equal(await q.getByLabel('资料说明 补修后续批次-2.txt',{exact:true}).inputValue(),'失败项自填说明');
   await q.locator('input[type=file]').setInputFiles(files('补修容量保失败',20));await q.getByText('每次最多选择 20 份资料',{exact:true}).waitFor();assert.equal(await q.getByTestId('upload-item').count(),41);assert.equal(await q.getByLabel('资料说明 补修后续批次-2.txt',{exact:true}).inputValue(),'失败项自填说明');await p.unroute('**/courses/9001/resources');await button(q,'只重试失败项').click();await q.getByText('上传成功',{exact:true}).nth(21).waitFor();
   assert.deepEqual(f.db.prepare("SELECT id,file_name,upload_token FROM resources WHERE file_name LIKE '补修成功历史-%' ORDER BY id").all(),stored);assert.equal(resourceCount(),before+22);assert.equal(requests.length,23);
   assert.ok(failedToken);const recovered=f.db.prepare("SELECT upload_token,title,description FROM resources WHERE file_name='补修后续批次-2.txt'").get();assert.equal(recovered.upload_token,failedToken);assert.equal(recovered.title,'失败项自填名称');assert.equal(recovered.description,'失败项自填说明');await q.getByTestId('upload-item').filter({hasText:'补修后续批次-2.txt'}).scrollIntoViewIfNeeded();await capture(p,'success-history-next-batch');
  });
  await scenario('取消真实在途但已落库请求显示未确认，仍计容量并用原 token 重试不重复',async p=>{
   await tab(p,'教学资料与回放');const q=p.getByTestId('upload-resource'),before=resourceCount(),hold=gate(),committed=gate();let writes=0;
   await q.locator('input[type=file]').setInputFiles(files('补修在途',1));
   await p.route('**/courses/9001/resources',async r=>{writes++;const response=await r.fetch();committed.release();await hold.promise;await r.fulfill({response}).catch(()=>{});});
   try{await button(q,'上传待处理文件').click();await committed.promise;assert.equal(resourceCount(),before+1);const savedRow=f.db.prepare("SELECT id,upload_token FROM resources WHERE file_name='补修在途-1.txt'").get();assert.ok(savedRow.upload_token);
    await button(q,'上传待处理文件').evaluate(e=>e.click());assert.equal(writes,1);assert.equal(await button(q,'选择文件').isDisabled(),true);await button(q,'取消待上传文件').click();await q.getByText('请求结果未确认，请先核对列表',{exact:true}).waitFor();hold.release();await p.unroute('**/courses/9001/resources');
    await q.locator('input[type=file]').setInputFiles(files('补修未确认容量',20));await q.getByText('每次最多选择 20 份资料',{exact:true}).waitFor();assert.equal(await q.getByTestId('upload-item').count(),20);await button(q,'只重试失败项').click();await q.getByText('上传成功',{exact:true}).waitFor();await q.getByText('已保存对象 ID #'+savedRow.id,{exact:true}).waitFor();assert.equal(resourceCount(),before+1);assert.equal(f.db.prepare('SELECT upload_token FROM resources WHERE id=?').get(savedRow.id).upload_token,savedRow.upload_token);await capture(p,'uncertain-original-token-recovered');
   }finally{hold.release();}
  });
  await scenario('上传成功回读失败不重传，新文件选中后保历史与作用域，失权拒绝不改数据',async p=>{
   await tab(p,'教学资料与回放');const q=p.getByTestId('upload-resource'),before=resourceCount();let writes=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/courses/9001/resources'&&r.method()==='POST')writes++;});
   await q.locator('input[type=file]').setInputFiles(files('补修成功回读失败',1));await p.route('**/courses/9001/maintenance',r=>r.fulfill({status:503,json:{error:'补修验收：上传回读失败'}}));await button(q,'上传待处理文件').click();await q.getByText('已上传，列表读取失败；请重新读取，不要重新上传',{exact:true}).waitFor();const id=f.db.prepare("SELECT id FROM resources WHERE file_name='补修成功回读失败-1.txt'").get().id;
   await q.locator('input[type=file]').setInputFiles(files('补修保留新待处理',1));await q.getByTestId('upload-item').filter({hasText:'补修保留新待处理-1.txt'}).waitFor();await q.getByText('已保存对象 ID #'+id,{exact:true}).waitFor();await p.unroute('**/courses/9001/maintenance');await button(q,'重新读取').click();await q.getByText('已上传，列表读取失败；请重新读取，不要重新上传',{exact:true}).waitFor({state:'hidden'});assert.equal(writes,1);assert.equal(resourceCount(),before+1);
   f.db.prepare('UPDATE courses SET created_by=3 WHERE id=9001').run();f.db.prepare('UPDATE lessons SET instructor_id=3 WHERE course_id=9001').run();try{const rejected=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/courses/9001/resources'&&r.request().method()==='POST');await button(q,'上传待处理文件').click();assert.equal((await rejected).status(),403);await q.getByText('上传失败，可重试',{exact:true}).waitFor();assert.equal(resourceCount(),before+1);await button(p.getByTestId('content-maintenance').locator('header'),'重新读取').click();await p.getByText('课程不存在或已不在负责范围',{exact:true}).waitFor();assert.equal(await p.getByTestId('content-maintenance').count(),0);}finally{f.db.prepare('UPDATE courses SET created_by=2 WHERE id=9001').run();f.db.prepare('UPDATE lessons SET instructor_id=2 WHERE course_id=9001').run();}await capture(p,'permission-loss-clears-queue');
  });
  assert.deepEqual(pageErrors,[]);
 }finally{writeFileSync(path.join(out,`browser-${run}.json`),JSON.stringify({run,browser:f.browser.version(),records,pageErrors,data:'fresh isolated fixture; existing 4174 never stopped or restarted'},null,2)+'\n');await f.close();}
});
