// Read-only source -> new private copy. Never imports the auto-migrating app DB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Database=require('../backend/node_modules/better-sqlite3'),assert=require('node:assert/strict');
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1],root=path.resolve(__dirname,'..');
async function run(){
 if(!args.includes('--source-db')||!args.includes('--out'))throw Error('用法 --source-db 已有数据库 --out 项目内全新私有目录');
 const source=path.resolve(value('--source-db')),out=path.resolve(value('--out')),relative=path.relative(root,out);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(out))throw Error('输出必须为项目内全新私有目录，禁止覆盖');
 fs.mkdirSync(out,{recursive:true});const src=new Database(source,{readonly:true,fileMustExist:true});
 try{await src.backup(path.join(out,'copy.db'));}finally{src.close();}
 const db=new Database(path.join(out,'copy.db'));db.pragma('foreign_keys=ON');
 try{
  const tables=['users','courses','lessons','enrollments','resources','knowledge_cards','card_exercises','lesson_learning_reports','works','work_reviews','reflections','student_coin_ledger','student_coin_checkins','reward_gifts','reward_orders','student_badge_grants'];const before={};
  for(const table of tables){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;before[table]={columns:db.pragma('table_info('+table+')').map(c=>c.name),rows:db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()};}
  const from=db.prepare('SELECT max(version) v FROM schema_migrations').get().v;
  const {runMigrations}=require('../backend/database/migrate');runMigrations(db);
  const counts={};for(const[table,b]of Object.entries(before)){const rows=db.prepare('SELECT '+b.columns.map(c=>'"'+c+'"').join(',')+' FROM '+table+' ORDER BY rowid').all();assert.deepEqual(rows,b.rows,table+'原字段/原行必须保持');counts[table]={count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}
  const history=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();runMigrations(db);assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),history);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  const report={sourceReadOnly:true,from,to:history.at(-1).version,repeatedMigration:'unchanged',originalRows:'identical',integrity:'ok',foreignKeys:[],tables:counts,scope:'private DB copy only; no source writes and no application startup'};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({from,to:report.to,originalTables:Object.keys(counts).length,rowsUnchanged:true,integrity:'ok',repeat:'unchanged'}));
 }finally{db.close();}
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
