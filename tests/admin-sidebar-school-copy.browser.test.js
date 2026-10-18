import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {fixture, root, Database} from './v2-fixture.mjs';
import {adminModules} from '../frontend/src/pages/admin/navigation.js';

const require=createRequire(import.meta.url);
const base='http://127.0.0.1:4555', api='http://127.0.0.1:3525';
const output=path.join(root,'docs/admin-ui-patch/evidence');

test('管理员侧栏与学校申请说明：隔离环境真实浏览器', {timeout:180000}, async t=>{
  fs.mkdirSync(output,{recursive:true});
  const f=fixture(3525,4555), db=new Database(f.env.DB_PATH);
  const password=crypto.randomBytes(24).toString('hex');
  const hash=require('../backend/node_modules/bcryptjs').hashSync(password,4);
  db.prepare(`INSERT INTO users(id,username,password_hash,real_name,role) VALUES
    (10001,'ui_patch_admin',?,'界面验收管理员','admin'),
    (10003,'ui_patch_mentor',?,'界面验收导师','academic_mentor')`).run(hash,hash);
  const backend=spawn(process.execPath,['scripts/local-server.cjs'],{cwd:root,env:f.env,windowsHide:true,stdio:'ignore'});
  let ready=false;
  for(let i=0;i<100;i++){
    try{if((await fetch(api+'/api/health')).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'隔离后端就绪');
  const dist=path.join(root,'build/teaching');
  const front=http.createServer((req,res)=>{
    if(req.url.startsWith('/api/')){
      const upstream=http.request(api+req.url,{method:req.method,headers:req.headers},response=>{
        res.writeHead(response.statusCode,response.headers);response.pipe(res);
      });
      upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;
    }
    const candidate=path.resolve(dist,'.'+new URL(req.url,base).pathname);
    const file=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>front.listen(4555,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const admin=await browser.newPage({viewport:{width:1440,height:1000}});
  const mentor=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],mutations=[],records=[];
  for(const page of[admin,mentor]){
    page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method())&&url.pathname!='/api/auth/login')mutations.push(request.method()+' '+url.pathname);
    });
  }
  const login=async(page,username)=>{
    await page.goto(base+'/login');
    await page.getByLabel('账号',{exact:true}).fill(username);
    await page.getByLabel('密码',{exact:true}).fill(password);
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.waitForURL(url=>url.pathname!='/login');
    await page.locator('.staff-sidebar').waitFor();
  };
  const menu=()=>admin.locator('.staff-sidebar').getByRole('menu');
  const item=label=>menu().getByRole('menuitem',{name:label,exact:true});
  const selected=async label=>{
    await admin.waitForFunction(label=>document.querySelector('.staff-sidebar [aria-current="page"]')?.getAttribute('aria-label')===label,label);
    assert.match(await item(label).getAttribute('class'),/ant-menu-item-selected/);
    assert.equal(await menu().locator('[aria-current="page"]').count(),1);
  };
  const shot=async name=>{
    await admin.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});
    await admin.screenshot({path:path.join(output,name+'.png'),fullPage:false,animations:'disabled'});
  };
  const scene=async(name,run)=>{
    let failure;
    await t.test(name,async()=>{
      try{await run();records.push({name,status:'passed'});}
      catch(error){failure=error;records.push({name,status:'failed',error:error.message});await shot('failure').catch(()=>{});throw error;}
    });
    if(failure)throw failure;
  };
  try{
    await login(admin,'ui_patch_admin');
    await scene('展开侧栏有五个图标与文字，逐一点击进入并选中',async()=>{
      assert.equal(await menu().getByRole('menuitem').count(),5);
      for(const {key,label} of adminModules){
        assert.equal(await item(label).locator('.anticon').count(),1);
        assert.equal(await item(label).innerText(),label);
        await item(label).click();await admin.waitForURL(url=>url.pathname===key);await selected(label);
      }
      await shot('01-expanded');
    });
    await scene('桌面收起宽64px，五个图标可点击且当前项可读',async()=>{
      await admin.locator('.ant-layout-sider-trigger').click();
      await admin.waitForFunction(()=>document.querySelector('.staff-sidebar').getBoundingClientRect().width===64);
      for(const {key,label} of adminModules){
        assert.equal(await item(label).locator('.anticon').count(),1);
        await item(label).click();await admin.waitForURL(url=>url.pathname===key);await selected(label);
        assert.equal(await admin.locator('.staff-sidebar').evaluate(element=>element.classList.contains('ant-layout-sider-collapsed')),true,`${label}导航后保持收起`);
      }
      await admin.mouse.move(800,500);await shot('02-collapsed');
      assert.equal(await admin.locator('.staff-sidebar').evaluate(element=>element.classList.contains('ant-layout-sider-collapsed')),true,'截图后保持收起');
    });
    await scene('收起后五项悬浮均显示对应名称',async()=>{
      for(const {label} of adminModules){
        await item(label).hover();
        await admin.getByRole('tooltip').filter({hasText:label}).waitFor({state:'visible'});
        await admin.mouse.move(800,500);
      }
    });
    await scene('收起后键盘方向键移动，Enter进入五项并报告当前页',async()=>{
      await item(adminModules[0].label).focus();
      for(let i=0;i<adminModules.length;i++){
        const {key,label}=adminModules[i];
        if(i)await admin.keyboard.press('ArrowDown');
        assert.equal(await item(label).evaluate(element=>element===document.activeElement),true);
        await admin.keyboard.press('Enter');await admin.waitForURL(url=>url.pathname===key);await selected(label);
      }
    });
    await scene('旧课程、学生、评审及设置深链接仍选中所属模块',async()=>{
      for(const [url,label] of [
        ['/courses/9001','课程管理'],['/students/4','账号与组织'],
        ['/mentor/reviews','教学与成长'],['/dashboard/ai/settings','平台设置'],
        ['/dashboard','工作台'],
      ]){await admin.goto(base+url);await selected(label);}
    });
    await scene('管理员申请说明解释直接建校、导师审批、同名核对和独立授权',async()=>{
      await admin.locator('.ant-layout-sider-trigger').click();
      await admin.goto(base+'/admin/organization?section=applications');
      await admin.getByRole('tab',{name:'导师学校申请',exact:true}).waitFor();
      await admin.getByRole('heading',{name:'导师学校申请',exact:true}).waitFor();
      await admin.getByText('处理导师提交的学校申请，批准后授予该校建班和创建学生账号权限；管理员直接建校请在‘学校与班级’操作',{exact:true}).waitFor();
      await admin.getByText(/管理员可在学校与班级直接新增和维护学校、班级，无需提交申请；直接建校不会自动授权导师/).waitFor();
      await admin.getByText(/同名已有学校须明确核对确认，不会重复建校或自动授权。课程管理授权与学校管理授权互相独立/).waitFor();
      assert.equal(await admin.getByRole('button',{name:'申请新建学校',exact:true}).count(),0);
      await shot('03-school-explanation');
      await admin.getByRole('tab',{name:'学校与班级',exact:true}).click();
      const copy=JSON.parse(fs.readFileSync(path.join(root,'content/student-copy/registry.json')));
      await admin.getByRole('button',{name:new RegExp(copy['site.bb89ab68b1ecb420'].text)}).click();
      await admin.getByRole('dialog').waitFor();
      await admin.locator('.ant-modal-close').click();
      assert.equal(new URL(admin.url()).searchParams.get('section'),'schools');
    });
    await scene('手机零宽收起，唤起后可选五项且点击自动收回，不遮挡正文',async()=>{
      await admin.setViewportSize({width:390,height:844});
      const closed=async()=>admin.waitForFunction(()=>document.querySelector('.staff-sidebar').getBoundingClientRect().width===0);
      await closed();
      for(const {key,label} of adminModules){
        await admin.locator('.ant-layout-sider-zero-width-trigger').click();
        await item(label).waitFor({state:'visible'});
        await item(label).click();await admin.waitForURL(url=>url.pathname===key);await selected(label);await closed();
      }
      await shot('04-mobile-closed');
      await admin.locator('.ant-layout-sider-zero-width-trigger').click();await item('课程管理').waitFor({state:'visible'});
      await shot('05-mobile-open');
    });
    await scene('导师仍显示自己的学校申请与获准学校，不出现管理员说明',async()=>{
      await login(mentor,'ui_patch_mentor');await mentor.goto(base+'/mentor/organization');
      await mentor.getByRole('heading',{name:'账号与组织 · 学校申请',exact:true}).waitFor();
      await mentor.getByRole('button',{name:'申请新建学校',exact:true}).waitFor();
      await mentor.getByText('获准学校 · 班级与学生',{exact:true}).waitFor();
      assert.equal(await mentor.getByText(/管理员直接建校请在/).count(),0);
    });
    await scene('无业务写入请求、无浏览器异常，隔离库完整性通过',async()=>{
      assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
      assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
    });
  }finally{
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({records,pageErrors:errors,businessWrites:mutations,scope:'Disposable synthetic fixture only; no persistent teaching DB opened'},null,2));
    await browser.close();await new Promise(r=>front.close(r));
    if(backend.exitCode===null){const stopped=new Promise(r=>backend.once('exit',r));backend.kill();await stopped;}
    db.close();
  }
});
