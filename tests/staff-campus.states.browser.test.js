import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';
test('校园管理端：作用域、吸顶、输入与portal交互',{timeout:240000},async t=>{
 const f=prepareMentorFixture(3557,4587),db=new Database(f.env.DB_PATH),out=path.join(root,'docs/staff-campus/regression-states');fs.mkdirSync(out,{recursive:true});
 db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) SELECT 10009,'visual_media',password_hash,'合成视觉新媒体','media' FROM users WHERE id=10001").run();
 db.prepare("UPDATE courses SET public_theme='forest' WHERE id=91001").run();
 const runtime=await serveFixture(f,3557,4587),browser=await chromium.launch({channel:'msedge',headless:true}),records=[],errors=[];
 const login=async role=>{const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto(runtime.base+'/login');await p.getByLabel('账号',{exact:true}).fill(role==='media'?'visual_media':'mentor_review_'+role);await p.getByLabel('密码',{exact:true}).fill(f.password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return p;};
 const scene=async(name,fn)=>{await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){records.push({name,status:'failed',error:e.message});throw e;}});};
 const geometry=()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};};
  const title=document.querySelector('.course-maintenance-page > .course-detail-header'),workspace=document.querySelector('.course-workspace-context');
  return{width:innerWidth,height:innerHeight,scrollY,position:getComputedStyle(title).position,top:getComputedStyle(title).top,title:rect(title),info:rect(title.nextElementSibling),header:rect(document.querySelector('.staff-header')),workspace:rect(workspace),tabs:rect(document.querySelector('.maintenance-workspace > .ant-tabs > .ant-tabs-nav'))};
 };
 const assertFlow=g=>{
  assert.equal(g.position,'relative','课程标题保持正常文档流，不增加第二层吸顶');
  assert.ok(g.top==='auto'||parseFloat(g.top)===0,'课程标题不得因顶栏高度相对下移：'+JSON.stringify(g));
  assert.ok(g.title.bottom<=g.info.top+1,'课程标题遮挡紧随的信息卡：'+JSON.stringify(g));
  assert.ok(g.info.bottom<=g.workspace.top+1,'工作区栏遮挡课程信息：'+JSON.stringify(g));
  assert.ok(g.workspace.bottom<=g.tabs.top+1,'首屏工作区栏遮挡页签正文：'+JSON.stringify(g));
 };
 const layoutRecords=[];
 try{
 for(const role of['admin','mentor'])await scene(role+'：五入口与1440/768/390/360/横屏；吸顶偏移跟随真实顶栏高度',async()=>{
  const p=await login(role);try{
   await p.goto(runtime.base+'/courses');await p.locator('a[href="/courses/91001"]').click();await p.getByRole('tab',{name:'课程概览',exact:true}).waitFor();
   for(const label of['课程概览','课时与内容','课程共享资料','学员与授权','视觉主题与学生预览','课程奖励']){
    await p.getByRole('tab',{name:label,exact:true}).click();await p.getByRole('button',{name:'返回上一页',exact:true}).press('Control+Home');
    const g=await p.evaluate(geometry);assertFlow(g);layoutRecords.push({role,entry:'list-and-six-tabs',tab:label,...g});
   }
   for(const[width,height]of[[1440,900],[768,1024],[390,844],[360,640],[844,390]]){
   await p.setViewportSize({width,height});await p.goto(runtime.base+'/courses/91001?tab=maintenance');await p.getByRole('button',{name:'新建课时',exact:true}).waitFor();
   if(width<768)await p.locator('.staff-sidebar').waitFor({state:'hidden'});
   await p.waitForFunction(()=>{const h=document.querySelector('.staff-header'),c=document.querySelector('.course-workspace-context');return h&&c&&Math.abs(parseFloat(getComputedStyle(c).top)-h.getBoundingClientRect().height)<1.1&&document.documentElement.scrollWidth<=innerWidth;});
   await p.getByRole('button',{name:'返回上一页',exact:true}).press('Control+Home');
   const top=await p.evaluate(geometry);assert.equal(top.scrollY,0);assert.equal(top.width,width);assert.equal(top.height,height);assertFlow(top);layoutRecords.push({role,entry:'direct',phase:'top',...top});
   assert.equal(await p.locator('.staff-sidebar [role=menuitem]').count(),5);assert.equal(await p.locator('.staff-sidebar .staff-pixel-icon').count(),6); // brand plus five existing navigation targets
   assert.equal(await p.evaluate(()=>document.body.dataset.staffCampus),'true');assert.equal(await p.locator('[data-space-theme]').first().getAttribute('data-space-theme'),'campus');
   await p.screenshot({path:path.join(out,role+'-maintenance-'+width+'.png'),animations:'disabled'});
   await p.mouse.move(width-35,height-30);await p.mouse.wheel(0,Math.ceil(top.workspace.top+300));
   await p.waitForFunction(()=>{const h=document.querySelector('.staff-header').getBoundingClientRect(),w=document.querySelector('.course-workspace-context').getBoundingClientRect();return scrollY>0&&Math.abs(w.top-h.bottom)<=1.1;});
   const scrolled=await p.evaluate(geometry);assert.ok(scrolled.scrollY>0);assert.ok(Math.abs(scrolled.workspace.top-scrolled.header.bottom)<=1.1,'滚动后工作区栏必须紧接真实顶栏');assert.ok(scrolled.title.bottom<=scrolled.info.top+1);layoutRecords.push({role,entry:'direct',phase:'scrolled',...scrolled});
   await p.screenshot({path:path.join(out,role+'-maintenance-'+width+'-scrolled.png'),animations:'disabled'});
  }}finally{await p.context().close();}
 });
 await scene('hover/press/focus与减少运动；输入和disabled不缩放，真实弹窗Escape后回焦',async()=>{
  const p=await login('admin');try{await p.goto(runtime.base+'/courses/91001?tab=maintenance');const open=p.getByRole('button',{name:'课时基本信息与关卡图',exact:true});await open.click();const modal=p.getByRole('dialog');await modal.waitFor();const input=modal.getByLabel('名称',{exact:true}),disabled=modal.getByRole('button',{name:'上传并保留到当前表单',exact:true});
   const baseline=await input.evaluate(e=>({transform:getComputedStyle(e).transform,scale:getComputedStyle(e).scale,translate:getComputedStyle(e).translate}));await input.hover();assert.deepEqual(await input.evaluate(e=>({transform:getComputedStyle(e).transform,scale:getComputedStyle(e).scale,translate:getComputedStyle(e).translate})),baseline);
   await disabled.hover();assert.equal(await disabled.isDisabled(),true);assert.equal(await disabled.evaluate(e=>getComputedStyle(e).scale),'none');
   const close=modal.getByRole('button',{name:'关闭',exact:true});await close.hover();await p.waitForFunction(()=>{const e=document.querySelector('.ant-modal-close');return parseFloat(getComputedStyle(e).scale)>1.02;});
   const box=await close.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.ant-modal-close')).scale)<.99);await p.mouse.up();await modal.waitFor({state:'hidden'});
   await open.click();await modal.waitFor();await p.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await open.evaluate(e=>e===document.activeElement),true);
   await p.emulateMedia({reducedMotion:'reduce'});await open.hover();assert.equal(await open.evaluate(e=>getComputedStyle(e).scale),'none');await open.focus();assert.notEqual(await open.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
   await p.getByRole('button',{name:'通知',exact:true}).click();await p.getByRole('button',{name:'通知',exact:true}).press('Escape');assert.equal(await p.getByRole('button',{name:'通知',exact:true}).getAttribute('aria-expanded'),'false');
  }finally{await p.context().close();}
 });
 await scene('课程预览保留森林主题，通用后台始终校园；切换手机预览真实加载原图',async()=>{
  const p=await login('mentor');try{await p.goto(runtime.base+'/courses/91001?tab=visual');await p.getByRole('combobox',{name:'主题适配预览',exact:true}).click();await p.locator('.ant-select-item-option-content').getByText('手机预览 · 9:16',{exact:true}).click();await p.waitForFunction(()=>document.querySelector('img.course-theme-base,.course-theme-base img')?.currentSrc.includes('forest-mobile'));assert.equal(await p.locator('[data-space-theme]').first().getAttribute('data-space-theme'),'campus');assert.match(await p.locator('.staff-content').evaluate(e=>getComputedStyle(e,'::before').backgroundImage),/staff-campus/);assert.notEqual(await p.locator('.course-theme-preview').evaluate(e=>getComputedStyle(e).getPropertyValue('background-image')),'url("/assets/staff-campus/campus-workspace-1536.webp")');}finally{await p.context().close();}
 });
 await scene('学生、教师与新媒体不挂管理端类名，退出后清除portal角色标志',async()=>{
  for(const role of['student','teacher','media']){const p=await login(role);try{await p.goto(runtime.base+(role==='teacher'?'/observer/students/10004':role==='student'?'/explore':'/dashboard'));await p.locator('main,.staff-content,[data-student-scope]').first().waitFor();assert.equal(await p.locator('.staff-campus-ui').count(),0);assert.equal(await p.evaluate(()=>document.body.dataset.staffCampus),undefined);}finally{await p.context().close();}}
  const p=await login('admin');try{await p.getByRole('button',{name:'账户菜单',exact:true}).click();await p.getByRole('menuitem',{name:'退出登录',exact:true}).click();await p.getByLabel('账号',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.body.dataset.staffCampus),undefined);}finally{await p.context().close();}
 });
 assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,layoutRecords,scope:'Real Edge + temporary SQLite; no teaching,4190,4187 writes'},null,2));await browser.close();await runtime.close();db.close();}
});
