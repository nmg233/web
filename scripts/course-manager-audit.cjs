// Read-only compatibility inventory. Does not load application config or run migrations.
const fs=require('node:fs'),path=require('node:path'),Database=require('../backend/node_modules/better-sqlite3');
const args=process.argv.slice(2),index=args.indexOf('--db');
if(index<0||!args[index+1]){console.error('用法：node scripts/course-manager-audit.cjs --db <数据库路径>；输出含内部账号关系，请私有保存');process.exitCode=1;}
else{
 let db;try{
 const file=path.resolve(args[index+1]);if(!fs.existsSync(file))throw Error('数据库不存在');db=new Database(file,{readonly:true,fileMustExist:true});
 const explicit=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='course_managers'").get());
 const relations=explicit?db.prepare('SELECT m.course_id,c.title,m.mentor_id,u.username,u.real_name,m.source,m.active,m.revision,m.granted_by,m.granted_at,m.revoked_by,m.revoked_at FROM course_managers m JOIN courses c ON c.id=m.course_id JOIN users u ON u.id=m.mentor_id ORDER BY m.course_id,m.mentor_id').all():db.prepare(`SELECT c.id course_id,c.title,u.id mentor_id,u.username,u.real_name,CASE WHEN c.created_by=u.id THEN 'legacy_creator' ELSE 'legacy_instructor' END source FROM courses c CROSS JOIN users u WHERE u.role='academic_mentor' AND (c.created_by=u.id OR EXISTS(SELECT 1 FROM lessons l WHERE l.course_id=c.id AND l.instructor_id=u.id)) ORDER BY c.id,u.id`).all();
 console.log(JSON.stringify({schemaVersion:db.prepare('SELECT max(version) v FROM schema_migrations').get().v,mode:explicit?'explicit':'legacy_projection',relations},null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}finally{db?.close();}
}
