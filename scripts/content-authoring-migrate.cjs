#!/usr/bin/env node
// Offline operator tool. Default is read-only; no numbered migration is reserved.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Database=require('../backend/node_modules/better-sqlite3');
const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
 const name=value('--db');if(!name)throw Error('用法：--db <数据库绝对路径> [--apply --backup <新备份文件> --offline-confirm] [--restore-copy <新验证副本>]');
 const dbPath=path.resolve(name),apply=args.includes('--apply'),restore=value('--restore-copy');
 if(apply&&!args.includes('--offline-confirm'))throw Error('请停止服务后明确 --offline-confirm；不在线迁移');
 if(!fs.existsSync(dbPath))throw Error('指定旧库不存在；本工具不初始化或重建教学库');
 const db=new Database(dbPath,{readonly:!apply,fileMustExist:true});
 try{
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('源库完整性检查不通过，停止');
  const state=()=>({schemaVersion:db.prepare('SELECT MAX(version) n FROM schema_migrations').get().n,cardsRequired:db.pragma('table_info(lessons)').some(c=>c.name==='cards_required'),labSettings:!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='course_lab_settings'").get(),foreignKeyErrors:db.pragma('foreign_key_check').length});
  const before=state();if(before.foreignKeyErrors)throw Error('旧库存在外键错误，停止并人工核对，不自动修复');
  if(restore){const target=path.resolve(restore);if(fs.existsSync(target)||target===dbPath)throw Error('恢复验证目标必须是新的独立副本，不能覆盖原库');fs.mkdirSync(path.dirname(target),{recursive:true});await db.backup(target);const verify=new Database(target,{readonly:true});try{if(verify.pragma('integrity_check',{simple:true})!=='ok'||verify.pragma('foreign_key_check').length)throw Error('恢复副本核验失败');}finally{verify.close();}console.log(JSON.stringify({restoredCopy:target,sha256:digest(target),sourceUnchanged:true}));return;}
  if(!apply){console.log(JSON.stringify({mode:'read-only-check',database:dbPath,...before}));return;}
  if(before.schemaVersion<1036)throw Error('请先部署配套代码并运行已有核心迁移至 1036；本工具不跳过核心兼容升级');
  const backupName=value('--backup');if(!backupName)throw Error('--apply 必须同时提供 --backup，且目标不得已存在');
  const backup=path.resolve(backupName);if(fs.existsSync(backup)||backup===dbPath)throw Error('备份目标已存在或等于原库，停止');
  fs.mkdirSync(path.dirname(backup),{recursive:true});await db.backup(backup);
  const migrations=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  const result=require('../backend/database/contentAuthoringExtension').apply(db);
  const after=state();if(after.schemaVersion!==before.schemaVersion||JSON.stringify(migrations)!==JSON.stringify(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()))throw Error('数字迁移记录不应发生变化');
  console.log(JSON.stringify({mode:'applied',before,after,extension:result.name,backup,backupSha256:digest(backup)}));
 }finally{db.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
