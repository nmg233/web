#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Database=require('../backend/node_modules/better-sqlite3'),{contentRevision:hash}=require('../backend/helpers/contentRevision');
const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
function writeNew(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2),{flag:'wx'});}
function readState(db,id){const course=db.prepare('SELECT * FROM courses WHERE id=?').get(id);if(!course)throw Error('指定课程不存在');return{course,bindings:db.prepare('SELECT * FROM course_theme_bindings WHERE course_id=? ORDER BY purpose').all(id)};}
async function main(){
 const dbPath=value('--db');if(!dbPath)throw Error('必须明确 --db；默认只读预演，不访问正式站');
 const apply=value('--apply'),rollback=value('--rollback'),writing=!!(apply||rollback);
 if(writing&&!args.includes('--offline-confirm'))throw Error('请先停止服务，明确 --offline-confirm');
 const db=new Database(path.resolve(dbPath),{readonly:!writing,fileMustExist:true});
 try{
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('数据库完整性检查失败');
  if(!writing){
   const id=Number(value('--course-id')),title=value('--expected-title'),output=value('--plan');
   if(!Number.isSafeInteger(id)||!title||!output)throw Error('预演须提供 --course-id、--expected-title、--plan <新文件>');
   const before=readState(db,id);if(before.course.title!==title)throw Error('课程 ID 与预期标题不一致，停止；不按名称猜测绑定');
   const historical=db.prepare("SELECT 1 FROM course_content_audit WHERE course_id=? AND (json_extract(before_json,'$.presentation_theme')='voyage' OR json_extract(after_json,'$.presentation_theme')='voyage') LIMIT 1").get(id);
   let evidence=null;const file=value('--legacy-evidence');
   if(file){const bytes=fs.readFileSync(file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==value('--evidence-sha256'))throw Error('原课程配置证据 SHA-256 不一致');evidence=JSON.parse(bytes);if(evidence.courseId!==id||evidence.presentation_theme!=='voyage'||!evidence.sourceCommit)throw Error('证据不属于指定课程或缺少原提交来源');}
   if(before.course.presentation_theme!=='voyage'&&!historical&&!evidence)throw Error('未核实这是存量远航课程。须提供带课程 ID、原提交 SHA 的旧配置证据及其 SHA-256；不能为新课开放专属主题');
   const clear=args.includes('--use-built-in-backgrounds');
   const plan={kind:'restore-existing-voyage-v1',courseId:id,title,source:before,expectedHash:hash(before),useBuiltInBackgrounds:clear,changes:{presentation_theme:'voyage',public_theme:null,background_opacity:1,removeBindings:clear?['desktop','mobile']:[]},preserve:'课程封面、标识、关卡图、所有图片文件、教学和学习奖励记录',legacyEvidence:evidence};
   writeNew(path.resolve(output),plan);console.log(JSON.stringify({mode:'read-only-plan',courseId:id,title,plan:path.resolve(output),current:{presentation_theme:before.course.presentation_theme,public_theme:before.course.public_theme,overrides:before.bindings.map(b=>b.purpose)},changes:plan.changes}));return;
  }
  const document=JSON.parse(fs.readFileSync(path.resolve(apply||rollback),'utf8')),id=document.courseId;
  if(!Number.isSafeInteger(id))throw Error('计划课程编号无效');
  if(!rollback&&(document.kind!=='restore-existing-voyage-v1'||document.source?.course.id!==id||document.source.course.title!==document.title||hash(document.source)!==document.expectedHash))throw Error('预演文件身份或源散列无效');
  if(rollback&&document.kind!=='voyage-apply-receipt')throw Error('只接受本工具成功执行的回执进行回滚');
  const receipt=path.resolve(value('--receipt')||(apply||rollback)+'.receipt.json');if(fs.existsSync(receipt))throw Error('回执目标已存在，请指定新 --receipt，未执行写入');
  const current=readState(db,id),expected=rollback?document.afterHash:document.expectedHash;
  if(hash(current)!==expected)throw Error('课程配置在预演/执行后已有变化，拒绝覆盖；重新核对并预演');
  const backupName=value('--backup');if(!backupName||fs.existsSync(path.resolve(backupName)))throw Error('写入前须指定新的 --backup 文件，不覆盖已有备份');
  const backup=path.resolve(backupName);fs.mkdirSync(path.dirname(backup),{recursive:true});await db.backup(backup);
  db.transaction(()=>{
   if(hash(readState(db,id))!==expected)throw Error('备份期间配置变化，停止');
   const course=rollback?document.before.course:{presentation_theme:'voyage',public_theme:null,background_opacity:1};
   db.prepare('UPDATE courses SET presentation_theme=?,public_theme=?,background_opacity=?,theme_revision=theme_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(course.presentation_theme,course.public_theme,course.background_opacity,id);
   if(rollback){db.prepare('DELETE FROM course_theme_bindings WHERE course_id=?').run(id);for(const b of document.before.bindings)db.prepare('INSERT INTO course_theme_bindings(course_id,purpose,image_id) VALUES(?,?,?)').run(id,b.purpose,b.image_id);}
   else if(document.useBuiltInBackgrounds)db.prepare("DELETE FROM course_theme_bindings WHERE course_id=? AND purpose IN ('desktop','mobile')").run(id);
  }).immediate();
  const after=readState(db,id);
  writeNew(receipt,{kind:rollback?'voyage-rollback-receipt':'voyage-apply-receipt',courseId:id,before:current,after,afterHash:hash(after),backup,at:new Date().toISOString()});
  console.log(JSON.stringify({mode:rollback?'rolled-back':'applied',courseId:id,receipt,backup,preservedFiles:true}));
 }finally{db.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,readState};
