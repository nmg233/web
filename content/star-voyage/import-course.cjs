const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const requests = require('../../backend/helpers/requestResults');
const { resolveDbPath } = require('../aviation-intro/admin-import.cjs');

const courseFields = ['title','theme','description','driving_question','story_line','grade_level','difficulty','total_hours','materials_needed','cover_image','presentation_theme','map_mode'];
const lessonFields = ['title','description','sort_order','duration','teaching_tip','start_at','end_at','location','presentation_type','content_state','article_url','article_title','moments_note','review_content','report_guidance','experiment_guidance'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const within = (root, file) => { const relative = path.relative(root,file); return relative !== '' && !relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative); };
const key = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
function distinct(rows, field) { assert.equal(new Set(rows.map(r=>r[field])).size,rows.length,'重复 '+field); }
function validate(payload) {
  assert.equal(payload.format,'pbl-course-package-v1'); assert.ok(key(payload.packageId)); assert.equal(payload.revision,1,'本工具只导入首版；后续改稿使用现有教材维护');
  assert.ok(payload.course && typeof payload.course.title==='string' && payload.course.title.trim());
  assert.ok(['campus','voyage'].includes(payload.course.presentation_theme)); assert.ok(['chapters','plan'].includes(payload.course.map_mode));
  assert.ok(['primary','junior','senior'].includes(payload.course.grade_level)); assert.ok(['basic','advanced','challenge'].includes(payload.course.difficulty));
  assert.ok(payload.course.cover_image === null || (typeof payload.course.cover_image==='string' && /^\/assets\/[\w./-]+$/.test(payload.course.cover_image) && new URL(payload.course.cover_image,'https://local.invalid').pathname===payload.course.cover_image && !payload.course.cover_image.split('/').includes('..')),'封面只能引用已交付公共素材');
  for (const field of ['lessons','resources','plan','experiments','badges']) assert.ok(Array.isArray(payload[field]) && payload[field].length<=100,field+' 无效');
  assert.ok(payload.lessons.length>0); distinct(payload.lessons,'key');distinct(payload.resources,'key');distinct(payload.resources,'file');distinct(payload.plan,'position');distinct(payload.badges,'lessonKey');
  const lessons = new Set(payload.lessons.map(l=>l.key)), resources = new Map(payload.resources.map(r=>[r.key,r]));
  for (const l of payload.lessons) {
    assert.ok(key(l.key) && typeof l.title==='string' && l.title.trim()); assert.ok(['learning','visit','theory','experiment'].includes(l.presentation_type));assert.ok(['ready','preparing'].includes(l.content_state));
    assert.ok(Array.isArray(l.article_blocks) && l.article_blocks.length<=200);
    for (const b of l.article_blocks) {
      assert.ok(b && typeof b.id==='string' && ['paragraph','image'].includes(b.type),'文章仅允许已支持的段落/图片');
      if (b.type==='paragraph') assert.ok(typeof b.text==='string' && b.text.length<=10000);
      else assert.ok(resources.has(b.resourceKey) && (!resources.get(b.resourceKey).lessonKey || resources.get(b.resourceKey).lessonKey===l.key),'文章图片不能串课时');
    }
  }
  for (const r of payload.resources) {
    assert.ok(key(r.key) && (!r.lessonKey || lessons.has(r.lessonKey))); assert.ok(/^[a-z0-9-]+\.(jpg|png|webp)$/.test(r.file),'不允许附件路径穿越或未支持类型');
    assert.ok(/^[a-f0-9]{64}$/.test(r.sha256) && Number.isSafeInteger(r.bytes) && r.bytes>0 && r.bytes<=20*1024*1024);
  }
  const linked = payload.plan.filter(n=>n.lessonKey);distinct(linked,'lessonKey');
  for (const n of payload.plan) { assert.ok(Number.isInteger(n.position)&&n.position>=1&&n.position<=100);assert.ok(n.lessonKey ? lessons.has(n.lessonKey)&&n.state==='linked' : n.state==='preparing'); }
  for (const e of payload.experiments) { assert.equal(e.experiment_id,'glider');assert.ok(!e.lessonKey||lessons.has(e.lessonKey));assert.ok(e.stage==null||(Number.isInteger(e.stage)&&e.stage>=0&&e.stage<=3));assert.ok([0,1].includes(e.enabled)); }
  for (const b of payload.badges) { assert.ok(lessons.has(b.lessonKey));assert.ok(['vr','theory','glider'].includes(b.art_id));assert.ok(typeof b.name==='string' && b.name.trim()); }
  return payload;
}
function readAssets(payload, root) {
  assert.ok(root,'首次导入必须提供单独交接的私有附件目录');const realRoot=fs.realpathSync(root);
  return payload.resources.map(r=>{
    const file=fs.realpathSync(path.resolve(realRoot,r.file));assert.ok(within(realRoot,file),'附件真实路径必须留在附件包目录');assert.ok(fs.statSync(file).isFile());
    const bytes=fs.readFileSync(file);assert.equal(bytes.length,r.bytes,'附件大小不符 '+r.file);assert.equal(sha(bytes),r.sha256,'附件SHA256不符 '+r.file);
    const ext=path.extname(r.file);assert.ok(ext==='.jpg' ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 : ext==='.png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','附件签名不符 '+r.file);
    return {resource:r,bytes};
  });
}
function admin(db, options) {
  const row=options.adminId ? db.prepare('SELECT * FROM users WHERE id=?').get(Number(options.adminId)) : db.prepare('SELECT * FROM users WHERE username=?').get(options.adminUsername||'');
  assert.ok(row && row.role==='admin' && row.is_active && !row.force_reset_password && !row.archived_at,'必须显式指定有效、已改密的管理员；不导入账号或密码');return row;
}
function previous(db, scope, fingerprint) {
  const rows=db.prepare("SELECT * FROM request_results WHERE scope=? AND request_key='initial'").all(scope);assert.ok(rows.length<=1,'存在重复导入身份，请人工核对');
  if (!rows.length) return null; assert.equal(rows[0].fingerprint,fingerprint,'该课程包已导入但内容不同；拒绝覆盖人工教材或另建重复课程');
  const receipt=JSON.parse(rows[0].result_json);assert.ok(db.prepare('SELECT 1 FROM courses WHERE id=?').get(receipt.courseId),'原导入课程已删除，不自动重建');return {...receipt,alreadyImported:true,writes:0};
}
function assertNew(db,payload) { assert.equal(db.prepare('SELECT COUNT(*) n FROM courses WHERE title=?').get(payload.course.title).n,0,'存在同名课程，请人工核对；不按名称猜绑定、不覆盖已有课程'); }
function insert(db, table, data) { const fields=Object.keys(data);return Number(db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...fields.map(k=>data[k]??null)).lastInsertRowid); }
const fields = (row,names) => Object.fromEntries(names.map(n=>[n,row[n]??null]));
async function importCourse(options) {
  const payload=validate(options.payload || JSON.parse(fs.readFileSync(options.packagePath||path.join(__dirname,'course.json'),'utf8'))),fingerprint=sha(JSON.stringify(canonical(payload))),scope='course-package:'+payload.packageId;
  const Database=require('../../backend/node_modules/better-sqlite3');
  const db=new Database(path.resolve(options.dbPath),{readonly:!options.apply,fileMustExist:true});const created=[];
  try {
    db.pragma('foreign_keys=ON');db.pragma('busy_timeout=15000');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
    for (const name of ['request_results','course_plan_nodes','course_experiments','lesson_badge_definitions']) assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),'请先通过现有部署流程升级数据库：缺少 '+name);
    assert.ok(db.prepare('PRAGMA table_info(lessons)').all().some(c=>c.name==='article_blocks'),'数据库尚未具备教材字段');
    const actor=admin(db,options),existing=previous(db,scope,fingerprint);if(existing)return existing;assertNew(db,payload);
    const assets=readAssets(payload,options.assetsDir),plan={packageId:payload.packageId,courseTitle:payload.course.title,courseStatus:'draft',lessons:payload.lessons.length,slots:payload.plan.length,files:assets.length,studentRecords:0,enrollments:0};
    if(!options.apply)return {...plan,dryRun:true,writes:0};assert.ok(options.uploadDir,'实际导入必须明确提供与服务器配置一致的uploads目录');
    const backupDir=path.resolve(options.backupDir||path.join(path.dirname(path.resolve(options.dbPath)),'backups'));fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
    const backup=path.join(backupDir,'pre-course-package-'+Date.now()+'-'+crypto.randomUUID()+'.db');await db.backup(backup);fs.chmodSync(backup,0o600);
    const check=new Database(backup,{readonly:true,fileMustExist:true});try{assert.equal(check.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(check.pragma('foreign_key_check'),[]);}finally{check.close();}
    return db.transaction(()=>{
      const again=previous(db,scope,fingerprint);if(again)return again;
      admin(db,{adminId:actor.id});assertNew(db,payload);
      const courseId=insert(db,'courses',{...fields(payload.course,courseFields),status:'draft',created_by:actor.id}),lessonIds={},resourceIds={},filePaths=[];
      for(const l of payload.lessons)lessonIds[l.key]=insert(db,'lessons',{...fields(l,lessonFields),course_id:courseId,status:'scheduled',article_blocks:'[]'});
      // Each attempt owns its directory: cleanup after a failed transaction cannot
      // unlink a file reused by a different process that has since committed.
      const resourceRoot=path.resolve(options.uploadDir,'resources','course-packages',fingerprint.slice(0,24)+'-'+crypto.randomUUID());fs.mkdirSync(resourceRoot,{recursive:true});
      for(const {resource:r,bytes}of assets){
        const dest=path.join(resourceRoot,r.file);
        if(fs.existsSync(dest)){assert.ok(within(fs.realpathSync(resourceRoot),fs.realpathSync(dest)),'目标文件符号链接越界');assert.equal(sha(fs.readFileSync(dest)),r.sha256,'拒绝覆盖已存在但内容不同的文件');}
        else {fs.writeFileSync(dest,bytes,{flag:'wx'});created.push(dest);}
        filePaths.push(dest);resourceIds[r.key]=insert(db,'resources',{...fields(r,['title','description','resource_type','file_name','file_type','display_order']),course_id:courseId,lesson_id:r.lessonKey?lessonIds[r.lessonKey]:null,file_path:dest,file_size:r.bytes,upload_by:actor.id,upload_digest:r.sha256});
      }
      for(const l of payload.lessons){const blocks=l.article_blocks.map(b=>{if(b.type!=='image')return b;const{resourceKey,...rest}=b;return {...rest,resourceId:resourceIds[resourceKey]};});db.prepare('UPDATE lessons SET article_blocks=? WHERE id=?').run(JSON.stringify(blocks),lessonIds[l.key]);}
      for(const n of payload.plan)insert(db,'course_plan_nodes',{course_id:courseId,position:n.position,lesson_id:n.lessonKey?lessonIds[n.lessonKey]:null,state:n.state});
      for(const e of payload.experiments)insert(db,'course_experiments',{...fields(e,['experiment_id','stage','label','enabled']),course_id:courseId,lesson_id:e.lessonKey?lessonIds[e.lessonKey]:null,card_id:null});
      for(const b of payload.badges)insert(db,'lesson_badge_definitions',{...fields(b,['name','art_id','description']),lesson_id:lessonIds[b.lessonKey]});
      const result={...plan,courseId,lessonIds,resourceIds,files:filePaths,backup,alreadyImported:false};requests.save(db,{actor:actor.id,scope,key:'initial',fingerprint},result);assert.deepEqual(db.pragma('foreign_key_check'),[]);return result;
    }).immediate();
  }catch(error){for(const file of created)try{fs.unlinkSync(file);}catch{/* Preserve the original error; cleanup paths were created exclusively by this run. */}throw error;}finally{db.close();}
}
function cli(args=process.argv.slice(2),env=process.env){const value=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};return importCourse({dbPath:value('--db')||resolveDbPath(env),packagePath:value('--package'),assetsDir:value('--assets'),uploadDir:value('--uploads')||env.UPLOAD_PATH,backupDir:value('--backup-dir'),adminId:value('--admin-id'),adminUsername:value('--admin-username'),apply:args.includes('--apply')});}
if(require.main===module)cli().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error('课程包导入拒绝：'+e.message);process.exitCode=1;});
module.exports={validate,readAssets,importCourse,cli};
