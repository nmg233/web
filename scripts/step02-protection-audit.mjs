// Read-only verification against a private consistent pre-migration backup.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Database,root} from './teaching.mjs';
const target=path.join(root,'.local/teaching'),backup=path.resolve(root,process.argv[2]||'.local/teaching-before-step02-20261008');
if(!path.relative(path.join(root,'.local'),backup)||path.relative(path.join(root,'.local'),backup).startsWith('..'))throw Error('Backup must be an independent private .local directory');
const a=new Database(path.join(target,'teaching.db'),{readonly:true,fileMustExist:true}),b=new Database(path.join(backup,'teaching.db'),{readonly:true,fileMustExist:true});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize=(row,base)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string'?v.replaceAll(base,'TEACHING').replaceAll(base.replaceAll('\\','/'),'TEACHING'):v]));
try{
 const tables=[];
 for(const{name}of b.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name").all()){
  if(['schema_migrations','refresh_tokens'].includes(name))continue;
  const cols=b.prepare(`PRAGMA table_info("${name}")`).all().map(c=>'"'+c.name+'"').join(',');
  const old=b.prepare(`SELECT ${cols} FROM "${name}" ORDER BY rowid`).all().map(r=>normalize(r,backup)),current=a.prepare(`SELECT ${cols} FROM "${name}" ORDER BY rowid`).all().map(r=>normalize(r,target));
  tables.push({table:name,rows:old.length,oldColumnsPreserved:hash(old)===hash(current)});
 }
 const files=base=>Object.fromEntries(['uploads','feedback'].flatMap(folder=>fs.readdirSync(path.join(base,folder),{recursive:true}).sort().filter(n=>fs.statSync(path.join(base,folder,n)).isFile()).map(n=>[folder+'/'+n,createHash('sha256').update(fs.readFileSync(path.join(base,folder,n))).digest('hex')])));
 const result={tables,existingFileBytesPreserved:hash(files(target))===hash(files(backup)),integrity:a.pragma('integrity_check',{simple:true}),foreignKeyViolations:a.pragma('foreign_key_check').length,migration20:a.prepare('SELECT count(*) n FROM schema_migrations WHERE version=20').get().n,reflectionNewColumns:a.prepare('PRAGMA table_info(reflections)').all().map(c=>c.name).filter(c=>['reflection_version','entry_note','together_note','extra_note'].includes(c)),scope:'Read-only original-column comparison; relocated paths normalized, auth refresh tokens and derived FTS excluded'};
 fs.writeFileSync(path.join(root,'docs/next-version/step-02/data-protection.json'),JSON.stringify(result,null,2));
 if(tables.some(t=>!t.oldColumnsPreserved)||!result.existingFileBytesPreserved||result.integrity!=='ok'||result.foreignKeyViolations||result.migration20!==1)throw Error('Protection audit failed; see aggregate evidence');
 const parse=s=>JSON.parse(s.split(/export const uiCopy\s*=\s*/)[1].trim().replace(/;$/,'')),old=parse(execFileSync('git',['show','a7ad0fb:frontend/src/content/uiCopy.jsx'],{cwd:root,encoding:'utf8'})),current=parse(fs.readFileSync(path.join(root,'frontend/src/content/uiCopy.jsx'),'utf8'));
 const changed=Object.keys(old).filter(id=>JSON.stringify(old[id])!==JSON.stringify(current[id])),frozen=execFileSync('git',['diff','--name-only','a7ad0fb','--','docs/redesign-v2','docs/next-version/step-01','frontend/dist'],{cwd:root,encoding:'utf8'}).trim();
 fs.writeFileSync(path.join(root,'docs/next-version/step-02/copy-protection.json'),JSON.stringify({baseline:'a7ad0fbeb33609e44bec793d2d4fe0c0dbcdae45',oldRegistryEntries:Object.keys(old).length,changedOldEntries:changed,newRegistryEntries:Object.keys(current).filter(id=>!old[id]),frozenPathsDiff:frozen||null},null,2));
 if(changed.length||frozen)throw Error('Protected copy changed');
 console.log(JSON.stringify({status:'passed',tables:tables.length,fileBytesPreserved:true,migration20:1,oldCopyEntries:Object.keys(old).length,changedOldCopy:0}));
}finally{a.close();b.close();}
