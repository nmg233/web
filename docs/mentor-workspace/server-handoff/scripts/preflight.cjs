#!/usr/bin/env node
// Read-only operator inventory. Never loads app/config/database or runs SQL migrations.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const TARGET_SCHEMA=1034;
const CORE=['users','schools','classes','courses','lessons','enrollments','knowledge_cards','card_exercises','resources','course_replays','lesson_content_versions','student_lesson_versions','lesson_learning_reports','works','reflections','student_coin_ledger','student_coin_checkins','coin_activity','reward_gifts','reward_orders','student_badge_grants','lesson_badge_definitions','feedbacks','feedback_messages','school_applications'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
function parse(args){
 if(args.includes('--help'))return{help:true};
 const allowed=new Set(['--app-root','--db','--output','--compare']),o={};
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!allowed.has(key)||!value||value.startsWith('--')||o[key])throw Error('参数错误：只支持 --app-root/--db/--output/--compare 及明确路径');o[key]=value;}
 for(const key of['--app-root','--db'])if(!o[key]||!path.isAbsolute(o[key]))throw Error(key+' 必须为明确绝对路径');
 for(const key of['--output','--compare'])if(o[key]&&!path.isAbsolute(o[key]))throw Error(key+' 必须为绝对路径');
 return o;
}
function digestTable(db,name,columns,order){
 const hash=crypto.createHash('sha256');let rows=0;
 for(const row of db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY ${order.map(quote).join(',')}`).iterate()){
  hash.update(JSON.stringify(columns.map(c=>row[c]))+'\n');rows++;
 }
 return{columns,order,rows,sha256:hash.digest('hex')};
}
function inventory(o){
 const appRoot=fs.realpathSync(o['--app-root']),dbPath=fs.realpathSync(o['--db']);
 if(!fs.statSync(dbPath).isFile())throw Error('目标数据库必须是已有文件');
 const requireApp=createRequire(path.join(appRoot,'backend/package.json')),Database=requireApp('better-sqlite3');
 const dir=path.join(appRoot,'backend/database/migrations');
 const files=fs.readdirSync(dir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort((a,b)=>parseInt(a,10)-parseInt(b,10));
 const expected=new Map(),stop=[];
 for(const file of files){const version=parseInt(file,10);if(expected.has(version))stop.push('代码目录迁移编号重复：'+version);expected.set(version,file);}
 if(Math.max(...expected.keys())!==TARGET_SCHEMA)stop.push('代码迁移最高版本不等于本交接说明1034，请重新核对审核版本');
 const before=o['--compare']?JSON.parse(fs.readFileSync(o['--compare'],'utf8')):null;
 if(before&&(before.format!=='mentor-release-inventory-v1'||!before.tables))throw Error('compare不是本工具生成的基线报告');
 const db=new Database(dbPath,{readonly:true,fileMustExist:true});
 try{
  const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const applied=exists('schema_migrations')?db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all():[];
  if(!exists('schema_migrations'))stop.push('缺少schema_migrations：须单独制定古老库演练方案');
  for(const row of applied){const wanted=expected.get(row.version);if(row.version===1&&row.name==='baseline_schema')continue;if(!wanted||wanted!==row.name)stop.push(`迁移身份需核对：${row.version} ${row.name}（代码：${wanted||'不存在'}）；已知旧编号桥接也须单独演练`);}
  const integrity=db.pragma('integrity_check',{simple:true}),foreignKeys=db.pragma('foreign_key_check');
  if(integrity!=='ok'||foreignKeys.length)stop.push('SQLite完整性或外键检查未通过');
  if(applied.some(r=>r.version===1031))for(const name of CORE)if(!exists(name))stop.push('1031核心表缺失：'+name);
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations' ORDER BY name").all().map(r=>r.name);
  const tables={},comparison=[];
  for(const name of new Set([...names,...Object.keys(before?.tables||{})])){
   if(!exists(name)){if(before?.tables[name])stop.push('原表缺失：'+name);continue;}
   const info=db.prepare(`PRAGMA table_info(${quote(name)})`).all(),available=info.map(c=>c.name),prior=before?.tables[name];
   const columns=prior?.columns||available,order=prior?.order||(info.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name));
   if(columns.some(c=>!available.includes(c))||!columns.length){stop.push('原列缺失或报告无列：'+name);continue;}
   tables[name]=digestTable(db,name,columns,order.length?order:columns);
   if(prior){const unchanged=prior.rows===tables[name].rows&&prior.sha256===tables[name].sha256;comparison.push({table:name,unchanged});if(!unchanged)stop.push('原列数据发生变化，需要解释：'+name);}
  }
  const pending=files.filter(file=>!applied.some(row=>row.version===parseInt(file,10)));
  const result={format:'mentor-release-inventory-v1',createdAt:new Date().toISOString(),readOnly:true,businessWrites:0,dbPath,appRoot,targetSchema:TARGET_SCHEMA,integrity,foreignKeyViolationCount:foreignKeys.length,applied,pending,tables,comparison,stopConditions:stop,readyForRehearsal:stop.length===0,notes:['未执行迁移或启动应用；pending为空也不等于业务验收完成','原列哈希可能因恢复副本路径重定位而合理变化，应在恢复副本重新生成基线','未核验全部附件引用，不备份配置，不验证AI或正式部署']};
  if(o['--output'])fs.writeFileSync(o['--output'],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
 }finally{db.close();}
}
if(require.main===module){try{const o=parse(process.argv.slice(2));if(o.help){console.log('node preflight.cjs --app-root <完整代码绝对路径> --db <已有数据库绝对路径> [--output <新报告绝对路径>] [--compare <迁移前报告绝对路径>]');}else{const result=inventory(o);console.log(JSON.stringify(result,null,2));if(result.stopConditions.length)process.exitCode=2;}}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={parse,inventory};
