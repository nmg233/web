import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import https from 'node:https';
import { chromium } from 'playwright';
export const root=path.resolve(import.meta.dirname,'../..'),base='http://127.0.0.1:5193',apiBase='http://127.0.0.1:3130';
const require=createRequire(path.join(root,'backend/package.json')),Database=require('better-sqlite3');
export const gate=()=>{let release;return{promise:new Promise(r=>release=r),release:()=>release()};};
export const jsonError=(r,status,error)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify({error})});
export async function go(p,url){await p.evaluate(url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));},url);}
export async function login(p,username='student_wang',password='student123'){await p.goto(base+'/login');await p.getByLabel('账号',{exact:true}).fill(username);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');await p.getByRole('button',{name:'登录',exact:true}).waitFor({state:'hidden'});}
export async function logout(p){await p.getByRole('button',{name:'个人中心',exact:true}).click();await p.getByRole('menuitem',{name:'退出登录'}).click();await p.waitForURL('**/login');}
export async function choose(p,label,text){await p.getByRole('combobox',{name:label,exact:true}).click();await p.locator('.ant-select-item-option').filter({hasText:text}).last().click();}
export async function rotate(p){return p.evaluate(async()=>{const{default:client}=await import('/src/api/client.js');const old=Date.now;try{const exp=JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp;Date.now=()=> (exp-240)*1000;return(await client.get('/auth/me')).user.id;}finally{Date.now=old;}});}
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('service not ready');}
export async function setup(){
 const scratch=mkdtempSync(path.join(tmpdir(),'star-voyage-round11-'));
 const env={...process.env,NODE_ENV:'test',DB_PATH:path.join(scratch,'test.db'),JWT_SECRET:randomBytes(32).toString('hex'),AI_CONFIG_SECRET:randomBytes(32).toString('hex'),AI_ALLOWED_BASE_URLS:'https://127.0.0.1:3131',
 UPLOAD_PATH:path.join(scratch,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(scratch,'feedback'),CORS_ORIGIN:base,API_PROXY_TARGET:apiBase,VITE_STUDENT_TEST_CONFIG:'1',LOGIN_RATE_LIMIT_IP:'2000',LOGIN_RATE_LIMIT_USER:'2000'};
 mkdirSync(env.UPLOAD_PATH);mkdirSync(env.FEEDBACK_UPLOAD_PATH);
 const git=execFileSync('where.exe',['git'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
 const openssl=process.env.ROUND11_OPENSSL||path.join(path.dirname(path.dirname(git)),'usr/bin/openssl.exe');
 const cert=path.join(scratch,'provider-cert.pem'),key=path.join(scratch,'provider-key.pem');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'pipe',windowsHide:true});
 env.NODE_EXTRA_CA_CERTS=cert;
 const media=path.join(env.UPLOAD_PATH,'round11-test.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-t','20','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',media],{stdio:'pipe',windowsHide:true});
 execFileSync(process.execPath,['database/init.js'],{cwd:path.join(root,'backend'),env,stdio:'pipe',windowsHide:true});
 const db=new Database(env.DB_PATH);
 // 初始化迁移及隔离 AI 设置。只写上面的临时数据库，不读取现有设置。
 execFileSync(process.execPath,['-e',"require('./app'); require('./services/aiSettingsService').saveSettings({enabled:1,base_url:'https://127.0.0.1:3131',api_key:'round11-local-fixture-only',model:'round11-test',retrieval_enabled:1,show_sources:1})"],{cwd:path.join(root,'backend'),env,stdio:'pipe',windowsHide:true});
 db.prepare("UPDATE courses SET title='月球观测与证据记录（测试课程）',status='published',description='【测试材料】比较月球环境，记录证据，再说明自己的判断。这些内容仅用于界面与流程验证。',driving_question='我们如何用观察证据改进月球基地方案？' WHERE id IN(1,2)").run();
 db.prepare("UPDATE users SET email=NULL,phone=NULL").run();db.prepare("UPDATE users SET real_name='探索同学（测试）' WHERE id=4").run();
 db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(4,2,'active')").run();
 db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,duration) VALUES(4,1,'无作品任务的观察课（测试）','比较环境',4,45),(5,2,'同名另一课程课时（测试）','比较月球环境证据',1,45),(6,1,'等待反馈课时（测试）','比较月球环境证据',5,45)").run();
 db.prepare("INSERT INTO tasks(id,lesson_id,title,description,status,deadline) VALUES(4,5,'另一个课程的观察任务（测试）','比较月球环境证据','active',NULL),(5,6,'整理观察记录（测试）','比较月球环境证据','active',NULL)").run();
 db.prepare("UPDATE tasks SET title=title||'（测试）',deadline='2026-11-03 01:30:00' WHERE id<=3").run();
 db.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,enrollment_id,summary,status,version) VALUES(4,1,1,'合成报告','approved',1),(4,2,1,'合成退回报告','rejected',1),(4,6,1,'合成待评审报告','submitted',1)").run();
 db.prepare("INSERT INTO lesson_progress(student_id,lesson_id,progress) VALUES(4,1,100),(4,2,35),(4,6,80)").run();
 db.prepare("INSERT INTO knowledge_cards(id,lesson_id,title,summary,content,status,created_by) VALUES(1,1,'月球环境证据卡（测试）','比较观察证据','【测试】记录月球环境条件，比较自己的观察证据。','published',2)").run();
 const work=db.prepare("INSERT INTO works(id,student_id,enrollment_id,task_id,title,description,review_status,parent_work_id,version) VALUES(?,4,1,1,?,'合成作品内容',?,?,?)");
 work.run(51,'月球环境记录初稿（测试）','rejected',null,1);work.run(52,'月球环境记录第二版（测试）','rejected',51,2);
 const file=path.join(env.UPLOAD_PATH,'round11-resource.txt');writeFileSync(file,'【测试资料】比较月球环境与观察证据。');
 db.prepare("UPDATE resources SET title='月球环境证据记录与观察条件说明_长文件名测试.txt',file_path=?,file_size=90 WHERE id=1").run(file);
 const doc=db.prepare("INSERT INTO ai_documents(resource_id,course_id,enabled,status) VALUES(1,1,1,'ready')").run();db.prepare("INSERT INTO ai_chunks(document_id,course_id,chunk_index,locator,text) VALUES(?,1,0,'测试资料第 1 段','【测试】比较月球环境证据，记录自己的观察条件。')").run(doc.lastInsertRowid);
 const replay=db.prepare("INSERT INTO course_replays(id,course_id,title,video_path,duration_seconds,recording_date,sort_order,created_by) VALUES(?,1,?,?,?,'2026-10-01',?,2)");
 replay.run(1,'回放 A：观察与记录（测试视频）',media,20,1);replay.run(2,'回放 B：讨论与调整（测试视频）',media,0,2);
 let fresh=0;const makeUser=()=>{const username='r11_student_'+(++fresh);const u=db.prepare("INSERT INTO users(username,password_hash,real_name,role) SELECT ?,password_hash,'提问同学（测试）','student' FROM users WHERE id=4").run(username);db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(?,1,'active'),(?,2,'active')").run(u.lastInsertRowid,u.lastInsertRowid);return{username,id:Number(u.lastInsertRowid)};};
 const provider={next:null,requests:[]};
 const compatible=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);provider.requests.push(body);const plan=provider.next||{};provider.next=null;plan.entered?.release();
  if(plan.hold)await plan.hold.promise;
  if(res.destroyed)return;
  res.setHeader('Content-Type','application/json');if(plan.status){res.writeHead(plan.status);res.end(JSON.stringify({error:'local test provider fault'}));return;}
  const refs=[...body.messages[2].content.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]);
  res.end(JSON.stringify({id:'round11_test_provider',choices:[{finish_reason:'stop',message:{content:JSON.stringify({scope:plan.scope||'core',answer:plan.answer||'【本地测试服务回复】\n先列出观察条件，再比较月球环境与记录证据。\n哪些因素保持不变？可以先检查自己的数据，再作出判断。',source_ids:plan.empty?[]:refs})}}]}));
 });
 await new Promise(resolve=>compatible.listen(3131,'127.0.0.1',resolve));
 const server=spawn(process.execPath,['-e',"require('./app').listen(3130,'127.0.0.1')"],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:'pipe'});
 const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5193','--strictPort'],{cwd:path.join(root,'frontend'),env,windowsHide:true,stdio:'pipe'});
 // 不输出完整 HTTP 请求、签名地址、凭据或初始化账号口令。
 for(const child of[server,vite]){child.stdout.resume();child.stderr.resume();}
 await Promise.all([ready(base),ready(apiBase+'/api/health')]);const browser=await chromium.launch({channel:'msedge',headless:true});
 return{db,provider,browser,makeUser,async close(){await browser.close();server.kill();vite.kill();compatible.closeAllConnections();await new Promise(r=>compatible.close(r));db.close();}};
}
