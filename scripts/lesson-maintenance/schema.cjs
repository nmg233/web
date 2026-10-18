// Deploy new code first. Default read-only; --apply requires maintenance confirmation and joint backup.
const fs=require('node:fs'),path=require('node:path'),{backup}=require('./backup.cjs');
async function migrate(options){
 const Database=require('../../backend/node_modules/better-sqlite3'),db=new Database(path.resolve(options.dbPath),{readonly:!options.apply,fileMustExist:true});
 try{db.pragma('foreign_keys=ON');const applied=db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all(),files=fs.readdirSync(path.join(__dirname,'../../backend/database/migrations')).filter(n=>/^\d+_.*\.sql$/.test(n)),pending=files.filter(n=>!applied.some(r=>r.version===parseInt(n,10))).sort((a,b)=>parseInt(a)-parseInt(b));
  const result={dryRun:!options.apply,writes:0,applied,pending,codeReference:'1031 course-rewards-final; deploy matching application code',noSeed:true};if(!options.apply)return result;
  if(!options.maintenanceConfirmed)throw Error('先停止业务写入并确认维护窗口，传入--maintenance-confirmed');if(!options.backupDir)throw Error('必须明确指定全新的私有--backup-dir');
  result.backup=await backup(db,{destination:options.backupDir,uploads:options.uploads,feedback:options.feedback});require('../../backend/database/migrate').runMigrations(db);if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('迁移后校验未通过；停止上线并核对备份');return{...result,dryRun:false,writes:pending.length,schema:db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()};
 }finally{db.close();}
}
async function cli(args=process.argv.slice(2)){const arg=k=>args[args.indexOf(k)+1];if(!args.includes('--db'))throw Error('必须明确指定--db');if(args.includes('--apply')&&args.includes('--dry-run'))throw Error('apply与dry-run不能同时指定');return migrate({dbPath:arg('--db'),uploads:args.includes('--uploads')?arg('--uploads'):null,feedback:args.includes('--feedback')?arg('--feedback'):null,backupDir:args.includes('--backup-dir')?arg('--backup-dir'):null,maintenanceConfirmed:args.includes('--maintenance-confirmed'),apply:args.includes('--apply')});}
if(require.main===module)cli().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={migrate,cli};
