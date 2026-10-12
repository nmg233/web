import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/next-version/step-02/actual-readonly'));fs.mkdirSync(out,{recursive:true});
test('最终持久教学入口只读预览，未导入合成验收教材',{timeout:60000},async()=>{
 const id=JSON.parse(fs.readFileSync(path.join(root,'.local/teaching/import-report.json'))).courseId;
 assert.equal((await fetch('http://127.0.0.1:3154/api/health')).status,200);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const p=await browser.newPage({viewport:{width:1440,height:900}}),writes=[],errors=[];p.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())&&!r.url().includes('/auth/'))writes.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4184/login');await p.getByLabel('账号',{exact:true}).fill('mentor_zhang');await p.getByLabel('密码',{exact:true}).fill('mentor123');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
 await p.goto(`http://127.0.0.1:4184/courses/${id}?tab=maintenance`);await p.getByTestId('content-maintenance').waitFor();await p.getByRole('tab',{name:'可视化填写 / 学生效果预览',exact:true}).click();await p.getByTestId('teaching-preview').waitFor();await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(out,'mentor-actual-1440.png'),animations:'disabled'});
 assert.equal(await p.getByText('合成验收第二次更新。',{exact:true}).count(),0);assert.equal(await p.getByText('隔离验收：请比较条件并保留证据。',{exact:true}).count(),0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',courseId:id,base:'http://127.0.0.1:4184',apiHealth:200,businessWrites:writes,pageErrors:errors,scope:'Authenticated read-only maintenance page; no teaching material uploaded or edited'},null,2));
 }finally{await browser.close();}
});
