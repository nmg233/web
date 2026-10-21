import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {prepareMentorFixture,serveFixture,root,Database} from './mentor-fixture.mjs';
import {buildArticlePackage} from '../scripts/build-article-import-package.mjs';
const require=createRequire(import.meta.url),JSZip=require('../backend/node_modules/jszip');
test('集中填写真实接口、安全文章、发布与历史版本兼容',{timeout:240000},async t=>{
 const f=prepareMentorFixture(3591,4621),db=new Database(f.env.DB_PATH),runtime=await serveFixture(f,3591,4621),tokens={},records=[];
 const out=path.join(root,'docs/content-authoring/evidence/api');fs.mkdirSync(out,{recursive:true});
 const request=async(role,url,method='GET',body)=>{const r=await fetch(runtime.base+'/api'+url,{method,headers:{Authorization:'Bearer '+tokens[role],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 const read=async()=>{const r=await request('mentor','/courses/91001/maintenance');assert.equal(r.status,200);return r.body;};
 const lessonRead=async id=>(await read()).lessons.find(l=>l.id===id);
 const save=async(id,body)=>{const row=await lessonRead(id);return request('mentor',`/courses/91001/maintenance/lessons/${id}`,'PUT',{...body,expected_revision:row.content_revision});};
 const scene=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();records.push({name,status:'passed'});}catch(e){error=e;records.push({name,status:'failed',error:e.message});throw e;}});if(error)throw error;};
 const publish=async id=>{const r=await request('mentor','/courses/91001/publication','POST',{lesson_id:id,reason:'隔离验收真实教材'});assert.equal(r.status,200,JSON.stringify(r.body));const decision=await request('admin',`/courses/91001/publication/${r.body.id}/decision`,'POST',{decision:'approved',reason:'管理员核对合成验收教材'});assert.equal(decision.status,200,JSON.stringify(decision.body));};
 const source=path.resolve(root,'../../deliverables/课时可视化维护与VR文章');
 let visit,practice,packageBytes,imported;
 try{
  for(const role of['admin','mentor','mentorB','student'])tokens[role]=(await fetch(runtime.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'mentor_review_'+role,password:f.password})}).then(r=>r.json())).token;
  await scene('仅标题保存课程草稿；不绑定实验，不填难度和独立故事',async()=>{const r=await request('mentor','/courses','POST',{title:'仅名称的合成课程',request_key:crypto.randomUUID()});assert.equal(r.status,200,JSON.stringify(r.body));const c=db.prepare('SELECT * FROM courses WHERE id=?').get(r.body.id);assert.equal(c.status,'draft');assert.equal(c.difficulty,'basic');assert.equal(c.story_line,null);assert.equal(db.prepare('SELECT COUNT(*) n FROM course_experiments WHERE course_id=?').get(c.id).n,0);});
  await scene('四模板草稿仅名称可保存；无内容不能发布参观课',async()=>{
   for(const type of['learning','visit','theory','experiment']){const r=await request('mentor','/courses/91001/lessons','POST',{title:'合成模板 '+type,presentation_type:type,request_key:crypto.randomUUID()});assert.equal(r.status,200);const l=await lessonRead(r.body.id);assert.equal(l.content_state,'preparing');assert.equal(l.publication_state,'draft');if(type==='visit')visit=l.id;if(type==='experiment')practice=l.id;}
   assert.equal((await request('mentor','/courses/91001/publication','POST',{lesson_id:visit,reason:'应被拒绝的空参观课'})).status,409);
  });
  await scene('旧字段不拼接覆盖；修订冲突及跨课程 mentor 拒绝',async()=>{
   db.prepare("UPDATE lessons SET location='原地点',start_at='2026-10-21T14:00',duration=45,instructor_id=10002 WHERE id=?").run(practice);
   const old=await lessonRead(practice);assert.equal((await save(practice,{description:'选填介绍，人工原稿'})).status,200);
   assert.equal((await request('mentor',`/courses/91001/maintenance/lessons/${practice}`,'PUT',{description:'不能覆盖的新草稿',expected_revision:old.content_revision})).status,409);
   const actual=db.prepare('SELECT * FROM lessons WHERE id=?').get(practice);assert.equal(actual.location,'原地点');assert.equal(actual.duration,45);assert.equal(actual.description,'选填介绍，人工原稿');
   assert.equal((await request('mentorB',`/courses/91001/maintenance/lessons/${practice}`,'PUT',{title:'越权修改'})).status,404);
   assert.equal((await request('mentorB','/courses/91001/maintenance/lab')).status,404);
  });
  await scene('用户已有公众号 HTML 与9张图片真实导入本站；重试不重复上传',async()=>{
   packageBytes=await buildArticlePackage(source);const l=await lessonRead(visit),key=crypto.randomUUID();
   const send=async()=>{const body=new FormData();body.append('article',new Blob([packageBytes]),'article.zip');body.append('requestKey',key);body.append('expected_revision',l.content_revision);return request('mentor',`/courses/91001/maintenance/lessons/${visit}/article-import`,'POST',body);};
   const r=await send();assert.equal(r.status,200,JSON.stringify(r.body));imported=r.body;assert.equal(imported.resources.length,9);assert.equal(imported.complete,true);assert.equal(imported.saved,false);assert.match(imported.block.html,/天朗气清/);assert.doesNotMatch(imported.block.html,/https:\/\/mmbiz|<script|\bon\w+=/i);
   assert.equal(db.prepare('SELECT article_blocks FROM lessons WHERE id=?').get(visit).article_blocks,'[]');
   assert.equal((await send()).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources WHERE lesson_id=?').get(visit).n,9);
   assert.equal((await save(visit,{article_title:'用户已有文章 · 隔离验收',article_blocks:[imported.block],content_state:'ready'})).status,200);
  });
  await scene('缺图、SSRF地址、恶意HTML和他课资源不伪装保存成功',async()=>{
   const before=db.prepare('SELECT COUNT(*) n FROM resources').get().n,l=await lessonRead(visit),zip=await JSZip.loadAsync(packageBytes);zip.remove('images/image-01.jpg');const broken=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
   const body=new FormData();body.append('article',new Blob([broken]),'broken.zip');body.append('requestKey',crypto.randomUUID());body.append('expected_revision',l.content_revision);assert.equal((await request('mentor',`/courses/91001/maintenance/lessons/${visit}/article-import`,'POST',body)).status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM resources').get().n,before);
   const denied=new FormData();denied.append('url','https://127.0.0.1/private');denied.append('requestKey',crypto.randomUUID());denied.append('expected_revision',l.content_revision);assert.equal((await request('mentor',`/courses/91001/maintenance/lessons/${visit}/article-import`,'POST',denied)).status,400);
   assert.equal((await save(practice,{article_blocks:[{id:'foreign-rich',type:'rich',html:`<p>越权图片</p><img src="pbl-resource:${imported.resources[0].id}"/>`,resourceIds:[imported.resources[0].id]}]})).status,400);
  });
  await scene('文章审批后学生读取本站图文；参观仍只读，不写完成或金币',async()=>{
   await publish(visit);const r=await request('student','/learning/lessons/'+visit);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.read_only,true);assert.equal(r.body.resources.length,9);assert.match(r.body.lesson.article_blocks[0].html,/pbl-resource:/);assert.equal((await request('student',`/learning/lessons/${visit}/review-complete`,'POST',{})).status,409);
   const image=await fetch(runtime.base+`/api/courses/resources/${imported.resources[0].id}/download`,{headers:{Authorization:'Bearer '+tokens.student}});assert.equal(image.status,200);assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0,2).toString('hex'),'ffd8');assert.equal(db.prepare('SELECT COUNT(*) n FROM student_coin_ledger WHERE lesson_id=?').get(visit).n,0);
  });
  await scene('实践关闭卡片前置仍需回顾和报告；正式内容与学生历史版本冻结',async()=>{
   assert.equal((await save(practice,{cards_required:false,review_content:'真实实践：记录比较条件与操作证据',content_state:'ready'})).status,200);await publish(practice);
   const first=await request('student','/learning/lessons/'+practice);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.progress.cards_required,false);assert.equal(first.body.progress.report_unlocked,false);const version=first.body.content_version.id;
   assert.equal((await request('student',`/learning/lessons/${practice}/review-complete`,'POST',{})).status,200);const after=await request('student','/learning/lessons/'+practice);assert.equal(after.body.progress.report_unlocked,true);assert.equal(after.body.progress.completed,false);
   const report=await request('student',`/learning/lessons/${practice}/report`,'POST',{report:{summary:'实践证据和比较结论'},reflection:{reflection_version:2,entry_note:'合成开放反思'}});assert.equal(report.status,201,JSON.stringify(report.body));
   const reportId=report.body.report.id;const reviewed=await request('mentor',`/mentor-reviews/${reportId}/review`,'POST',{status:'approved',score:86,comment:'核对实践证据后通过'});assert.equal(reviewed.status,200,JSON.stringify(reviewed.body));
   const settled=await request('student','/rewards/coins/reconcile','POST',{});assert.equal(settled.status,200);assert.equal(settled.body.created.find(x=>x.lessonId===practice)?.amount,86);await request('student','/rewards/coins/reconcile','POST',{});assert.equal(db.prepare("SELECT COUNT(*) n FROM student_coin_ledger WHERE lesson_id=? AND student_id=10004").get(practice).n,1);
   assert.equal((await request('mentor','/courses/91001/publication/lessons/'+practice+'/close','POST',{reason:'核对历史教材保护'})).status,200);
   assert.equal((await save(practice,{review_content:'新进入学生使用的后续稿',cards_required:true})).status,200);
   const bound=db.prepare('SELECT content_json FROM lesson_content_versions WHERE id=?').get(version);assert.match(bound.content_json,/真实实践/);assert.equal(JSON.parse(bound.content_json).lesson.cards_required,0);
  });
  await scene('实验室真实保存与冲突核验，不自动关联、不修改课程封面',async()=>{
   const c=db.prepare('SELECT cover_image FROM courses WHERE id=91001').get();
   const r=await request('mentor','/courses/91001/maintenance/lab','PUT',{title:'试飞观察室',introduction:'只用于本课程的实验说明',coverId:null,backgroundId:null,expectedRevision:0,request_key:crypto.randomUUID()});assert.equal(r.status,200,JSON.stringify(r.body));
   const latest=await request('mentor','/courses/91001/maintenance/lab');assert.equal(latest.body.title,'试飞观察室');assert.equal(db.prepare('SELECT cover_image FROM courses WHERE id=91001').get().cover_image,c.cover_image);assert.equal(db.prepare('SELECT COUNT(*) n FROM course_experiments WHERE course_id=91001').get().n,0);
   assert.equal((await request('mentor','/courses/91001/maintenance/lab','PUT',{title:'冲突不应覆盖',introduction:'',coverId:null,backgroundId:null,expectedRevision:0,request_key:crypto.randomUUID()})).status,409);
  });
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,scope:'Real local HTTP; synthetic SQLite; private user article imported only into isolated fixture, never committed'},null,2));await runtime.close();db.close();}
});
