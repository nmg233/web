import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'backend/package.json')),Database=require('better-sqlite3');
const hash=b=>createHash('sha256').update(b).digest('hex');
export function importArticle({sourceDir,dataDir,courseId,lessonId,expectedRevision,apply=false}){
 const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'正文与图片清单.json'),'utf8').replace(/^\uFEFF/,'')),files=JSON.parse(fs.readFileSync(path.join(sourceDir,'图片下载记录.json'),'utf8').replace(/^\uFEFF/,''));
 const blocks=JSON.parse(execFileSync(path.join(root,'.venv/Scripts/python.exe'),[path.join(root,'scripts/extract-lesson-article.py'),path.join(sourceDir,'正文与图片清单.json')],{encoding:'utf8',windowsHide:true}));
 if(blocks.filter(b=>b.type==='image').length!==9||source.images.length!==9||files.length!==9||blocks.filter(b=>b.type==='paragraph').map(b=>b.text).join('')!==source.text)throw Error('原文文字或九图数量不一致，停止导入');
 let imageIndex=0;const images=blocks.filter(b=>b.type==='image').map(b=>{const i=imageIndex++,file=path.join(sourceDir,'images',`image-${String(i+1).padStart(2,'0')}.jpg`),bytes=fs.readFileSync(file),digest=hash(bytes);if(b.source!==source.images[i].url||digest!==files[i].sha256.toLowerCase()||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('图片顺序/散列/签名不一致：'+(i+1));return{bytes,digest,index:i+1};});
 const sourceDigest=hash(JSON.stringify([source.title,source.text,blocks,images.map(i=>i.digest)])),db=new Database(path.join(dataDir,'teaching.db'));
 const revision=row=>require('../backend/helpers/contentRevision').contentRevision(row),createdFiles=[];
 try{return db.transaction(()=>{
  const lesson=db.prepare('SELECT * FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId),course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);if(!lesson||lesson.presentation_type!=='visit'||lesson.status==='cancelled'||course.status==='archived')throw Error('目标必须是经核对的可维护参观课');
  if(!db.prepare('PRAGMA table_info(lessons)').all().some(c=>c.name==='article_blocks'))throw Error('先完成兼容迁移023');
  const token=i=>{const s=hash(`${courseId}:${lessonId}:${sourceDigest}:${i}`).slice(0,32);return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
  const old=images.map(i=>db.prepare('SELECT * FROM resources WHERE course_id=? AND lesson_id=? AND upload_token=?').get(courseId,lessonId,token(i.index)));
  let n=0;const build=ids=>blocks.map((b,index)=>b.type==='paragraph'?{id:'source-'+sourceDigest.slice(0,12)+'-'+index,type:'paragraph',text:b.text}:{id:'source-'+sourceDigest.slice(0,12)+'-'+index,type:'image',resourceId:ids[n++],title:'',caption:''});
  if(old.every(Boolean)){const expected=build(old.map(r=>r.id));if(lesson.article_title!==source.title||lesson.article_blocks!==JSON.stringify(expected)||old.some((r,i)=>!fs.existsSync(r.file_path)||hash(fs.readFileSync(r.file_path))!==images[i].digest))throw Error('目标已被维护或原文件变化，保留当前稿，停止覆盖');return{status:'reused',courseId,lessonId,images:9,paragraphs:blocks.length-9,characters:source.text.length,sourceDigest,contentRevision:revision(lesson),createdResources:0};}
  if(old.some(Boolean)||lesson.article_title||lesson.article_url||lesson.article_blocks!=='[]')throw Error('目标已有用户稿或部分导入，保留并报告冲突');
  if(expectedRevision!==revision(lesson))throw Error('目标revision不一致，请重新核对后导入');
  const report={status:apply?'imported':'dry-run',courseId,lessonId,images:9,paragraphs:blocks.length-9,characters:source.text.length,sourceDigest,duplicateImagePositions:[6,7],createdResources:apply?9:0};if(!apply)return report;
  const dir=path.join(dataDir,'uploads','resources');fs.mkdirSync(dir,{recursive:true});const ids=images.map(i=>{const file=path.join(dir,`article-${token(i.index)}.jpg`);if(fs.existsSync(file))throw Error('发现未登记文件，停止覆盖');fs.writeFileSync(file,i.bytes,{flag:'wx'});createdFiles.push(file);const r=db.prepare("INSERT INTO resources(course_id,lesson_id,resource_type,title,file_path,file_size,upload_by,file_name,file_type,upload_token,upload_digest) VALUES(?,?,'other',?,?,?,?,?,'jpg',?,?)").run(courseId,lessonId,source.title+' · 原图'+i.index,file,i.bytes.length,course.created_by,`image-${String(i.index).padStart(2,'0')}.jpg`,token(i.index),i.digest);return Number(r.lastInsertRowid);});
  n=0;db.prepare('UPDATE lessons SET article_title=?,article_blocks=? WHERE id=? AND course_id=?').run(source.title,JSON.stringify(build(ids)),lessonId,courseId);
  return {...report,resourceIds:ids,contentRevision:revision(db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId))};
 }).immediate();}catch(e){for(const f of createdFiles)fs.unlinkSync(f);throw e;}finally{db.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(!['--source','--data','--course','--lesson','--revision'].every(k=>args.includes(k)))throw Error('用法 --source 本地素材目录 --data .local/目标 --course 实际ID --lesson 实际ID --revision 已核对散列 [--apply]');
 const dataDir=path.resolve(root,get('--data')),inside=path.relative(path.join(root,'.local'),dataDir);if(!inside||inside.startsWith('..')||path.isAbsolute(inside))throw Error('目标必须是项目.local独立目录');
 console.log(JSON.stringify(importArticle({sourceDir:path.resolve(get('--source')),dataDir,courseId:Number(get('--course')),lessonId:Number(get('--lesson')),expectedRevision:get('--revision'),apply:args.includes('--apply')})));
}
