import {fixture,root,Database} from '../v2-fixture.mjs';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import https from 'node:https';
import {chromium} from 'playwright';
export const base='http://127.0.0.1:5199',api='http://127.0.0.1:3148';
export const gate=()=>{let release;return{promise:new Promise(r=>release=r),release:()=>release()};};
export async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Service not ready '+url);}
export async function login(p,name='student_wang',password='student123'){
 await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(name);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
}
export async function go(p,url){await p.evaluate(async url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},url);}
export async function setup({frontendDir=path.join(root,'frontend')}={}){
 const f=fixture(3148,5199),{env,scratch}=f;env.AI_CONFIG_SECRET=randomBytes(32).toString('hex');env.AI_ALLOWED_BASE_URLS='https://127.0.0.1:3150';
 const git=execFileSync('where.exe',['git'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];const openssl=path.join(path.dirname(path.dirname(git)),'usr/bin/openssl.exe');
 const cert=path.join(scratch,'test-provider.pem'),key=path.join(scratch,'test-provider-key.pem');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'pipe',windowsHide:true});env.NODE_EXTRA_CA_CERTS=cert;
 execFileSync(process.execPath,['-e',"require('./app');require('./services/aiSettingsService').saveSettings({enabled:1,base_url:'https://127.0.0.1:3150',api_key:'isolated-test-provider',model:'local-test-only',retrieval_enabled:1,show_sources:1})"],{cwd:path.join(root,'backend'),env,stdio:'pipe',windowsHide:true});
 const db=new Database(env.DB_PATH);
 mkdirSync(process.env.PBL_EVIDENCE_DIR||path.join(root,'docs/redesign-v2/step-02/visual-patch/regression-evidence'),{recursive:true});
 db.prepare("INSERT INTO users(username,password_hash,real_name,role) SELECT 'step02_other',password_hash,'另一测试同学','student' FROM users WHERE id=4").run();
 const other=db.prepare("SELECT id FROM users WHERE username='step02_other'").get().id;
 for(const id of [9001,9002])db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(?,?,'active')").run(other,id);
 const provider={next:null,requests:[]};
 const service=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);provider.requests.push(body);const plan=provider.next||{};provider.next=null;plan.entered?.release();if(plan.hold)await plan.hold.promise;
  if(res.destroyed)return;res.setHeader('Content-Type','application/json');if(plan.status){res.writeHead(plan.status);res.end(JSON.stringify({error:'isolated test fault'}));return;}
  const refs=[...body.messages[2].content.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]);res.end(JSON.stringify({id:'local-test-only',choices:[{finish_reason:'stop',message:{content:JSON.stringify({scope:plan.scope||'core',answer:plan.answer||'【本地测试服务回复】先记录观察条件，再比较自己的证据。这不是外部模型质量验收。',source_ids:plan.empty?[]:refs})}}]}));
 });await new Promise(r=>service.listen(3150,'127.0.0.1',r));
 const children=[];function start(args,cwd=root){const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'pipe'});child.stdout.resume();child.stderr.resume();children.push(child);}
 start(['scripts/local-server.cjs']);start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5199','--strictPort'],frontendDir);
 await Promise.all([ready(base),ready(api+'/api/health')]);const browser=await chromium.launch({channel:'msedge',headless:true});
 mkdirSync(path.join(root,'test-results/redesign-v2/step02'),{recursive:true});writeFileSync(path.join(root,'test-results/redesign-v2/step02/environment.json'),JSON.stringify({base,api,db:env.DB_PATH,provider:'isolated HTTPS loopback test fixture; no external provider quality claims',other},null,2));
 return{env,db,browser,provider,other,async close(){await browser.close();for(const child of children)child.kill();service.closeAllConnections();await new Promise(r=>service.close(r));db.close();}};
}
