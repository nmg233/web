import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
import {root,Database} from './mentor-fixture.mjs';
const require=createRequire(import.meta.url),Module=require('node:module');
const run=(script,args)=>JSON.parse(execFileSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'}).trim());
test('命名升级与定向宇宙修复：备份、旧库、重复、恢复副本和安全回滚',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-authoring-tools-')),file=path.join(dir,'old.db'),db=new Database(file),records=[];
 const filename=path.join(root,'backend/database/old-migrate-fixture.cjs'),old=new Module(filename);old.filename=filename;old.paths=Module._nodeModulePaths(path.dirname(filename));old._compile(execFileSync('git',['show','7e55e65:backend/database/migrate.js'],{cwd:root,encoding:'utf8'}),filename);old.exports.runMigrations(db);
 db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'tool-review','x','合成管理员','admin')").run();
 db.prepare("INSERT INTO courses(id,title,description,grade_level,difficulty,status,created_by,presentation_theme,public_theme,cover_image) VALUES(1,'核对过的原远航课程','人工简介','junior','basic','published',1,'voyage','sky','/assets/redesign-v2/web/cosmos-960.webp'),(2,'普通新课程','保留','junior','basic','draft',1,'campus','campus',NULL)").run();
 db.prepare("INSERT INTO lessons(id,course_id,title,review_content,location) VALUES(1,1,'保留原课时','人工正文不可改变','原地点')").run();
 const oldLesson=db.prepare('SELECT * FROM lessons WHERE id=1').get(),migrations=db.prepare('SELECT * FROM schema_migrations').all();db.close();
 const scene=async(name,fn)=>{await t.test(name,async()=>{await fn();records.push({name,status:'passed'});});};
 await scene('默认只读核对、缺少离线确认拒绝；旧库增量并保持数字迁移和人工字段',async()=>{
  const before=run('scripts/content-authoring-migrate.cjs',['--db',file]);assert.equal(before.cardsRequired,false);
  assert.throws(()=>run('scripts/content-authoring-migrate.cjs',['--db',file,'--apply','--backup',path.join(dir,'forbidden.db')]));assert.equal(fs.existsSync(path.join(dir,'forbidden.db')),false);
  const result=run('scripts/content-authoring-migrate.cjs',['--db',file,'--apply','--offline-confirm','--backup',path.join(dir,'before.db')]);assert.equal(result.after.cardsRequired,true);const current=new Database(file,{readonly:true});try{assert.deepEqual(current.prepare('SELECT * FROM schema_migrations').all(),migrations);const l=current.prepare('SELECT * FROM lessons WHERE id=1').get();for(const k of Object.keys(oldLesson))assert.deepEqual(l[k],oldLesson[k]);}finally{current.close();}
 });
 await scene('重复升级不重复加列；备份恢复仅到新副本且内容相同',async()=>{
  run('scripts/content-authoring-migrate.cjs',['--db',file,'--apply','--offline-confirm','--backup',path.join(dir,'repeat.db')]);
  const restored=path.join(dir,'restored.db');run('scripts/content-authoring-migrate.cjs',['--db',path.join(dir,'before.db'),'--restore-copy',restored]);const r=new Database(restored,{readonly:true});try{assert.equal(r.pragma('table_info(lessons)').some(c=>c.name==='cards_required'),false);assert.equal(r.prepare('SELECT review_content FROM lessons WHERE id=1').get().review_content,'人工正文不可改变');}finally{r.close();}
 });
 await scene('定向预演零写入；新课程不能获得宇宙主题；执行保留封面与教材',async()=>{
  const setup=new Database(file);for(const purpose of ['cover','desktop','mobile','mark']){const image=path.join(dir,purpose+'.png');fs.writeFileSync(image,Buffer.from('synthetic retained image'));setup.prepare('INSERT INTO course_theme_images(id,course_id,purpose,uploaded_by,upload_key,digest,file_path,mime_type) VALUES(?,1,?,1,?,?,?,?)').run(purpose+'-image',purpose,'tool-'+purpose,'a'.repeat(64),image,'image/png');setup.prepare('INSERT INTO course_theme_bindings(course_id,purpose,image_id) VALUES(1,?,?)').run(purpose,purpose+'-image');}setup.close();
  const plan=path.join(dir,'voyage.json');const dry=run('scripts/restore-voyage-theme.cjs',['--db',file,'--course-id','1','--expected-title','核对过的原远航课程','--plan',plan,'--use-built-in-backgrounds']);assert.equal(dry.mode,'read-only-plan');
  assert.throws(()=>run('scripts/restore-voyage-theme.cjs',['--db',file,'--course-id','2','--expected-title','普通新课程','--plan',path.join(dir,'no-new.json')]));
  const applied=run('scripts/restore-voyage-theme.cjs',['--db',file,'--apply',plan,'--offline-confirm','--backup',path.join(dir,'theme-before.db')]);const r=new Database(file,{readonly:true});try{const c=r.prepare('SELECT * FROM courses WHERE id=1').get();assert.equal(c.public_theme,null);assert.deepEqual(r.prepare('SELECT purpose FROM course_theme_bindings WHERE course_id=1 ORDER BY purpose').all().map(x=>x.purpose),['cover','mark']);for(const purpose of['cover','desktop','mobile','mark'])assert.equal(fs.readFileSync(path.join(dir,purpose+'.png'),'utf8'),'synthetic retained image');assert.equal(c.presentation_theme,'voyage');assert.equal(c.cover_image,'/assets/redesign-v2/web/cosmos-960.webp');assert.equal(r.prepare('SELECT review_content FROM lessons WHERE id=1').get().review_content,'人工正文不可改变');}finally{r.close();}assert.ok(fs.existsSync(applied.receipt));
 });
 await scene('同一执行计划重放被拒绝；按回执回滚主题选择不改教材',async()=>{
  const plan=path.join(dir,'voyage.json'),receipt=plan+'.receipt.json';assert.throws(()=>run('scripts/restore-voyage-theme.cjs',['--db',file,'--apply',plan,'--offline-confirm','--backup',path.join(dir,'not-written.db')]));
  run('scripts/restore-voyage-theme.cjs',['--db',file,'--rollback',receipt,'--offline-confirm','--backup',path.join(dir,'rollback-before.db')]);const r=new Database(file,{readonly:true});try{assert.equal(r.prepare('SELECT public_theme FROM courses WHERE id=1').get().public_theme,'sky');assert.equal(r.prepare('SELECT COUNT(*) n FROM course_theme_bindings WHERE course_id=1').get().n,4);assert.equal(r.prepare('SELECT location FROM lessons WHERE id=1').get().location,'原地点');}finally{r.close();}
 });
 const out=path.join(root,'docs/content-authoring/evidence/tools');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,scope:'Synthetic legacy 7e55e65 migration source; no persistent source DB modified'},null,2));
});
