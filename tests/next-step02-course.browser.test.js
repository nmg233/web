import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';
const out=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/next-version/step-02/course-browser'));fs.mkdirSync(out,{recursive:true});
test('可视化课程介绍真实保存、读失败保持草稿和封面替换原生命周期',{timeout:120000},async()=>{
 const f=fixture(3174,4204),source=path.join(root,'test-results/step02-course-source.json');fs.writeFileSync(source,JSON.stringify({db:f.env.DB_PATH,scratch:f.scratch}));
 const rel='.local/step02-course-'+Date.now(),dir=path.join(root,rel);execFileSync(process.execPath,['scripts/teaching.mjs','init','--source',source,'--data',rel],{cwd:root,stdio:'pipe',windowsHide:true});
 const configFile=path.join(dir,'private.json'),config=JSON.parse(fs.readFileSync(configFile));Object.assign(config,{apiPort:3174,frontPort:4204});fs.writeFileSync(configFile,JSON.stringify(config));
 const db=new Database(path.join(dir,'teaching.db')),id=JSON.parse(fs.readFileSync(path.join(dir,'import-report.json'))).courseId;
 const child=spawn(process.execPath,['scripts/teaching.mjs','start','--data',rel],{cwd:root,stdio:'pipe',windowsHide:true});child.stdout.resume();child.stderr.resume();let browser;
 try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4204')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('request',r=>{if(r.method()==='PUT')console.log('SYNTHETIC_COURSE_WRITE',r.url(),r.postData());});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4204/login');await p.getByLabel('账号',{exact:true}).fill('mentor_zhang');await p.getByLabel('密码',{exact:true}).fill('mentor123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
 await p.goto(`http://127.0.0.1:4204/courses/${id}?tab=maintenance`);await p.getByTestId('content-maintenance').waitFor();
 const form=p.locator('form').filter({has:p.locator('textarea[id$="_driving_question"]')}),button=(area,text)=>area.getByRole('button',{name:new RegExp('(?:^|\\s)'+[...text].join('\\s*')+'$')});
 await form.getByLabel('说明',{exact:true}).fill('合成验收课程介绍。');await form.getByLabel('驱动问题',{exact:true}).fill('合成验收驱动问题？');
 await p.route(`**/api/courses/${id}/maintenance`,r=>r.request().method()==='GET'?r.fulfill({status:503,json:{error:'合成验收回读失败'}}):r.continue());
 await button(form,'保存').click();await form.locator('.ant-alert-warning').waitFor();
 assert.equal(db.prepare('SELECT description FROM courses WHERE id=?').get(id).description,'合成验收课程介绍。');assert.equal(await form.getByLabel('说明',{exact:true}).inputValue(),'合成验收课程介绍。');
 await p.unroute(`**/api/courses/${id}/maintenance`);await form.getByLabel('说明',{exact:true}).fill('合成验收第二次更新。');await button(form,'保存').click();await form.locator('.ant-alert-success').waitFor();
 await p.getByRole('tab',{name:'可视化填写 / 学生效果预览',exact:true}).click();await p.getByTestId('teaching-preview').getByText('合成验收第二次更新。',{exact:true}).waitFor();await p.screenshot({path:path.join(out,'course-intro-preview.png')});
 await p.getByRole('tab',{name:'课程介绍与显示',exact:true}).click();const q=p.getByTestId('upload-cover');await q.locator('input[type=file]').setInputFiles({name:'合成封面.webp',mimeType:'image/webp',buffer:fs.readFileSync(path.join(root,'frontend/public/assets/redesign-v2/web/campus-960.webp'))});await button(q,'上传待处理文件').click();await q.getByText('上传成功',{exact:true}).waitFor();
 const cover=db.prepare('SELECT file_path FROM course_covers WHERE course_id=?').get(id).file_path;assert.ok(fs.existsSync(cover));
 await form.getByLabel('课程封面',{exact:true}).click();await p.locator('.ant-select-item-option').filter({hasText:'现有校园场景'}).click();await button(form,'保存').click();
 // Upload updated the course revision: the old form must reject rather than silently overwrite it.
 await form.locator('.ant-alert-error').waitFor();const previousForm=await form.elementHandle();p.once('dialog',d=>d.accept());await button(p.getByTestId('content-maintenance').locator('header'),'重新读取').first().click();await p.waitForFunction(e=>!e.isConnected,previousForm);
 await form.getByLabel('课程封面',{exact:true}).click();await p.locator('.ant-select-item-option').filter({hasText:'现有校园场景'}).click();await button(form,'保存').click();await form.locator('.ant-alert-success').waitFor();
 console.log('COVER_AFTER_SAVE',db.prepare('SELECT cover_image FROM courses WHERE id=?').get(id));assert.equal(db.prepare('SELECT count(*) n FROM course_covers WHERE course_id=?').get(id).n,0);assert.equal(fs.existsSync(cover),false);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',savedDescription:true,readFailureRetainedDraft:true,sameCourseId:id,privateCoverLifecyclePreserved:true,knownRevisionConflict:true,pageErrors:errors},null,2));
 }catch(e){fs.writeFileSync(path.join(out,'failure.txt'),e.stack);throw e;}finally{await browser?.close();db.close();execFileSync(process.execPath,['scripts/teaching.mjs','stop','--data',rel],{cwd:root,stdio:'pipe',windowsHide:true});if(child.exitCode===null)await new Promise(r=>child.once('exit',r));}
});
