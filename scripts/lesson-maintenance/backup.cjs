const fs=require('node:fs'),path=require('node:path'),{hashFile}=require('./hash-file.cjs');
async function backup(db,{destination,uploads,feedback}){
 const root=path.resolve(destination);if(fs.existsSync(root))throw Error('备份目标已存在，拒绝覆盖');
 for(const source of [uploads,feedback].filter(Boolean)){const relative=path.relative(path.resolve(source),root);if(!relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw Error('备份目录不能放在uploads/私有附件目录内部');}
 if(!uploads||!fs.statSync(uploads).isDirectory())throw Error('必须指定真实uploads目录');
 fs.mkdirSync(root,{recursive:true,mode:0o700});const file=path.join(root,'database.db');await db.backup(file);fs.chmodSync(file,0o600);
 const manifest=[];
 function copy(from,to,prefix){fs.mkdirSync(to,{recursive:true,mode:0o700});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const source=path.join(from,entry.name),target=path.join(to,entry.name),relative=prefix+entry.name;if(entry.isSymbolicLink())throw Error('备份遇到符号链接，先人工核对：'+relative);if(entry.isDirectory())copy(source,target,relative+'/');else if(entry.isFile()){fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);fs.chmodSync(target,0o600);manifest.push({path:relative,bytes:fs.statSync(target).size,sha256:hashFile(target)});}}}
 copy(path.resolve(uploads),path.join(root,'uploads'),'uploads/');if(feedback){if(!fs.existsSync(feedback))throw Error('指定的私有附件目录不存在');copy(path.resolve(feedback),path.join(root,'feedback'),'feedback/');}
 const Database=require('./runtime.cjs').databaseConstructor(),check=new Database(file,{fileMustExist:true});try{if(check.pragma('integrity_check',{simple:true})!=='ok'||check.pragma('foreign_key_check').length)throw Error('备份完整性/外键检查未通过');
  // Only the new private backup is normalized. SQLite backup can retain WAL
  // mode, and a subsequent readonly check may create sidecars absent from the
  // manifest. DELETE mode makes this standalone snapshot self contained.
  if(check.pragma('journal_mode=DELETE',{simple:true})!=='delete')throw Error('私有备份副本无法转换为独立日志模式');
 }finally{check.close();}
 const report={database:'database.db',databaseSha256:hashFile(file),files:manifest,originalUploadsRoot:path.resolve(uploads),originalFeedbackRoot:feedback?path.resolve(feedback):null,feedbackIncluded:Boolean(feedback),note:'联合备份要求维护窗口停止业务写入；SQLite backup API处理WAL。备份包含真实数据，仅私有保存'};fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});return{directory:root,files:manifest.length,integrity:'ok'};
}
module.exports={backup};
