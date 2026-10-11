const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-avatar-'));
process.env.DB_PATH = path.join(dir, 'avatar.db'); process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex'); process.env.NODE_ENV = 'test';
const app = require('../app'), db = require('../config/database');
let server, url; const tokens = {};
async function request(role, id, method='GET', body) {
  const r = await fetch(url+'/api/course-spaces/'+id+'/preferences/avatar', {method, headers:{Authorization:'Bearer '+tokens[role], 'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status, body:await r.json()};
}
before(async()=>{
  const hash = require('bcryptjs').hashSync('test123', 4);
  for (const [id, role] of [[1,'academic_mentor'],[2,'student'],[3,'student'],[4,'teacher'],[5,'academic_mentor']]) db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'u'+id,hash,'合成账号'+id,role);
  for (const id of [1,2]) {
    db.prepare("INSERT INTO courses(id,title,grade_level,difficulty,status,created_by,presentation_theme) VALUES(?,?,'junior','basic','published',1,'voyage')").run(id,'测试课'+id);
    for(const student of [2,3]) db.prepare("INSERT INTO enrollments(student_id,course_id,status) VALUES(?,?,'active')").run(student,id);
  }
  await new Promise(r=>server=app.listen(0,r)); url='http://127.0.0.1:'+server.address().port;
  for (const id of [1,2,3,4,5]) tokens[id]=(await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'u'+id,password:'test123'})}).then(r=>r.json())).token;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();});
test('头像真实保存，两个账号与两门课隔离，无默认角色',async()=>{
  assert.equal((await request(2,1)).body.avatarId,null);
  assert.equal((await request(2,1,'PUT',{avatarId:'navigator'})).status,200);
  assert.equal((await request(2,2,'PUT',{avatarId:'maker'})).status,200);
  assert.equal((await request(3,1,'PUT',{avatarId:'guardian'})).status,200);
  assert.equal((await request(2,1)).body.avatarId,'navigator');
  assert.equal((await request(2,2)).body.avatarId,'maker');
  assert.equal((await request(3,1)).body.avatarId,'guardian');
  const login=await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'u2',password:'test123'})}).then(r=>r.json());tokens[2]=login.token;
  assert.equal((await request(2,1)).body.avatarId,'navigator');
});
test('未知枚举、图片地址、指定他人账号均拒绝；维护角色不能读写学生偏好',async()=>{
  for (const body of [{avatarId:'other'},{avatarId:'/uploads/a.png'},{avatarId:'maker',student_id:3},{avatarId:'maker',userId:3},{}]) assert.equal((await request(2,1,'PUT',body)).status,400);
  for (const role of [1,4,5]) for (const method of ['GET','PUT']) assert.equal((await request(role,1,method,method==='PUT'?{avatarId:'decoder'}:undefined)).status,403);
  assert.equal((await request(2,999)).status,404);
});
test('报名移除、课程撤回、账号停用及强制改密不能读取或更改',async()=>{
  db.prepare("UPDATE enrollments SET status='removed' WHERE student_id=2 AND course_id=1").run();
  for (const method of ['GET','PUT']) assert.equal((await request(2,1,method,method==='PUT'?{avatarId:'decoder'}:undefined)).status,404);
  db.prepare("UPDATE enrollments SET status='active' WHERE student_id=2 AND course_id=1").run();
  db.prepare("UPDATE courses SET status='draft' WHERE id=1").run();assert.equal((await request(2,1)).status,404);
  db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
  db.prepare('UPDATE users SET force_reset_password=1 WHERE id=2').run();assert.equal((await request(2,1)).body.code,'FORCE_RESET');
  db.prepare('UPDATE users SET force_reset_password=0,is_active=0 WHERE id=2').run();assert.equal((await request(2,1)).status,401);
});
test('既有库兼容升级两次，不改报名、报告、作品，也不分配角色',()=>{
  const Database=require('better-sqlite3'); const legacy=new Database(':memory:');
  const schema=fs.readFileSync(path.join(__dirname,'../testFixtures/schema-v16.sql'),'utf8').split('-- 016:')[0];
  legacy.exec(schema);
  legacy.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  for(const file of fs.readdirSync(path.join(__dirname,'../database/migrations')).filter(f=>/^\d+_/.test(f)&&parseInt(f)<16)) legacy.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(parseInt(file),file);
  const oldSchema=legacy.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const migrate=require('../database/migrate').runMigrations;migrate(legacy);migrate(legacy);
  assert.equal(legacy.prepare('SELECT count(*) n FROM course_avatar_preferences').get().n,0);
  assert.equal(legacy.prepare('SELECT count(*) n FROM schema_migrations WHERE version=16').get().n,1);
  for(const row of oldSchema.filter(r=>!['users','courses','lessons','resources','reflections'].includes(r.name))) assert.equal(legacy.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(row.name).sql,row.sql);
  assert.equal(legacy.prepare('SELECT count(*) n FROM schema_migrations WHERE version=17').get().n,1);
  assert.ok(legacy.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='avatar_preset'));
  assert.equal(legacy.prepare('SELECT count(*) n FROM course_plan_nodes').get().n,0);
  legacy.close();
});
