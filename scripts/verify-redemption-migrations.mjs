import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {root,Database} from './teaching.mjs';
const require=createRequire(import.meta.url),{runMigrations}=require('../backend/database/migrate.js');
const area=path.join(root,'.local/redemption-migrations-'+Date.now());fs.mkdirSync(area,{recursive:true});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function rows(db){return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations','migration_identity_history') ORDER BY name").all().map(({name})=>{const columns=db.prepare(`PRAGMA table_info("${name}")`).all().map(c=>c.name);return [name,{columns,hash:hash(db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${name}" ORDER BY ${columns.map(c=>'"'+c+'"').join(',')}`).all())}];}));}
function preserved(db,baseline){for(const [name,{columns,hash:expected}]of Object.entries(baseline))assert.equal(hash(db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${name}" ORDER BY ${columns.map(c=>'"'+c+'"').join(',')}`).all()),expected,'preserved '+name);}
const reports=[];
function verify(name,file){const db=new Database(file);db.pragma('foreign_keys=ON');const before=rows(db);runMigrations(db);preserved(db,before);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_gifts').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_orders').get().n,0);
 const history=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();runMigrations(db);assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),history);preserved(db,before);reports.push({name,tablesPreserved:Object.keys(before).length,migrations:history.length,integrity:'ok',foreignKeys:'ok',repeat:'unchanged',catalog:'empty'});db.close();}
// Always use the pre-upgrade backup, even after the real environment has upgraded.
// Otherwise repeating this check would silently stop testing the old namespace.
const oldFile=path.join(root,'.local/teaching-before-real-redemption-activation-20261011/teaching.db');
const copy=new Database(oldFile,{readonly:true,fileMustExist:true});
assert.equal(copy.prepare('SELECT name FROM schema_migrations WHERE version=16').get()?.name,'016_course_avatar_preferences.sql','必须提供升级前教学库，不以新库代替旧库验收');
await copy.backup(path.join(area,'current-old.db'));copy.close();verify('当前教学旧库一致性副本',path.join(area,'current-old.db'));
const upstreamFile=path.join(area,'upstream-old.db'),upstream=new Database(upstreamFile);
const read=p=>execFileSync('git',['show','681328d24f9ece352305cb3ebc2e71170b2e296e:'+p],{cwd:root,encoding:'utf8'});
upstream.exec(read('backend/database/schema.sql'));upstream.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
const upstreamFiles=execFileSync('git',['ls-tree','-r','--name-only','681328d','--','backend/database/migrations'],{cwd:root,encoding:'utf8'}).trim().split('\n');for(const p of upstreamFiles){const name=path.basename(p);upstream.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(Number(name.split('_')[0]),name);}
upstream.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'migration-admin','unused-hash','隔离管理员','admin'),(2,'migration-student','unused-hash','隔离学生','student')").run();
upstream.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by) VALUES(1,'上游结构验证课程（合成）','junior','basic','published',1)").run();upstream.prepare("INSERT INTO lessons(id,course_id,title) VALUES(1,1,'旧课时（合成）')").run();upstream.prepare("INSERT INTO lesson_learning_reports(student_id,lesson_id,summary,status) VALUES(2,1,'保留旧报告','submitted')").run();upstream.close();verify('上游最新main旧结构合成库（非上游生产库）',upstreamFile);
verify('空库',path.join(area,'empty.db'));
// A corrupted known local migration must fail atomically, rather than be marked applied.
const bad=new Database(path.join(area,'bad.db'));bad.exec('CREATE TABLE users(id INTEGER);CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT)');bad.prepare('INSERT INTO schema_migrations VALUES(16,?,?)').run('016_course_avatar_preferences.sql','old-time');assert.throws(()=>runMigrations(bad),/结构与记录不符/);assert.equal(bad.prepare('SELECT version FROM schema_migrations').get().version,16);bad.close();reports.push({name:'已知迁移结构损坏',result:'拒绝升级且事务回滚'});
const restore=path.join(area,'restore');
execFileSync(process.execPath,['scripts/teaching.mjs','restore','--from','.local/teaching-before-real-redemption-20261011','--data',path.relative(root,restore)],{cwd:root,stdio:'pipe'});
function bytes(dir,prefix=''){return Object.fromEntries(fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?Object.entries(bytes(path.join(dir,e.name),prefix+e.name+'/')):[[prefix+e.name,hash(fs.readFileSync(path.join(dir,e.name)))]]));}
for(const dir of ['uploads','feedback'])assert.deepEqual(bytes(path.join(restore,dir)),bytes(path.join(root,'.local/teaching-before-real-redemption-20261011',dir)));
assert.deepEqual(fs.readFileSync(path.join(restore,'private.json')),fs.readFileSync(path.join(root,'.local/teaching-before-real-redemption-20261011/private.json')));
const restored=new Database(path.join(restore,'teaching.db'));assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(restored.pragma('foreign_key_check'),[]);restored.close();verify('备份恢复到独立目录后升级',path.join(restore,'teaching.db'));
reports.push({name:'实际teaching restore工具恢复',result:'上传文件与反馈文件逐字节一致，私有配置一致；原环境未覆盖'});
const report={upstream:'681328d24f9ece352305cb3ebc2e71170b2e296e',privateArea:area,reports};fs.mkdirSync(path.join(root,'docs/real-redemption/evidence'),{recursive:true});fs.writeFileSync(path.join(root,'docs/real-redemption/evidence/migrations.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(reports,null,2));
