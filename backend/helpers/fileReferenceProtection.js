const path=require('path');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
function checker(db){return (target,directory=false)=>{
 const encoded=JSON.stringify(target).slice(1,-1),prefix=path.resolve(target)+path.sep;
 for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const columns=db.prepare(`PRAGMA table_info(${quote(name)})`).all().filter(c=>['file_path','video_path','staging_dir'].includes(c.name)||c.name.endsWith('_json'));
  for(const col of columns){
   if(col.name.endsWith('_json')){if(db.prepare(`SELECT 1 FROM ${quote(name)} WHERE instr(${quote(col.name)},?)>0 LIMIT 1`).get(encoded))return true;}
   else for(const row of db.prepare(`SELECT ${quote(col.name)} value FROM ${quote(name)} WHERE ${quote(col.name)} IS NOT NULL`).all())if(path.resolve(row.value)===path.resolve(target)||(directory&&path.resolve(row.value).startsWith(prefix)))return true;
  }
 }
 return false;
};}
module.exports={checker};
