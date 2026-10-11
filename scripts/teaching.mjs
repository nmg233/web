// Independent local teaching environment. Never seeds on start, never touches old preview.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'backend/package.json'));
export const Database=require('better-sqlite3');
const json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const inside=(base,p)=>{const rel=path.relative(base,p);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
function dataPath(p){const dir=path.resolve(root,p||process.env.PBL_TEACHING_DATA||'.local/teaching');if(!inside(path.join(root,'.local'),dir)||dir===path.join(root,'.local'))throw Error('数据目录必须位于项目 .local 的独立子目录');return dir;}
// Fingerprints of the explicitly reviewed, unedited v2 fixture. Every related row
// is included; changed teaching/student content prevents sample archival.
export function sampleFingerprint(db,id){
 const joins={course_id:'=?',lesson_id:'IN (SELECT id FROM lessons WHERE course_id=?)',enrollment_id:'IN (SELECT id FROM enrollments WHERE course_id=?)',task_id:'IN (SELECT id FROM tasks WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?))',card_id:'IN (SELECT id FROM knowledge_cards WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?))',exercise_id:'IN (SELECT id FROM card_exercises WHERE card_id IN (SELECT id FROM knowledge_cards WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?)))',work_id:'IN (SELECT w.id FROM works w JOIN enrollments e ON e.id=w.enrollment_id WHERE e.course_id=?)',simulation_id:'IN (SELECT id FROM glider_simulations WHERE course_id=?)'};
 const records={};
 for(const {name:table}of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  const columns=db.prepare(`PRAGMA table_info("${table}")`).all().map(c=>c.name),key=Object.keys(joins).find(k=>columns.includes(k));
  if(!key&&table!=='courses')continue;
  const rows=db.prepare(`SELECT * FROM "${table}" WHERE ${table==='courses'?'id=?':`"${key}" ${joins[key]}`} ORDER BY rowid`).all(id);
  // Empty step-03 tables add no user data to the reviewed historical fixture.
  // Any saved definition or course-linked grant still changes the fingerprint and prevents archival.
  if(['lesson_badge_definitions','student_badge_grants','demo_exchange_events','student_coin_ledger'].includes(table)&&rows.length===0)continue;
  records[table]=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([k,v])=>{
   if(table==='lessons'&&((['review_content','report_guidance','experiment_guidance'].includes(k)&&v===null)||(k==='article_blocks'&&v==='[]')))return false;
   if(table==='resources'&&k==='display_order'&&v===0)return false;
   if(['created_at','updated_at'].includes(k))return false;
   // Migration 020's untouched legacy defaults were absent in the original fingerprint.
   // Nondefault/open-reflection content remains part of the hash and prevents archival.
   if(table==='reflections'&&((k==='reflection_version'&&v===1)||(['entry_note','together_note','extra_note'].includes(k)&&v===null)))return false;
   return true;
  }).map(([k,v])=>[k,['file_path','video_path'].includes(k)&&v?path.basename(v):k.endsWith('_at')&&!['start_at','end_at'].includes(k)&&v?'timestamp-present':v])));
 }
 return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
