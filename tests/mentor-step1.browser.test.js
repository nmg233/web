import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';
test('导师第一步：办课与学校账号真实浏览器',{timeout:180000},async t=>{
 const f=prepareMentorFixture(),runtime=await serveFixture(f),db=new Database(f.env.DB_PATH),out=path.join(root,'docs/mentor-workspace/step-01/evidence');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),mentor=await browser.newPage({viewport:{width:1440,height:1000}}),admin=await browser.newPage(),teacher=await browser.newPage();const errors=[],records=[];
 for(const p of[mentor,admin,teacher]){p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));}
 const login=async(p,role)=>{await p.goto(runtime.base+'/login');await p.getByLabel('账号',{exact:true}).fill('mentor_review_'+role);await p.getByLabel('密码',{exact:true}).fill(f.password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(url=>url.pathname!='/login');};
 const shot=async(name,p=mentor)=>{await p.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});};
 const scene=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){failure=e;records.push({name,status:'failed',error:e.message});await shot('failure');fs.writeFileSync(path.join(out,'layout-failure.json'),JSON.stringify(await mentor.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,class:el.className,text:el.innerText?.slice(0,100),right:el.getBoundingClientRect().right,left:el.getBoundingClientRect().left})).filter(v=>v.right>innerWidth+1||v.left<0)})),null,2));throw e;}});if(failure)throw failure;};
 try{
 await login(mentor,'mentor');
 await scene('五项导航展开、收起、悬浮及键盘，统计与完整列表可刷新',async()=>{
  await mentor.getByRole('heading',{name:'办课工作台',exact:true}).waitFor();const menu=mentor.locator('.staff-sidebar').getByRole('menu');assert.equal(await menu.getByRole('menuitem').count(),5);
  for(const label of['工作台','课程管理','教学与成长','学校与账号','使用指引'])assert.equal(await menu.getByRole('menuitem',{name:label,exact:true}).locator('.anticon').count(),1);
  await mentor.getByRole('button',{name:/所管课程/}).click();await mentor.getByRole('link',{name:'导师课程A · 隔离验收',exact:true}).waitFor();assert.equal(await mentor.getByRole('link',{name:'导师课程B · 隔离验收',exact:true}).count(),0);
  await mentor.getByRole('button',{name:'刷新工作台',exact:true}).click();await mentor.getByText(/最后更新/).waitFor();await shot('01-dashboard-1440');
  await mentor.locator('.ant-layout-sider-trigger').click();const guide=menu.getByRole('menuitem',{name:'使用指引',exact:true});await guide.hover();await mentor.getByRole('tooltip').filter({hasText:'使用指引'}).waitFor();await guide.focus();await mentor.keyboard.press('Enter');await mentor.getByRole('heading',{name:'办课使用指引',exact:true}).waitFor();await mentor.mouse.move(600,200);await shot('02-collapsed-guide');
 });
 await scene('学校组织账号分区与课程学生分开，导师能开建教师表单',async()=>{
  await mentor.goto(runtime.base+'/mentor/organization?section=accounts&school=7001');await mentor.getByRole('heading',{name:'组织账号与教师观察',exact:true}).waitFor();await mentor.getByRole('button',{name:'新建本校教师',exact:true}).click();const modal=mentor.getByRole('dialog',{name:'新建本校教师',exact:true});await modal.getByLabel('教师姓名',{exact:true}).fill('浏览器验收教师');await modal.getByLabel('本校班级',{exact:true}).selectOption('7001');await modal.getByRole('button',{name:'保存到服务器',exact:true}).click();await mentor.getByText('教师账号已建立；尚无观察范围，请继续明确选择学生和课程。',{exact:true}).waitFor();await mentor.getByRole('button',{name:'关闭凭据',exact:true}).click();await shot('03-school-accounts');
 });
 await scene('课程六页签保留、上线学校可真实保存，新建课落在概览',async()=>{
  await mentor.goto(runtime.base+'/courses/91001?tab=students');await mentor.getByText('课程上线学校范围',{exact:true}).waitFor();await mentor.getByLabel('范围调整说明',{exact:true}).fill('浏览器核对当前上线学校');await mentor.getByRole('button',{name:'保存上线学校范围',exact:true}).click();await mentor.getByText('上线学校范围已保存到服务器，未自动报名或发布课程',{exact:true}).waitFor();assert.equal(db.prepare('SELECT school_scope_revision FROM courses WHERE id=91001').get().school_scope_revision,2);await shot('04-course-school-scope');
  await mentor.goto(runtime.base+'/courses/create');await mentor.getByLabel('课程名称',{exact:true}).fill('浏览器新课草稿');await mentor.getByLabel('适用学段',{exact:true}).click();await mentor.locator('.ant-select-item-option-content').filter({hasText:/^初中$/}).click();await mentor.getByLabel('难度等级',{exact:true}).click();await mentor.locator('.ant-select-item-option-content').filter({hasText:/基础/}).click();await mentor.locator('button[type=submit]').click();await mentor.waitForURL(url=>/\/courses\/\d+$/.test(url.pathname)&&url.searchParams.get('tab')==='overview');await mentor.getByRole('tab',{name:'课程概览',exact:true}).waitFor();
 });
 await scene('教师仅看到明确课程，admin可进入同一办学工具',async()=>{
  await login(teacher,'teacher');await teacher.goto(runtime.base+'/observer/students/10004');await teacher.getByText('导师课程A · 隔离验收',{exact:true}).first().waitFor();assert.equal(await teacher.getByText('导师课程B · 隔离验收',{exact:true}).count(),0);
  await login(admin,'admin');await admin.goto(runtime.base+'/admin/organization?section=school-accounts');await admin.getByRole('heading',{name:'组织账号与教师观察',exact:true}).waitFor();assert.equal(await admin.getByLabel('账号管理学校').locator('option').count(),5); // seed schools plus two explicit synthetic schools
 });
 await scene('1440、768、390与360窄屏、短屏和横屏侧栏可唤起，正文不横向溢出',async()=>{
  await mentor.goto(runtime.base+'/mentor/guide');
  for(const[width,height]of[[1440,1000],[768,1024],[390,844],[360,640],[844,390]]){
   await mentor.setViewportSize({width,height});await mentor.getByRole('heading',{name:'办课使用指引',exact:true}).waitFor();await mentor.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.equal(await mentor.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width<768){await mentor.locator('.ant-layout-sider-zero-width-trigger').click();await mentor.locator('.staff-sidebar').getByRole('menuitem',{name:'教学与成长',exact:true}).click();await mentor.getByRole('heading',{name:'教学与成长',exact:true}).waitFor();await mentor.goto(runtime.base+'/mentor/guide');}
   await shot('05-guide-'+width+'x'+height);
  }
 });
 await scene('管理员学生转校先看到现有课程影响，不保存不改变组织或报名',async()=>{
  const before=db.prepare('SELECT school_id FROM users WHERE id=10004').get();
  await admin.goto(runtime.base+'/students/10004');await admin.getByRole('button',{name:/编辑分配/}).click();
  const modal=admin.getByRole('dialog');await modal.getByLabel('所属学校',{exact:true}).click();await admin.locator('.ant-select-item-option-content').filter({hasText:'合成验收学校7002'}).click();
  await modal.getByText('当前课程报名及访问保持；新校不会自动加入课程',{exact:true}).waitFor();await modal.getByText(/本次影响的课程：/).waitFor();
  await admin.locator('.ant-modal-close').click();assert.deepEqual(db.prepare('SELECT school_id FROM users WHERE id=10004').get(),before);
 });
 assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,scope:'New temporary synthetic fixture; existing teaching services untouched'},null,2));await browser.close();await runtime.close();db.close();}
});
