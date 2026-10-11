import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Database,root} from './teaching.mjs';

// Read-only inspection of the live teaching database. All output stays private.
const dir=path.join(root,'.local/teaching'),out=path.join(root,'.local/authoring-patch-20261011');
const digest=value=>createHash('sha256').update(value).digest('hex');
const db=new Database(path.join(dir,'teaching.db'),{readonly:true,fileMustExist:true});
function state(){
 const tables={};
 db.transaction(()=>{
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
   // Login sessions are operational, not teaching data. No learning/reward exclusions.
   if(name==='refresh_tokens')continue;
   tables[name]=digest(JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all().map(row=>JSON.stringify(row)).sort()));
  }
 })();
 const files={};
 for(const folder of ['uploads','feedback'])if(fs.existsSync(path.join(dir,folder)))for(const file of fs.readdirSync(path.join(dir,folder),{recursive:true})){
  const full=path.join(dir,folder,file);if(fs.statSync(full).isFile())files[folder+'/'+file]=digest(fs.readFileSync(full));
 }
 const copy={};
 for(const folder of ['frontend/src/content','docs/lesson-authoring/copy-review'])for(const file of fs.readdirSync(path.join(root,folder),{recursive:true})){
  const full=path.join(root,folder,file);if(fs.statSync(full).isFile())copy[folder+'/'+file]=digest(fs.readFileSync(full));
 }
 return {tables,files,copy,config:digest(fs.readFileSync(path.join(dir,'private.json'))),integrity:db.pragma('integrity_check',{simple:true}),foreignKeys:db.pragma('foreign_key_check').length};
}
try{
 const current=state();assert.equal(current.integrity,'ok');assert.equal(current.foreignKeys,0);
 if(process.argv[2]==='baseline'){
  assert.ok(!fs.existsSync(out),'Refuse to overwrite baseline');fs.mkdirSync(out,{recursive:true});
  await db.backup(path.join(out,'teaching.db'));fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(current,null,2));
  console.log(JSON.stringify({mode:'baseline',tables:Object.keys(current.tables).length,files:Object.keys(current.files).length,copyFiles:Object.keys(current.copy).length,integrity:current.integrity}));
 }else{
  const before=JSON.parse(fs.readFileSync(path.join(out,'baseline.json')));assert.deepEqual(current,before,'Real teaching data/files/manual copy changed');
  fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify({preserved:true,...current},null,2));
  console.log(JSON.stringify({preserved:true,tables:Object.keys(current.tables).length,files:Object.keys(current.files).length,copyFiles:Object.keys(current.copy).length,integrity:current.integrity}));
 }
}finally{db.close();}