const SAMPLE_FINGERPRINTS={9001:'682931c063783f42466c7702764c6ad35b3605daeb37c822cd4d7619a31c7215',9002:'1af3db708c6154439f763434f00b43de05ccda16eb90138a33bfe5114177148e'};
export function prepareSkeleton(db){
 const archived=[];
 // Exact known fixture signatures only. Changed/unknown teaching records are retained.
 for(const [id,title,note]of [[9001,'星海远航 · 视觉测试课程','用于课程空间和像素地图验收，以下课时与材料均为合成测试内容。'],[9002,'工程观察 · 测试课程','用于验证第二门课程的独立记录与默认校园主题，不是正式教学内容。']]){
  const row=db.prepare('SELECT * FROM courses WHERE id=?').get(id);
  const lessonIds=id===9001?[90011,90012,90013,90014,90015,90016]:[90021];
  const expectedTitles=id===9001?['观察与提问','记录实验条件','比较设计方案','实践与验证','整理过程证据','分享与复盘']:['基础观察（测试课时）'];
  const lessons=db.prepare('SELECT id,title,description,teaching_tip FROM lessons WHERE course_id=? ORDER BY sort_order,id').all(id);
  const unchangedLessons=lessons.length===lessonIds.length&&lessons.every((l,i)=>l.id===lessonIds[i]&&l.title===expectedTitles[i]&&l.description===(id===9001?'本课时仅用于验收学习流程，不是正式教材。':'独立课程测试内容')&&!l.teaching_tip);
  const resources=db.prepare('SELECT id FROM resources WHERE course_id=?').all(id);
  const noNewFiles=resources.length===(id===9001?1:0)&&resources.every(r=>r.id===9001)&&!db.prepare('SELECT 1 FROM course_replays WHERE course_id=?').get(id)&&!db.prepare('SELECT 1 FROM course_covers WHERE course_id=?').get(id);
  const works=db.prepare('SELECT w.id,w.title,w.description,w.version FROM works w JOIN enrollments e ON e.id=w.enrollment_id WHERE e.course_id=?').all(id);
  const unchangedWorks=works.length===1&&works.every(w=>w.id===(id===9001?9001:9002)&&w.version===1&&w.title===(id===9001?'比较记录待修改（测试作品）':'另一课程作品（测试作品）')&&w.description===(id===9001?'合成测试结果':'只属于另一课程'));
  if(row?.title===title&&row.description===note&&row.updated_at===row.created_at&&unchangedLessons&&noNewFiles&&unchangedWorks&&sampleFingerprint(db,id)===SAMPLE_FINGERPRINTS[id]){db.prepare("UPDATE courses SET status='archived' WHERE id=?").run(id);archived.push(id);}
 }
 const mentor=db.prepare("SELECT id FROM users WHERE role IN ('academic_mentor','admin') AND is_active=1 ORDER BY CASE role WHEN 'academic_mentor' THEN 0 ELSE 1 END,id LIMIT 1").get();if(!mentor)throw Error('备份中没有有效课程维护者');
 const id=Number(db.prepare("INSERT INTO courses(title,grade_level,difficulty,status,created_by,presentation_theme,map_mode) VALUES('星海远航','junior','basic','published',?,'voyage','plan')").run(mentor.id).lastInsertRowid);
 const lessons=[];
 for(const [index,title,type]of [[1,'参观 VR 实验室','visit'],[2,'滑翔机试飞理论课','theory'],[3,'滑翔机试飞实验课','experiment']]){
  const lesson=Number(db.prepare("INSERT INTO lessons(course_id,title,sort_order,presentation_type,content_state) VALUES(?,?,?,?,'preparing')").run(id,title,index,type).lastInsertRowid);lessons.push(lesson);
  db.prepare('INSERT INTO lesson_badge_definitions(lesson_id,name,art_id,description) VALUES(?,?,?,?)').run(lesson,type==='visit'?'VR参观':type==='theory'?'理论探索':'滑翔机实践',type==='visit'?'vr':type==='theory'?'theory':'glider','完成本课时的真实学习要求后获得');
 }
 for(let i=1;i<=10;i++)db.prepare('INSERT INTO course_plan_nodes(course_id,position,lesson_id,state) VALUES(?,?,?,?)').run(id,i,lessons[i-1]||null,i<=3?'linked':'preparing');
 db.prepare("INSERT INTO course_experiments(course_id,experiment_id,lesson_id,label) VALUES(?,'glider',?,'滑翔机试飞')").run(id,lessons[2]);
 // Preserve existing accounts and enrollment history. Explicit one-time assignment to skeleton.
 const students=db.prepare("SELECT DISTINCT student_id FROM enrollments WHERE course_id=9001 AND status='active'").all();
 for(const s of students)db.prepare("INSERT INTO enrollments(student_id,course_id,status,enrolled_by) VALUES(?,?,'active',?)").run(s.student_id,id,mentor.id);
 return {courseId:id,lessonIds:lessons,archivedCourses:archived,preserved:'All existing rows, files, avatars, reports, versions, simulations and enrollment history; no deletes',sourceSamples:{courses:[9001,9002],chapters:[90011,90012],lessons:[90011,90012,90013,90014,90015,90016,90021],tasks:[9001,9002,9003],cards:[900111,900112],exercise:[900111],missingResource:[9001]}};
}
function relocate(db,mappings){
 const changed=[],missing=[];
 for(const {name:table}of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const columns=db.prepare(`PRAGMA table_info("${table}")`).all().filter(c=>['file_path','video_path'].includes(c.name));
  for(const c of columns)for(const r of db.prepare(`SELECT rowid AS _row,"${c.name}" AS value FROM "${table}" WHERE "${c.name}" IS NOT NULL`).all()){
   const old=path.resolve(r.value),map=mappings.find(([from])=>inside(from,old));if(!map){missing.push({table,row:r._row,column:c.name,reason:'outside copied roots; original reference retained'});continue;}
   const next=path.join(map[1],path.relative(map[0],old));if(!fs.existsSync(next)){missing.push({table,row:r._row,column:c.name,reason:'file absent in source; original reference retained'});continue;}
   if(fs.statSync(next).isFile()){const hash=createHash('sha256').update(fs.readFileSync(next)).digest('hex');changed.push({table,row:r._row,column:c.name,sha256:hash});}
   db.prepare(`UPDATE "${table}" SET "${c.name}"=? WHERE rowid=?`).run(next,r._row);
  }
 }
 return {changed,missing};
}
export async function snapshot(sourceDb,fromRoots,target){
 if(fs.existsSync(target))throw Error('目标已存在，拒绝覆盖');fs.mkdirSync(target,{recursive:true});
 const source=new Database(sourceDb,{readonly:true,fileMustExist:true});
 try{await source.backup(path.join(target,'teaching.db'));}finally{source.close();}
 const maps=[];
 for(const [name,from]of Object.entries(fromRoots)){const to=path.join(target,name);if(fs.existsSync(from))fs.cpSync(from,to,{recursive:true,dereference:false});else fs.mkdirSync(to,{recursive:true});maps.push([path.resolve(from),to]);}
 const db=new Database(path.join(target,'teaching.db'));const files=relocate(db,maps);if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('备份完整性检查失败');db.close();return files;
}
export function environment(dir,config){return {...process.env,NODE_ENV:'development',DB_PATH:path.join(dir,'teaching.db'),UPLOAD_PATH:path.join(dir,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'),JWT_SECRET:config.jwtSecret,AI_CONFIG_SECRET:config.aiSecret,PORT:String(config.apiPort),CORS_ORIGIN:`http://127.0.0.1:${config.frontPort}`,GLIDER_BACKEND:'reference',GLIDER_RENDERER:'mpl'};}
async function init(dir,metadata){
 if(fs.existsSync(dir))throw Error('已有数据目录；请使用 start，初始化绝不覆盖');
 const source=JSON.parse(fs.readFileSync(path.resolve(metadata),'utf8'));
 const report=await snapshot(source.db,{uploads:path.join(source.scratch,'uploads'),feedback:path.join(source.scratch,'feedback')},dir);
 // Preserve an unmodified consistent DB restore point before migrations/sample handling.
 const copy=new Database(path.join(dir,'teaching.db'));await copy.backup(path.join(dir,'before-skeleton.db'));copy.close();
 process.env.DB_PATH=path.join(dir,'teaching.db');const db=require('../backend/config/database');
 const config={apiPort:3154,frontPort:4184,jwtSecret:randomBytes(32).toString('hex'),aiSecret:randomBytes(32).toString('hex')};
 const ai=db.prepare('SELECT enabled,api_key_encrypted FROM ai_settings WHERE id=1').get();
 // Old preview's ephemeral encryption key is not recoverable from its safe metadata.
 if(ai?.api_key_encrypted)db.prepare('UPDATE ai_settings SET enabled=0 WHERE id=1').run();
 const structure=db.transaction(()=>prepareSkeleton(db))();
 json(path.join(dir,'private.json'),config);json(path.join(dir,'import-report.json'),{sourceDb:source.db,sourceScratch:source.scratch,files:report,...structure,ai:ai?.api_key_encrypted?'Encrypted value retained; disabled until administrator re-enters key or supplies original encryption secret':'No saved provider key; assistant remains disabled'});db.close();
 console.log('一次性导入完成。实际课程 ID：'+structure.courseId+'；文件核对缺失 '+report.missing.length+' 项。详情位于私有 import-report.json');
}
async function available(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
async function start(dir){
 const config=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8'));if(!fs.existsSync(path.join(dir,'teaching.db')))throw Error('数据库缺失；普通启动不会初始化');
 const dist=path.join(root,'build/teaching');if(!fs.existsSync(path.join(dist,'index.html')))throw Error('先运行 npm run build:teaching');
 await available(config.apiPort);await available(config.frontPort);
 const child=spawn(process.execPath,['scripts/local-server.cjs'],{cwd:root,env:environment(dir,config),windowsHide:true,stdio:'inherit'});const stopToken=randomBytes(24).toString('hex');let stopping=false;
 const server=http.createServer((req,res)=>{
  if(req.url==='/__stop'&&req.method==='POST'&&req.headers['x-local-stop']===stopToken){res.end('stopping');stop();return;}
  if(req.url.startsWith('/api/')){const proxy=http.request({hostname:'127.0.0.1',port:config.apiPort,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});proxy.on('error',()=>{res.writeHead(502);res.end('API unavailable');});req.pipe(proxy);return;}
  const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(dist,'.'+name);if(!inside(dist,file)||name.startsWith('/.')){res.writeHead(404);res.end();return;}
  const target=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(dist,'index.html');const ext=path.extname(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.setHeader('Cache-Control',ext==='.html'?'no-store':'no-cache');fs.createReadStream(target).pipe(res);
 });
 function stop(){if(stopping)return;stopping=true;child.kill();server.close(()=>{fs.rmSync(path.join(dir,'runtime.json'),{force:true});});server.closeAllConnections();}
 server.listen(config.frontPort,'127.0.0.1',()=>{json(path.join(dir,'runtime.json'),{pid:process.pid,apiPid:child.pid,frontPort:config.frontPort,stopToken});console.log(`持久教学预览 http://127.0.0.1:${config.frontPort}；数据 ${dir}；普通启动不 seed`);});
 child.on('exit',()=>stop());for(const sig of ['SIGINT','SIGTERM'])process.on(sig,stop);
}
async function main(){
 const [command,...args]=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],dir=dataPath(args.includes('--data')?get('--data'):undefined);
 if(command==='init'){if(!args.includes('--source'))throw Error('init 必须显式提供 --source 旧预览元数据');await init(dir,get('--source'));}
 else if(command==='start')await start(dir);
 else if(command==='stop'){const r=JSON.parse(fs.readFileSync(path.join(dir,'runtime.json')));const result=await fetch(`http://127.0.0.1:${r.frontPort}/__stop`,{method:'POST',headers:{'x-local-stop':r.stopToken}});if(!result.ok)throw Error('未停止；运行记录可能失效');console.log('仅请求本持久环境退出');}
 else if(command==='backup'){if(!args.includes('--to'))throw Error('backup 必须显式提供 --to');const target=dataPath(get('--to'));const files=await snapshot(path.join(dir,'teaching.db'),{uploads:path.join(dir,'uploads'),feedback:path.join(dir,'feedback')},target);fs.copyFileSync(path.join(dir,'private.json'),path.join(target,'private.json'));json(path.join(target,'backup-report.json'),files);console.log('一致性备份完成，缺失引用 '+files.missing.length+' 项；保持密钥私有');}
 else if(command==='restore'){if(!args.includes('--from'))throw Error('restore 必须显式提供 --from，--data 须为不存在目录');const from=dataPath(get('--from'));await snapshot(path.join(from,'teaching.db'),{uploads:path.join(from,'uploads'),feedback:path.join(from,'feedback')},dir);fs.copyFileSync(path.join(from,'private.json'),path.join(dir,'private.json'));console.log('恢复到新目录完成，原目录未修改；启动前检查端口');}
 else throw Error('使用 init/start/stop/backup/restore；详见 docs/next-version/step-01');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error(e.message);process.exitCode=1;});
