import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
const base='http://127.0.0.1:5201',out=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-screenshots'),'step02-screenshots');
const gate=()=>{let release;return{promise:new Promise(r=>release=r),release};};
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(url);}
async function shot(p,name){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});}
test('第二步：真实页面加载、局部错误、空数据与关键动作',{timeout:180000},async t=>{
 const {env}=fixture(3149,5201),db=new Database(env.DB_PATH),children=[];let browser;mkdirSync(out,{recursive:true});
 const start=(args,cwd=root)=>{const c=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'pipe'});c.stdout.resume();c.stderr.resume();children.push(c);};
 try{
  start(['scripts/local-server.cjs']);start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5201','--strictPort'],path.join(root,'frontend'));await Promise.all([ready(base),ready('http://127.0.0.1:3149/api/health')]);browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});p.setDefaultTimeout(10000);
  await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill('student_wang');await p.getByLabel('密码',{exact:true}).fill('student123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/explore/);
  await t.test('各主要页面保留真实加载与局部接口错误，重试可恢复',async()=>{
   for(const [name,url,pattern]of [['learning','/courses/9001/lessons/90011/learn','**/course-spaces/9001/learning/lessons/90011'],['works','/courses/9001/works','**/course-spaces/9001/works'],['work-detail','/courses/9001/works/9001','**/course-spaces/9001/works/9001'],['work-upload','/courses/9001/works/upload?task_id=9002&parent_work_id=9001','**/course-spaces/9001/tasks/9002'],['flight','/courses/9001/glider','**/course-spaces/9001/glider/capabilities'],['archive','/courses/9001/archives','**/course-spaces/9001/archives/generate'],['reflection','/courses/9001/reflection','**/course-spaces/9001/archives/reflection']]){
    const match=pattern+(name==='works'||name==='archive'?'*':'');
    const hold=gate(),entered=gate();await p.route(match,async r=>{entered.release();await hold.promise;await r.continue().catch(()=>{});});await p.goto(base+url);await Promise.race([entered.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('请求未匹配 '+match)),10000))]);await shot(p,name+'-loading');hold.release();await p.unroute(match);await p.waitForTimeout(250);
    await p.route(match,r=>r.fulfill({status:503,json:{error:'隔离验收：此处服务暂时不可用'}}));await p.reload();await p.getByText('隔离验收：此处服务暂时不可用',{exact:false}).first().waitFor();await shot(p,name+'-error');await p.unroute(match);await p.reload();await p.locator('.course-robot').waitFor();
   }
  });
  await t.test('下载附件 404 保留学习；机器人不会挡住下载及主要操作',async()=>{
   await p.goto(base+'/courses/9001/lessons/90011/learn');const button=p.getByRole('button',{name:'下载资料',exact:true});await button.waitFor();for(const size of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:360,height:800},{width:844,height:390}]){await p.setViewportSize(size);await button.evaluate(e=>e.scrollIntoView({block:'center'}));await p.waitForTimeout(100);assert.ok(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit);}),JSON.stringify(size));}await p.setViewportSize({width:1440,height:900});await button.click();await p.getByText('下载失败',{exact:false}).first().waitFor();assert.equal(await p.locator('.study-stages').count(),1);await shot(p,'learning-attachment-404');await p.getByRole('button',{name:'我已完成课堂回顾',exact:true}).click();await p.getByRole('radio',{name:'正确',exact:true}).waitFor();await shot(p,'learning-card-action');
  });
  await t.test('长成果文字、真实上传失败保输入，恢复可提交新版本',async()=>{
   await p.goto(base+'/courses/9001/works/upload?task_id=9002&parent_work_id=9001');await p.getByLabel('作品名称',{exact:true}).waitFor();
   for(const [width,height]of [[1440,900],[768,1024],[390,844],[360,800],[844,390]]){await p.setViewportSize({width,height});await shot(p,'work-upload-'+width);}await p.setViewportSize({width:1440,height:900});
   await p.getByLabel('作品名称',{exact:true}).fill('第二步长记录（测试）');const text='自己的比较证据与改进理由。'.repeat(100);await p.getByLabel('成果文字',{exact:true}).fill(text);await p.locator('input[type=file]').setInputFiles({name:'step02-synthetic-test.txt',mimeType:'text/plain',buffer:Buffer.from('隔离合成验收附件')});await p.route('**/course-spaces/9001/works',r=>r.request().method()==='POST'?r.fulfill({status:503,json:{error:'隔离验收：附件上传未完成，请重试'}}):r.continue());await p.getByRole('button',{name:'提交作品',exact:true}).click();await p.getByText('附件上传未完成',{exact:false}).first().waitFor();assert.equal(await p.getByLabel('成果文字',{exact:true}).inputValue(),text);await shot(p,'work-upload-submit-error');await p.unroute('**/course-spaces/9001/works');
   await p.getByRole('button',{name:'提交作品',exact:true}).click();await p.getByText('Unsupported file type',{exact:false}).first().waitFor();assert.equal(await p.getByLabel('成果文字',{exact:true}).inputValue(),text);assert.equal(db.prepare('SELECT max(version) v FROM works WHERE task_id=9002').get().v,1);await shot(p,'work-upload-type-rejected');
   await p.locator('input[type=file]').setInputFiles({name:'step02-synthetic-test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYxoAAAAASUVORK5CYII=','base64')});await p.getByRole('button',{name:'提交作品',exact:true}).click();await p.waitForURL(/lessons\/90013\/learn/);assert.equal(db.prepare('SELECT max(version) v FROM works WHERE task_id=9002').get().v,2);await shot(p,'work-version-created');
  });
  await t.test('档案空作品与缺失反馈真实降级；反思每日一次限制',async()=>{
   await p.goto(base+'/courses/9001/archives');await p.getByRole('tab',{name:'导师反馈',exact:true}).click();await shot(p,'archive-empty-feedback');db.prepare('DELETE FROM works WHERE student_id=4 AND enrollment_id=9002').run();await p.goto(base+'/courses/9002/works');await p.getByText('暂无作品',{exact:false}).first().waitFor();await shot(p,'works-empty');
   db.prepare("INSERT INTO reflections(student_id,enrollment_id,lesson_id,difficulty) VALUES(4,9001,90013,'隔离测试：今日已有反思')").run();await p.goto(base+'/courses/9001/reflection');await p.getByLabel('遇到的困难',{exact:true}).fill('此条不能越过真实每日次数限制');await p.getByRole('button',{name:'提交反思日志',exact:true}).click();await p.getByText('每日限提交1篇',{exact:false}).first().waitFor();assert.equal(db.prepare('SELECT count(*) n FROM reflections WHERE student_id=4 AND enrollment_id=9001').get().n,1);await shot(p,'reflection-limit');
  });
  await t.test('实验注册页共享真实权限加载、网络错误及课程撤回清理',async()=>{
   const hold=gate(),entered=gate();await p.route('**/api/courses',async r=>{entered.release();await hold.promise;await r.continue().catch(()=>{});});await p.goto(base+'/courses/9001/lab');await entered.promise;await shot(p,'lab-scope-loading');hold.release();await p.unroute('**/api/courses');await p.locator('.lab-experiment').waitFor();
   await p.route('**/api/courses',r=>r.fulfill({status:503,json:{error:'隔离验收：课程授权暂时无法核验'}}));await p.reload();await p.getByText('暂时无法确认账号与课程',{exact:true}).waitFor();await shot(p,'lab-scope-error');await p.unroute('**/api/courses');await p.getByRole('button',{name:'重新检查',exact:true}).click();await p.locator('.lab-experiment').waitFor();
   db.prepare("UPDATE courses SET status='draft' WHERE id=9001").run();await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.getByRole('button',{name:'重新检查',exact:true}).waitFor();assert.equal(await p.locator('.lab-experiment').count(),0);assert.equal(await p.locator('.course-robot').count(),0);await shot(p,'lab-withdrawn');db.prepare("UPDATE courses SET status='published' WHERE id=9001").run();await p.getByRole('button',{name:'重新检查',exact:true}).click();await p.locator('.lab-experiment').waitFor();
  });
 }finally{if(browser)await browser.close();db.close();for(const c of children)c.kill();}
});
