import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture,root,Database} from './v2-fixture.mjs';

const base='http://127.0.0.1:5198';
const out=path.join(root,'test-results/redesign-v2/patch');
const sizes=[[1440,900],[768,1024],[390,844],[360,800],[844,390]];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function ready(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('启动失败 '+url);}
async function login(p,username='student_wang',password='student123'){
  await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(username);
  await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();
  await p.waitForURL(u=>u.pathname!='/login');
}
async function shot(p,name,fullPage=false){
  await p.evaluate(()=>document.fonts.ready);
  if(fullPage){
    const position=await p.evaluate(()=>scrollY);
    for(const img of await p.locator('.space-place-art[loading="lazy"]').all()){
      await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode().catch(()=>{}));
    }
    await p.evaluate(y=>scrollTo(0,y),position);
  }
  await p.waitForFunction(()=>[...document.images].filter(i=>i.loading!=='lazy').every(i=>i.complete));
  await p.waitForTimeout(120);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'无横向溢出 '+name);
  await p.screenshot({path:path.join(out,name+'.png'),fullPage,animations:'disabled'});
}
async function fonts(p,label,selectors){
  await p.evaluate(()=>document.fonts.ready);
  const c=await p.context().newCDPSession(p);
  try{
    await c.send('DOM.enable');await c.send('CSS.enable');
    const {root:doc}=await c.send('DOM.getDocument',{depth:-1,pierce:true});const records=[];
    for(const selector of selectors){
      await p.locator(selector).first().waitFor();
      await p.locator(selector).first().scrollIntoViewIfNeeded();
      // CDP reports shaped glyphs only after the node has actually been painted.
      await p.screenshot();
      const computed=await p.locator(selector).first().evaluate(e=>({family:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,text:e.value||e.textContent}));
      assert.match(computed.family,/ChillReunion/);
      const {nodeId}=await c.send('DOM.querySelector',{nodeId:doc.nodeId,selector});
      const {fonts:rendered}=await c.send('CSS.getPlatformFontsForNode',{nodeId});
      // Search inputs paint their value inside a browser-owned shadow editor.
      // Inspect that actual editor rather than treating an empty host result as proof.
      if(!rendered.length){
        const {node}=await c.send('DOM.describeNode',{nodeId,depth:-1,pierce:true});
        const descendants=n=>[n,...(n.children||[]).flatMap(descendants),...(n.shadowRoots||[]).flatMap(descendants)];
        for(const child of (node.shadowRoots||[]).flatMap(descendants).filter(n=>n.nodeType===1)){
          rendered.push(...(await c.send('CSS.getPlatformFontsForNode',{nodeId:child.nodeId})).fonts);
        }
      }
      assert.ok(rendered.some(f=>f.isCustomFont&&f.postScriptName==='ChillReunion_Round'&&f.glyphCount>0),label+' '+selector+' actual glyphs '+JSON.stringify({computed,rendered}));
      records.push({selector,computed,rendered});
    }
    const loaded=await p.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})));
    assert.ok(loaded.some(f=>f.family==='ChillReunion'&&f.status==='loaded'&&f.weight==='500'));
    const resource=await p.evaluate(async()=>{
      const r=await fetch('/fonts/chill-reunion/ChillReunion-Round.woff2',{cache:'reload'}),bytes=await r.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      return {url:r.url,status:r.status,bytes:bytes.byteLength,signature:String.fromCharCode(...new Uint8Array(bytes).slice(0,4)),sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')};
    });
    assert.equal(resource.status,200);assert.equal(resource.signature,'wOF2');
    assert.equal(resource.sha256,hash(readFileSync(path.join(root,'frontend/public/fonts/chill-reunion/ChillReunion-Round.woff2'))));
    return {label,url:p.url(),loaded,records,resource};
  }finally{await c.detach();}
}

