import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture,root,Database} from './v2-fixture.mjs';
import {snapshot,prepareSkeleton,sampleFingerprint} from '../scripts/teaching.mjs';
test('精确样例归档不删除原任务、作品、报告、试飞和反思；十关仅三课',()=>{
 const f=fixture(),d=new Database(f.env.DB_PATH),counts={};for(const table of ['lessons','tasks','works','lesson_learning_reports','reflections','glider_simulations'])counts[table]=d.prepare('SELECT count(*) n FROM '+table).get().n;
 const plan=prepareSkeleton(d);assert.deepEqual(plan.archivedCourses,[9001,9002]);for(const [table,n]of Object.entries(counts))assert.equal(d.prepare('SELECT count(*) n FROM '+table).get().n,n+(table==='lessons'?3:0));assert.equal(d.prepare('SELECT count(*) n FROM course_plan_nodes WHERE course_id=? AND lesson_id IS NULL').get(plan.courseId).n,7);assert.equal(d.prepare('SELECT count(*) n FROM lesson_badge_definitions b JOIN lessons l ON l.id=b.lesson_id WHERE l.course_id=?').get(plan.courseId).n,3);d.close();
});
test('样例内新增徽章配置仍阻止样例归档，不把非空奖励数据视为历史空表',()=>{
 const f=fixture(),d=new Database(f.env.DB_PATH),before=sampleFingerprint(d,9001);
 d.prepare("INSERT INTO lesson_badge_definitions(lesson_id,name,art_id,description) VALUES(90011,'用户保存的徽章','theory','原配置')").run();
 assert.notEqual(sampleFingerprint(d,9001),before);const plan=prepareSkeleton(d);assert.deepEqual(plan.archivedCourses,[9002]);
 assert.equal(d.prepare('SELECT status FROM courses WHERE id=9001').get().status,'published');
 assert.equal(d.prepare('SELECT name FROM lesson_badge_definitions WHERE lesson_id=90011').get().name,'用户保存的徽章');d.close();
});
test('样例内报告/题目/安排/角色有任何已保存改变时，保留课程可见及原记录',()=>{
 for(const sql of ["UPDATE lesson_learning_reports SET summary='用户已保存报告' WHERE lesson_id=90013","UPDATE card_exercises SET explanation='用户已保存解释' WHERE id=900111","UPDATE lessons SET location='用户新地点' WHERE id=90011","INSERT INTO course_avatar_preferences(student_id,course_id,avatar_id) VALUES(4,9001,'maker')"]){
  const f=fixture(),d=new Database(f.env.DB_PATH),before=sampleFingerprint(d,9001);d.prepare(sql).run();assert.notEqual(sampleFingerprint(d,9001),before);const plan=prepareSkeleton(d);assert.deepEqual(plan.archivedCourses,[9002]);assert.equal(d.prepare('SELECT status FROM courses WHERE id=9001').get().status,'published');d.close();
 }
});
test('已有开放反思填写仍阻止对应样例归档',()=>{
 const f=fixture(),d=new Database(f.env.DB_PATH),before=sampleFingerprint(d,9002);
 d.prepare("UPDATE reflections SET reflection_version=2,entry_note='用户已保存开放记录' WHERE lesson_id=90021").run();
 assert.notEqual(sampleFingerprint(d,9002),before);const plan=prepareSkeleton(d);assert.deepEqual(plan.archivedCourses,[9001]);
 assert.equal(d.prepare('SELECT status FROM courses WHERE id=9002').get().status,'published');
 assert.equal(d.prepare('SELECT entry_note FROM reflections WHERE lesson_id=90021').get().entry_note,'用户已保存开放记录');d.close();
});
test('首次导入保留 WAL 提交、用户填写及真实文件；备份源与同名目标不覆盖',async()=>{
 const f=fixture(),source=new Database(f.env.DB_PATH);source.pragma('journal_mode=WAL');source.prepare("UPDATE lessons SET description='用户原预览已保存的文字。' WHERE id=90011").run();const file=path.join(f.env.UPLOAD_PATH,'existing-teaching.txt');fs.writeFileSync(file,'用户原上传的真实字节');source.prepare("INSERT INTO resources(course_id,lesson_id,resource_type,title,file_name,file_path,upload_by) VALUES(9001,90011,'other','原上传','existing-teaching.txt',?,2)").run(file);
 const rel='.local/import-regression-'+Date.now(),dir=path.join(root,rel),meta=path.join(root,'test-results','import-regression.json');fs.writeFileSync(meta,JSON.stringify({db:f.env.DB_PATH,scratch:f.scratch}));execFileSync(process.execPath,['scripts/teaching.mjs','init','--source',meta,'--data',rel],{cwd:root,stdio:'pipe',windowsHide:true});
 const d=new Database(path.join(dir,'teaching.db'),{readonly:true}),r=d.prepare("SELECT file_path FROM resources WHERE file_name='existing-teaching.txt'").get();assert.equal(d.prepare('SELECT description FROM lessons WHERE id=90011').get().description,'用户原预览已保存的文字。');assert.equal(d.prepare('SELECT status FROM courses WHERE id=9001').get().status,'published');assert.ok(r.file_path.startsWith(dir));assert.equal(fs.readFileSync(r.file_path,'utf8'),'用户原上传的真实字节');assert.equal(source.prepare("SELECT file_path FROM resources WHERE file_name='existing-teaching.txt'").get().file_path,file);assert.equal(source.prepare('SELECT status FROM courses WHERE id=9002').get().status,'published');assert.equal(d.pragma('integrity_check',{simple:true}),'ok');d.close();
 await assert.rejects(snapshot(f.env.DB_PATH,{uploads:f.env.UPLOAD_PATH},dir),/拒绝覆盖/);source.close();
});
