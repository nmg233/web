import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';
const catalog=JSON.parse(fs.readFileSync(path.join(root,'content/mentor-workspace/copy.json'))).entries,T=id=>catalog['mentor.SchoolAccounts.'+id].text;
test('二次复核：观察撤销及教师迁校网页链路',{timeout:180000},async t=>{
 const f=prepareMentorFixture(3537,4567),runtime=await serveFixture(f,3537,4567),db=new Database(f.env.DB_PATH),browser=await chromium.launch({channel:'msedge',headless:true}),out=path.join(root,'docs/mentor-workspace/observer-revoke-20261018/evidence'),records=[],errors=[];fs.mkdirSync(out,{recursive:true});
 const login=async(name='mentor_review_admin')=>{const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto(runtime.base+'/login');await p.getByLabel('账号',{exact:true}).fill(name);await p.getByLabel('密码',{exact:true}).fill(f.password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return p;};
 const call=async(p,url,body,method=body?'POST':'GET')=>{const token=await p.evaluate(()=>localStorage.getItem('token')),r=await fetch(runtime.base+'/api'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};};
 const shot=async(name,p)=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});};
 const org=async p=>{await p.goto(runtime.base+'/admin/organization?section=school-accounts');await p.getByLabel(T('a8e26cee89be'),{exact:true}).selectOption('7001');await p.getByRole('button',{name:T('bc4e4482a178'),exact:true}).waitFor();};
 const grantRow=(p,name)=>p.getByRole('row').filter({hasText:name}).filter({hasText:'导师课程A · 隔离验收'});
 const save=async(p,modal)=>{const waiting=p.waitForResponse(r=>r.url().includes('/schools/7001/observers')&&r.request().method()==='POST');await modal.getByRole('button',{name:T('52d6949c89a3'),exact:true}).click();const r=await waiting;assert.equal(r.status(),200,await r.text());await modal.waitFor({state:'hidden'});};
 const scene=async(name,fn)=>{if(process.env.PBL_REVOKE_ONLY&&!name.includes(process.env.PBL_REVOKE_ONLY))return;await t.test(name,async()=>{const pages=[];try{await fn(pages);records.push({name,status:'passed'});}catch(e){records.push({name,status:'failed',error:e.message});for(let i=0;i<pages.length;i++)await shot('failure-'+records.length+'-'+i,pages[i]);throw e;}finally{for(const p of pages)await p.context().close();}});};
 try{
 await scene('完整链路：网页建立授权→网页移除报名→既有行撤销→网页迁校→重新登录拒绝旧校',async pages=>{
  db.prepare("INSERT INTO users(id,username,password_hash,real_name,role,school_id,class_id) SELECT 12001,'observer_transfer',password_hash,'合成迁校教师','teacher',7001,7001 FROM users WHERE id=10005").run();db.prepare("INSERT INTO school_created_teachers(teacher_id,actor_id,school_id,request_key,fingerprint) VALUES(12001,10002,7001,'observer-transfer','synthetic')").run();
  const admin=await login();pages.push(admin);await org(admin);await admin.getByRole('button',{name:T('bc4e4482a178'),exact:true}).click();let modal=admin.getByRole('dialog');
  for(const[label,id]of[[T('a6654120cbec'),'12001'],[T('13a58ec2074e'),'10004'],[T('60db1afb4022'),'91001']])await modal.getByLabel(label,{exact:true}).selectOption(id);
  await modal.getByLabel(T('237a65af0dd8'),{exact:true}).selectOption('true');await modal.getByLabel(T('1dcd54b5f54a'),{exact:true}).fill('合成验收：仅建立此教师此课程观察');await save(admin,modal);
  const original=db.prepare('SELECT * FROM teacher_observation_grants WHERE teacher_id=12001').get();assert.equal(original.active,1);assert.equal(original.revision,1);
  const observer=await login('observer_transfer');pages.push(observer);await observer.goto(runtime.base+'/observer/students/10004');await observer.getByText('导师课程A · 隔离验收',{exact:true}).first().waitFor();
  const enrollment=db.prepare('SELECT * FROM enrollments WHERE student_id=10004 AND course_id=91001').get();
  await admin.goto(runtime.base+'/courses/91001?tab=students');const row=admin.getByRole('row').filter({hasText:'合成验收student'});await row.getByRole('button').click();modal=admin.getByRole('dialog');await modal.getByRole('textbox').fill('合成验收：移除尚无学习历史的错误报名');
  const removing=admin.waitForResponse(r=>r.url().endsWith(`/enrollments/${enrollment.id}`)&&r.request().method()==='DELETE');await modal.locator('.ant-modal-footer .ant-btn-primary').click();assert.equal((await removing).status(),200);await modal.waitFor({state:'hidden'});
  assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(enrollment.id).status,'removed');
  const blocked=await call(admin,'/students/users/12001',{real_name:'合成迁校教师',role:'teacher',school_id:7002,class_id:7002},'PUT');assert.equal(blocked.status,409);assert.match(blocked.data.error,/观察职责/);
  await org(admin);await grantRow(admin,'合成迁校教师').getByRole('button',{name:T('02ec04427d81'),exact:true}).click();modal=admin.getByRole('dialog');
  assert.equal(await modal.getByLabel(T('a6654120cbec'),{exact:true}).inputValue(),'12001');assert.equal(await modal.getByLabel(T('13a58ec2074e'),{exact:true}).inputValue(),'10004');
  await modal.getByLabel(T('237a65af0dd8'),{exact:true}).selectOption('false');await modal.getByLabel(T('1dcd54b5f54a'),{exact:true}).fill('合成验收：报名已移除，撤销已有观察后迁校');await shot('01-existing-grant-revoke',admin);await save(admin,modal);
  const revoked=db.prepare('SELECT * FROM teacher_observation_grants WHERE teacher_id=12001').get();assert.equal(revoked.active,0);assert.equal(revoked.revision,2);for(const k of['school_id','source','actor_id'])assert.equal(revoked[k],original[k]);
  const audits=db.prepare('SELECT * FROM teacher_observation_events WHERE teacher_id=12001 ORDER BY id').all();assert.equal(audits.length,2);assert.equal(audits[1].actor_id,10001);assert.equal(audits[1].active,0);assert.match(audits[1].reason,/报名已移除/);
  await grantRow(admin,'合成迁校教师').getByText(T('fef96e34f77b'),{exact:true}).waitFor();await shot('02-revoked-history',admin);
  await admin.goto(runtime.base+'/students/12001');await admin.getByRole('button',{name:/编辑资料/}).click();modal=admin.getByRole('dialog',{name:'编辑账号资料',exact:true});await modal.getByLabel('学校',{exact:true}).click();await admin.locator('.ant-select-item-option-content').filter({hasText:'合成验收学校7002'}).click();await modal.getByLabel('班级',{exact:true}).click();await admin.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:'合成七一班'}).click();
  const moving=admin.waitForResponse(r=>r.url().endsWith('/students/users/12001')&&r.request().method()==='PUT');await modal.locator('.ant-modal-footer .ant-btn-primary').click();assert.equal((await moving).status(),200);await modal.waitFor({state:'hidden'});assert.equal(db.prepare('SELECT school_id FROM users WHERE id=12001').get().school_id,7002);await shot('03-teacher-transferred',admin);
  await observer.goto(runtime.base+'/observer/students/10004');await observer.locator('.ant-result-subtitle').filter({hasText:'学生不存在或未分配给当前教师'}).waitFor();
  const fresh=await login('observer_transfer');pages.push(fresh);await fresh.goto(runtime.base+'/observer/students/10004');await fresh.locator('.ant-result-subtitle').filter({hasText:'学生不存在或未分配给当前教师'}).waitFor();await shot('04-new-login-denied',fresh);
  assert.equal((await call(fresh,'/observer/students/10004')).status,404);assert.equal((await call(fresh,'/learning/lessons/91001/preview')).status,403);assert.equal(db.prepare('SELECT count(*) n FROM enrollments WHERE student_id=10004 AND course_id=91001').get().n,1);assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(enrollment.id).status,'removed');assert.equal(db.prepare("SELECT count(*) n FROM growth_records WHERE student_id=10004 AND description LIKE '%合成验收：移除尚无学习历史%' ").get().n,1);
 });
 await scene('候选缺失：停用学生已不在可选列表，既有授权行仍显示原对象并能撤销',async pages=>{
  const admin=await login();pages.push(admin);db.prepare('UPDATE users SET is_active=0 WHERE id=10004').run();await org(admin);
  const listing=await call(admin,'/mentor-workspace/schools/7001/observers');assert.equal(listing.data.students.some(s=>s.id===10004),false);
  await grantRow(admin,'合成验收teacher').getByRole('button',{name:T('02ec04427d81'),exact:true}).click();const modal=admin.getByRole('dialog');
  for(const[label,id,name]of[[T('a6654120cbec'),'10005','合成验收teacher'],[T('13a58ec2074e'),'10004','合成验收student'],[T('60db1afb4022'),'91001','导师课程A']]){
   const field=modal.getByLabel(label,{exact:true});assert.equal(await field.inputValue(),id);assert.equal(await field.isDisabled(),true);assert.match(await field.locator('option:checked').innerText(),new RegExp(name));
  }
  await modal.getByLabel(T('237a65af0dd8'),{exact:true}).selectOption('false');await modal.getByLabel(T('1dcd54b5f54a'),{exact:true}).fill('合成验收：清理不在新授权候选中的原记录');await shot('05-missing-candidate-preserved',admin);await save(admin,modal);assert.equal(db.prepare('SELECT active FROM teacher_observation_grants WHERE teacher_id=10005 AND student_id=10004 AND course_id=91001').get().active,0);assert.equal(db.prepare('SELECT is_active FROM users WHERE id=10004').get().is_active,0);
 });
 assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,pageErrors:errors,scope:'Real Edge + temporary Express/SQLite; no teaching or4187 writes'},null,2));await browser.close();await runtime.close();db.close();}
});