test('第一步补修：真实字体字形、平台落点与动态地图',{timeout:240000},async t=>{
  const {env}=fixture(3147,5198),db=new Database(env.DB_PATH),children=[];
  const fontRecords=[],viewportRecords=[],requests=[],fontResponses=[],errors=[];let browser;
  mkdirSync(out,{recursive:true});
  const start=(args,cwd=root)=>{const c=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'pipe'});c.stdout.resume();c.stderr.resume();children.push(c);};
  try{
    start(['scripts/local-server.cjs']);start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5198','--strictPort'],path.join(root,'frontend'));
    await Promise.all([ready(base),ready('http://127.0.0.1:3147/api/health')]);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(12000);
    const track=q=>{q.on('pageerror',e=>errors.push(e.message));q.on('request',r=>requests.push(r.url()));q.on('response',r=>{if(r.request().resourceType()==='font'&&r.url().endsWith('ChillReunion-Round.woff2'))fontResponses.push({url:r.url(),status:r.status()});});};track(p);
    const scenario=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();}catch(e){failure=e;await p.screenshot({path:path.join(out,'failure.png')});throw e;}});if(failure)throw failure;};

    await scenario('登录、课程选择、我的、输入与礼品浮层实际使用官方字体字形',async()=>{
      await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill('寒蝉团圆体验证123');
      fontRecords.push(await fonts(p,'login',['h1','label','input','button']));
      await p.getByLabel('账号',{exact:true}).clear();
      for(const[width,height]of sizes.slice(0,3)){await p.setViewportSize({width,height});await shot(p,'login-'+width);}
      await login(p);await p.getByTestId('home-course-card').first().waitFor();
      await p.locator('input').first().fill('测试');fontRecords.push(await fonts(p,'selector',['h1','input','.space-course-card h2']));await p.locator('input').first().clear();
      for(const[width,height]of sizes.slice(0,3)){await p.setViewportSize({width,height});await shot(p,'selector-'+width);}
      await p.goto(base+'/me');await p.getByTestId('reward-balance').waitFor();
      fontRecords.push(await fonts(p,'personal',['.space-personal-header h1','.reward-scope p','.reward-balance strong']));
      for(const[width,height]of sizes.slice(0,3)){await p.setViewportSize({width,height});await shot(p,'personal-'+width);}
      await p.getByRole('button',{name:'查看礼品详情',exact:true}).first().click();
      fontRecords.push(await fonts(p,'reward-dialog',['.ant-modal-title','.reward-dialog-body p','.reward-detail-heading h3']));
      await shot(p,'font-dialog-390');await p.getByRole('button',{name:'关闭弹窗',exact:true}).click();
    });

    await scenario('6 个真实课时与两章节：三尺寸、360、横屏、首屏、键盘与选择不回跳',async()=>{
      for(const[width,height]of sizes){
        await p.setViewportSize({width,height});await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();
        assert.equal(await p.locator('.route-node').count(),6);assert.equal(await p.locator('.route-group').count(),2);
        await shot(p,'map-'+width);await shot(p,'map-'+width+'-full',true);
        const metrics=await p.evaluate(()=>({width:innerWidth,height:innerHeight,mapTop:document.querySelector('.pixel-map-stage').getBoundingClientRect().top,firstNodeBottom:document.querySelector('.route-node').getBoundingClientRect().bottom,firstNodeText:document.querySelector('.route-node').innerText}));
        viewportRecords.push(metrics);
        if(width<=390){assert.ok(metrics.mapTop<height/2);assert.ok(metrics.firstNodeBottom<height-16);}
        const group=p.locator('.route-group').first();
        assert.ok(await group.locator('.pixel-map-track-dashes').evaluate(el=>el.getTotalLength()>100));
        // The SVG starts and ends at the actual pad centers, not number badges.
        assert.ok(await group.evaluate(el=>{const canvas=el.querySelector('.pixel-map-route-canvas').getBoundingClientRect(),pads=el.querySelectorAll('.space-landing-anchor'),line=el.querySelector('.pixel-map-track-dashes');return[0,pads.length-1].every((i,k)=>{const r=pads[i].getBoundingClientRect(),point=line.getPointAtLength(k?line.getTotalLength():0);return Math.abs(point.x-(r.left-canvas.left+r.width/2))<1&&Math.abs(point.y-(r.top-canvas.top+r.height/2))<1;});}));
        await p.locator('.route-node').first().focus();await p.keyboard.press('Enter');
        await p.getByTestId('lesson-details').getByText('观察与提问',{exact:true}).waitFor();
        await shot(p,'detail-'+width);
        await p.locator('.space-lesson-modal .ant-modal-close').click();
        await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForTimeout(350);
        assert.equal(await p.locator('[data-lesson-id="90011"] .route-node').getAttribute('aria-pressed'),'true');
        assert.equal(await p.locator('[data-lesson-id="90012"] .route-node').getAttribute('aria-current'),'step');
        assert.equal(await p.locator('[aria-current="step"]').count(),1);
        const url=p.url();await p.locator('.pixel-map-overview').click({position:{x:4,y:2}});assert.equal(p.url(),url);
      }
      await p.setViewportSize({width:390,height:844});await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();
      fontRecords.push(await fonts(p,'map',['.pixel-map-header h2','.pixel-map-node-label strong','.space-map-test-note']));
      await p.getByRole('button',{name:'打开课程导航',exact:true}).click();await p.locator('.space-navigation-drawer .space-course-navigation').waitFor();await shot(p,'mobile-sidebar');await p.locator('.space-navigation-drawer .ant-drawer-close').click();
      await p.waitForFunction(()=>document.querySelector('.space-menu-button')?.getAttribute('aria-expanded')==='false');
      await p.locator('.route-node').first().click();await p.getByRole('button',{name:'进入课时',exact:true}).click();await p.waitForURL('**/lessons/90011/learn');await p.getByRole('button',{name:'我已完成课堂回顾',exact:true}).waitFor();
      fontRecords.push(await fonts(p,'lesson',['.study-header h2','.study-workspace p']));
      await p.getByRole('link',{name:'返回课程地图',exact:true}).click();await p.locator('.route-node').first().waitFor();
    });

    await scenario('真实 API 动态 0/1/20 个课时，未分组、长名称、取消课时与原排序',async()=>{
      db.prepare("INSERT INTO courses(id,title,theme,grade_level,difficulty,status,created_by) VALUES(9003,'多课时边界 · 合成测试课程','工程设计','junior','basic','published',2)").run();
      db.prepare("INSERT INTO enrollments(student_id,course_id,status,enrolled_by) VALUES(4,9003,'active',2)").run();
      for(const count of [0,1,20]){
        for(let i=count===20?2:1;i<=count;i++)db.prepare("INSERT INTO lessons(id,course_id,title,sort_order,status) VALUES(?,9003,?,?,?)").run(90300+i,i===2?'长标题测试：从观察条件到提出假设，再通过反复试验收集证据比较设计方案并整理小组的发现与反思（合成测试）':'边界测试课时 '+i,i,i===20?'cancelled':'scheduled');
        for(const[width,height]of [[1440,900],[390,844]]){
          await p.setViewportSize({width,height});await p.goto(base+'/courses/9003');
          if(!count)await p.getByText('这门课程还没有课时，请等待老师发布',{exact:true}).waitFor();else await p.locator('.route-node').first().waitFor();
          assert.equal(await p.locator('.route-node').count(),count);await shot(p,`nodes-${count}-${width}`,count===20);
          if(count){assert.equal(await p.locator('.route-group').count(),1);assert.match(await p.locator('.pixel-map-region-title').innerText(),/课程课时/);assert.deepEqual(await p.locator('[data-lesson-id]').evaluateAll(es=>es.map(e=>Number(e.dataset.lessonId))),Array.from({length:count},(_,i)=>90301+i));}
          if(count===20){await p.locator('[data-lesson-id="90320"] .route-node').click();await p.getByText('本课时已取消',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'进入课时',exact:true}).count(),0);await p.locator('.space-lesson-modal .ant-modal-close').click();}
        }
      }
      await p.goto(base+'/courses/9002');await p.locator('[data-lesson-id="90021"]').waitFor();assert.equal(await p.locator('.space-map').getAttribute('data-map-theme'),'campus');assert.equal(await p.locator('.space-place-art').count(),0);assert.equal(await p.locator('[data-lesson-id="90011"]').count(),0);await shot(p,'default-map-390');
      for(let i=7;i<=20;i++)db.prepare("INSERT INTO lessons(id,course_id,title,sort_order) VALUES(?,9001,?,?)").run(91000+i,i===7?'较多节点长标题测试：整理工程设计的过程证据与反思（合成课时）':'路线扩展验证（测试课时 '+i+'）',i);
      for(const[width,height]of [[1440,900],[390,844]]){await p.setViewportSize({width,height});await p.goto(base+'/courses/9001');await p.locator('.route-node').first().waitFor();assert.equal(await p.locator('.route-node').count(),20);assert.equal(await p.locator('.route-group').count(),3);await p.getByRole('heading',{name:/其他课时/}).waitFor();await shot(p,'voyage-20-'+width,true);}
      db.prepare('DELETE FROM lessons WHERE id BETWEEN 91007 AND 91020').run();
    });

    await scenario('模块图片失败仍保留路线、课时名称、键盘选择及详情',async()=>{
      await p.route('**/assets/redesign-v2/web/moon-base-*.webp',r=>r.abort());
      await p.goto(base+'/courses/9001');await p.locator('[data-place-failed]').first().waitFor();
      assert.equal(await p.locator('.route-node').count(),6);await p.locator('.route-node').first().focus();await p.keyboard.press('Space');await p.getByTestId('lesson-details').getByText('观察与提问',{exact:true}).waitFor();
      await p.locator('.space-lesson-modal .ant-modal-close').click();await shot(p,'place-fallback-390');await p.unroute('**/assets/redesign-v2/web/moon-base-*.webp');
    });

    await scenario('执行导师、管理员、只读教师实际渲染字体与原角色入口',async()=>{
      for(const[name,password,home]of [['mentor_zhang','mentor123','/dashboard'],['adminpbl','admin123','/dashboard'],['teacher_li','teacher123','/observer']]){
        const c=await browser.newContext({viewport:{width:1440,height:900}}),q=await c.newPage();track(q);
        try{await login(q,name,password);await q.waitForURL('**'+home);await q.locator('.space-staff-shell').waitFor();fontRecords.push(await fonts(q,name,['.ant-menu-title-content','.ant-layout-content .ant-typography']));await shot(q,'role-'+name);}finally{await c.close();}
      }
    });
    assert.deepEqual(errors,[]);assert.equal(requests.some(u=>u.includes('SmileySans')||u.includes('/masters/')),false);
    assert.ok(fontResponses.filter(r=>r.status===200).length>=4);
    writeFileSync(path.join(out,'verification.json'),JSON.stringify({date:new Date().toISOString(),browser:browser.version(),sizes,viewportRecords,fontRecords,fontRequests:fontResponses,pageErrors:errors,data:'全新隔离 SQLite 测试库，0/1/20 课时来自真实 API，图片失败为请求中断注入。'},null,2));
    await context.close();
  }finally{if(browser)await browser.close();db.close();for(const c of children)if(c.exitCode===null)c.kill();}
});
