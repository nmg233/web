const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { before, after, test } = require('node:test');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-delivery-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.UPLOAD_PATH = path.join(dir, 'uploads');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'delivery-regression-only';
process.env.AI_CONFIG_SECRET = 'b'.repeat(64);
process.env.LOGIN_RATE_LIMIT_IP = '1000';
const app = require('../app');
const db = require('../config/database');
const answers = require('../services/aiAnswerService');
const settings = require('../services/aiSettingsService');
const usage = require('../services/aiUsageService');
let server, base;
const sessions = {};

async function api(url, { method = 'GET', body, user = 'admin' } = {}) {
  const response = await fetch(`${base}/api${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${sessions[user].token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

async function withProvider(reply, run) {
  const original = global.fetch;
  global.fetch = (url, options) => String(url).startsWith('https://api.deepseek.com/') ? reply(options) : original(url, options);
  try { return await run(); } finally { global.fetch = original; }
}

function providerPayload(scope = 'core', answer = '公开课程知识') {
  return { id: 'delivery-provider-id', choices: [{ finish_reason: 'stop', message: {
    content: JSON.stringify({ scope, answer, source_ids: ['S1', 'S999'] }),
  } }], usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 } };
}

before(async () => {
  db.prepare("INSERT INTO schools (id,name) VALUES (1,'测试学校'),(2,'其他学校')").run();
  db.prepare("INSERT INTO classes (id,name,school_id) VALUES (1,'测试班级',1),(2,'其他班级',2)").run();
  const users = [[1,'admin','admin'],[2,'mentor','academic_mentor'],[3,'student','student'],[4,'teacher','teacher'],
    [5,'media','media'],[6,'othermentor','academic_mentor'],[7,'outsider','student'],[8,'empty','student'],[9,'rollback','student']];
  for (let id = 100; id < 120; id++) users.push([id, `scenario${id}`, 'student']);
  for (const [id, name, role] of users) db.prepare('INSERT INTO users (id,username,real_name,password_hash,role,school_id,class_id) VALUES (?,?,?,?,?,1,1)')
    .run(id, name, name, bcrypt.hashSync('Delivery!1234', 4), role);
  db.prepare('UPDATE users SET teacher_id = 4 WHERE id = 3').run();
  db.prepare("INSERT INTO courses (id,title,description,grade_level,difficulty,status,created_by) VALUES (1,'测试课程','公开课程知识','primary','basic','published',2),(2,'他人课程','绝不能跨课泄露','primary','basic','published',6)").run();
  db.prepare("INSERT INTO enrollments (id,student_id,course_id,status) VALUES (1,3,1,'active')").run();
  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,start_at) VALUES (1,1,'要取消的课时','scheduled',1,datetime('now','+1 day')),(2,1,'保留的课时','completed',2,NULL)").run();
  db.prepare("INSERT INTO tasks (id,lesson_id,title,description,status) VALUES (1,1,'取消课时的任务','作业隐去','active'),(2,2,'保留任务','公开课程知识','active'),(3,2,'单独取消任务','应隐去','active')").run();
  db.prepare("INSERT INTO knowledge_cards (id,lesson_id,title,content,status,created_by) VALUES (1,1,'取消课时的卡片','不应作为当前教学材料','published',2),(2,2,'保留卡片','公开课程知识','published',2)").run();
  db.prepare('INSERT INTO lesson_progress (student_id,lesson_id,progress) VALUES (3,2,100)').run();
  db.prepare("INSERT INTO works (id,student_id,enrollment_id,task_id,title,description,review_status) VALUES (1,3,1,1,'历史作品','必须保留','rejected')").run();
  settings.saveSettings({ enabled: true, api_key: 'delivery-test-key' });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [, name] of users.slice(0,9)) sessions[name] = (await api('/auth/login', {
    method: 'POST', user: null, body: { username: name, password: 'Delivery!1234' },
  })).body;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('取消课时同时停止待办、任务、提交和 AI 上下文，保留历史并对齐进度', async () => {
  assert.equal((await api('/courses/lessons/1/cancel', { method:'POST', user:'mentor', body:{reason:'取消演练'} })).status,409,'独立成果待修改时必须阻断取消');
  db.prepare("UPDATE works SET review_status='approved' WHERE id=1").run();
  const original = db.prepare('SELECT * FROM works WHERE id=1').get();
  assert.equal((await api('/courses/lessons/1/cancel', { method:'POST', user:'mentor', body:{reason:'取消演练'} })).status,200);
  const dashboard = await api('/dashboard', {user:'student'});
  assert.equal(dashboard.body.nextLesson,null);
  assert.equal(dashboard.body.pendingTasks.some(t=>t.id===1),false);
  assert.equal(dashboard.body.revisions.some(w=>w.id===1),false);
  assert.equal(dashboard.body.myCourses[0].total_lessons,1);
  assert.equal((await api('/tasks',{user:'student'})).body.tasks.some(t=>t.id===1),false);
  assert.equal((await api('/works/pending-tasks',{user:'student'})).body.tasks.some(t=>t.id===1),false);
  assert.equal((await api('/tasks/1',{user:'student'})).status,404);
  assert.equal((await api('/works',{method:'POST',user:'student',body:{title:'违规续交',description:'测试',task_id:1,parent_work_id:1}})).status,409);
  assert.equal((await api('/learning/lessons/1',{user:'student'})).status,404);
  assert.equal((await api('/courses/lessons/1/tasks',{method:'POST',user:'mentor',body:{title:'新任务'}})).status,409);
  const course = await api('/courses/1',{user:'student'});
  assert.equal(course.body.progress,0,'孤立的旧进度数值不能替代回顾、答题及评审证据');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM enrollment_completions WHERE enrollment_id=1').get().n,0);
  assert.equal(course.body.tasks.some(t=>t.id===1),false);
  const sources = answers.structuredSources(db.prepare('SELECT * FROM courses WHERE id=1').get(),'课程任务卡片');
  assert.equal(sources.some(s=>s.type==='task'&&s.id===1),false);
  assert.equal(sources.some(s=>s.type==='card'&&s.id===1),false);
  assert.deepEqual(db.prepare('SELECT * FROM works WHERE id=1').get(),original);
  assert.equal((await api('/works/1',{user:'student'})).status,200);
});

test('单独取消任务、撤回课程或移除报名后不能继续提交或出现在待办中', async () => {
  assert.equal((await api('/tasks/3/cancel',{method:'POST',user:'mentor'})).status,200);
  assert.equal((await api('/dashboard',{user:'student'})).body.pendingTasks.some(t=>t.id===3),false);
  assert.equal((await api('/works/pending-tasks',{user:'student'})).body.tasks.some(t=>t.id===3),false);
  assert.equal((await api('/works',{method:'POST',user:'student',body:{title:'取消任务',description:'测试',task_id:3}})).status,409);
  for (const status of ['draft','archived']) {
    db.prepare('UPDATE courses SET status=? WHERE id=1').run(status);
    assert.equal((await api('/tasks/2',{user:'student'})).status,404);
    assert.equal((await api('/dashboard',{user:'student'})).body.pendingTasks.length,0);
    assert.equal((await api('/works',{method:'POST',user:'student',body:{title:'失效课程',description:'测试',task_id:2}})).status,403);
  }
  db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
  db.prepare("UPDATE enrollments SET status='removed' WHERE id=1").run();
  assert.equal((await api('/tasks/2',{user:'student'})).status,404);
  assert.equal((await api('/dashboard',{user:'student'})).body.pendingTasks.length,0);
  db.prepare("UPDATE enrollments SET status='active' WHERE id=1").run();
});

test('已有学习历史账号拒绝变更角色；空账号变更后旧 token 不会在改回身份时复活', async () => {
  const records = db.prepare('SELECT * FROM works').all();
  const response = await api('/students/users/3',{method:'PUT',body:{real_name:'student',role:'teacher',school_id:1,class_id:1}});
  assert.equal(response.status,409);
  assert.ok(response.body.blockers.some(b=>b.label==='学生作品'));
  assert.deepEqual(db.prepare('SELECT * FROM works').all(),records);
  for (const role of ['teacher','student']) assert.equal((await api('/students/users/8',{method:'PUT',body:{real_name:'empty',role,school_id:1,class_id:1}})).status,200);
  assert.equal((await api('/auth/me',{user:'empty'})).status,401);
  assert.equal((await api('/auth/refresh',{method:'POST',user:null,body:{refresh_token:sessions.empty.refresh_token}})).status,401);
});

test('角色变更与会话撤销原子执行，失败时不留下半改的账号', async () => {
  const original = db.prepare('SELECT * FROM users WHERE id=9').get();
  db.exec("CREATE TRIGGER fail_role_revoke BEFORE DELETE ON refresh_tokens WHEN OLD.user_id=9 BEGIN SELECT RAISE(ABORT,'test revoke failure'); END");
  try {
    assert.equal((await api('/students/users/9',{method:'PUT',body:{real_name:'rollback',role:'teacher',school_id:1,class_id:1}})).status,500);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=9').get(),original);
    assert.equal((await api('/auth/me',{user:'rollback'})).status,200);
  } finally { db.exec('DROP TRIGGER fail_role_revoke'); }
});

test('学校及班级目录拒绝匿名访问，教师目录限制生效，课程管理角色仍可读取', async () => {
  for (const url of ['/auth/schools','/auth/classes?school_id=1','/students/classes/1']) assert.equal((await api(url,{user:null})).status,401);
  for (const user of ['admin','mentor']) for (const url of ['/auth/schools','/auth/classes?school_id=1','/students/classes/1']) assert.equal((await api(url,{user})).status,200);
  assert.equal((await api('/students/classes/1',{user:'teacher'})).status,200);
  assert.equal((await api('/students/classes/2',{user:'teacher'})).status,403);
  assert.equal((await api('/auth/register',{method:'POST',user:null,body:{}})).status,403);
});

test('五角色、跨课程、输入校验在调用供应商前完成', async () => {
  let calls=0;
  await withProvider(()=>{calls++; throw new Error('must not call');},async()=>{
    for (const user of ['teacher','media']) assert.equal((await api('/dashboard/ai/ask',{method:'POST',user,body:{course_id:1,question:'任务'}})).status,403);
    for (const user of ['outsider','othermentor']) assert.equal((await api('/dashboard/ai/ask',{method:'POST',user,body:{course_id:1,question:'任务'}})).status,403);
    for (const body of [{course_id:1,question:''},{course_id:1,question:'x'.repeat(1001)},{course_id:'1.5',question:'任务'},{course_id:1,question:{}}])
      assert.equal((await api('/dashboard/ai/ask',{method:'POST',user:'student',body})).status,400);
    db.prepare("UPDATE enrollments SET status='removed' WHERE id=1").run();
    assert.equal((await api('/dashboard/ai/ask',{method:'POST',user:'student',body:{course_id:1,question:'任务'}})).status,403);
    db.prepare("UPDATE enrollments SET status='active' WHERE id=1").run();
  });
  assert.equal(calls,0);
});

test('成功调用记录真实服务来源、token 用量，且不记录密钥、问题及回答', async () => {
  let captured;
  const result = await withProvider(options=>{captured=options;return Promise.resolve({ok:true,json:async()=>providerPayload()});},
    ()=>answers.ask({id:100},db.prepare('SELECT * FROM courses WHERE id=1').get(),'不要持久化这条提问'));
  assert.equal(result.origin,'provider');
  assert.equal(result.sources.some(s=>s.ref==='S999'),false);
  assert.equal(captured.redirect,'error');
  assert.deepEqual(JSON.parse(captured.body).thinking,{type:'disabled'});
  const row=db.prepare('SELECT * FROM ai_usage WHERE id=?').get(result.request_id);
  assert.equal(row.status,'succeeded');
  assert.equal(row.total_tokens,168);
  assert.doesNotMatch(JSON.stringify(row),/delivery-test-key|不要持久化这条提问|公开课程知识/);
  assert.doesNotMatch(JSON.stringify(result),/delivery-test-key/);
});

test('鉴权、额度、繁忙、异常响应、断网与截断均返回失败并记录，不能伪装成功', async () => {
  const cases = [
    [()=>({ok:false,status:401}),503,'AI_PROVIDER_AUTH'],[()=>({ok:false,status:402}),503,'AI_PROVIDER_QUOTA'],
    [()=>({ok:false,status:429}),503,'AI_PROVIDER_BUSY'],[()=>({ok:false,status:500}),502,'AI_PROVIDER_ERROR'],
    [()=>({ok:true,json:async()=>{throw new SyntaxError('bad json');}}),502,'AI_INVALID_RESPONSE'],
    [()=>({ok:true,json:async()=>({choices:[{message:{content:'null'}}]})}),502,'AI_INVALID_RESPONSE'],
    [()=>{throw new TypeError('network with secret details');},502,'AI_NETWORK'],
    [()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})}),502,'AI_OUTPUT_LIMIT'],
  ];
  for (const [index,[reply,status,code]] of cases.entries()) await withProvider(reply,async()=>{
    await assert.rejects(()=>answers.ask({id:101+index},db.prepare('SELECT * FROM courses WHERE id=1').get(),'课程任务'),err=>{
      assert.equal(err.status,status);assert.equal(err.code,code);
      const row=db.prepare('SELECT * FROM ai_usage WHERE id=?').get(err.requestId);
      assert.equal(row.status,'failed');assert.equal(row.error_code,code);
      assert.doesNotMatch(err.message,/secret details/);return true;
    });
  });
});

test('超时涵盖连接与响应体读取，并能检查密钥无法解密', async () => {
  process.env.AI_TIMEOUT_MS='20';
  try {
    await withProvider(options=>new Promise((resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    }),async()=>assert.rejects(()=>answers.ask({id:110},db.prepare('SELECT * FROM courses WHERE id=1').get(),'任务'),{status:504,code:'AI_TIMEOUT'}));
    await withProvider(options=>({ok:true,json:()=>new Promise((resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    })}),async()=>assert.rejects(()=>answers.ask({id:111},db.prepare('SELECT * FROM courses WHERE id=1').get(),'任务'),{status:504,code:'AI_TIMEOUT'}));
  } finally { delete process.env.AI_TIMEOUT_MS; }
  process.env.AI_CONFIG_SECRET='c'.repeat(64);
  try { assert.throws(()=>settings.decryptKey(settings.readSettings().api_key_encrypted),{status:503,code:'AI_KEY_DECRYPT'}); }
  finally { process.env.AI_CONFIG_SECRET='b'.repeat(64); }
});

test('权限在供应商响应期间被撤销时不向客户端交付回答',async()=>{
  await withProvider(()=>{db.prepare("UPDATE enrollments SET status='removed' WHERE id=1").run();return {ok:true,json:async()=>providerPayload()};},async()=>{
    const result=await api('/dashboard/ai/ask',{method:'POST',user:'student',body:{course_id:1,question:'公开知识'}});
    assert.equal(result.status,403);assert.equal(result.body.code,'AI_ACCESS_CHANGED');assert.equal(result.body.answer,undefined);
  });
  db.prepare("UPDATE enrollments SET status='active' WHERE id=1").run();
});

test('每日额度在数据库中原子预留，失败调用也计入，非法配置不会放行',()=>{
  db.prepare('DELETE FROM ai_usage').run();
  process.env.AI_DAILY_USER_REQUESTS='1';process.env.AI_DAILY_TOTAL_REQUESTS='2';
  try {
    const first=usage.reserve(112,1,'deepseek-flash');
    usage.finish(first,{status:'failed',code:'AI_TIMEOUT',duration:20});
    assert.throws(()=>usage.reserve(112,1,'deepseek-flash'),{code:'AI_DAILY_QUOTA'});
    usage.reserve(113,1,'deepseek-flash');
    assert.throws(()=>usage.reserve(114,1,'deepseek-flash'),{code:'AI_DAILY_QUOTA'});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_usage').get().n,2);
    process.env.AI_DAILY_TOTAL_REQUESTS='0';
    assert.throws(()=>usage.reserve(114,1,'deepseek-flash'),{code:'AI_LIMIT_CONFIG'});
  } finally {delete process.env.AI_DAILY_USER_REQUESTS;delete process.env.AI_DAILY_TOTAL_REQUESTS;}
});

test('旧库 AI 用量迁移可重复运行且不改变已有账号和学习数据',()=>{
  const Database=require('better-sqlite3');
  const copy=new Database(':memory:');
  try {
    copy.exec(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
    copy.exec('DROP TABLE ai_usage');
    const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/013_ai_usage.sql'),'utf8');
    copy.prepare("INSERT INTO users (id,username,real_name,password_hash,role) VALUES (1,'old','保留账号','unchanged','student')").run();
    const original=copy.prepare('SELECT * FROM users').get();
    copy.exec(migration);copy.exec(migration);
    assert.deepEqual(copy.prepare('SELECT * FROM users').get(),original);
    assert.deepEqual(copy.prepare('PRAGMA table_info(ai_usage)').all().map(c=>c.name),db.prepare('PRAGMA table_info(ai_usage)').all().map(c=>c.name));
  } finally {copy.close();}
});

test('两字中文术语能检索当前课程，停用、跨课程和归属不一致资料不进入上下文',()=>{
  for (const id of [20,21]) {
    db.prepare("INSERT INTO resources (id,course_id,resource_type,title,upload_by) VALUES (?,?,'courseware','升力讲义',2)").run(id,id===20?1:2);
    db.prepare("INSERT INTO ai_documents (id,resource_id,course_id,status) VALUES (?,?,?,'ready')").run(id,id,id===20?1:2);
    db.prepare("INSERT INTO ai_chunks (document_id,course_id,chunk_index,locator,text) VALUES (?,?,0,'文本',?)")
      .run(id,id===20?1:2,id===20?'升力与机翼迎角有关。':'升力的跨课程私人资料。');
  }
  try {
    assert.deepEqual(answers.relevantFiles(1,'升力').map(item=>item.id),[20]);
    db.prepare('UPDATE ai_documents SET enabled=0 WHERE id=20').run();
    assert.deepEqual(answers.relevantFiles(1,'升力'),[]);
    db.prepare('UPDATE ai_documents SET enabled=1,course_id=2 WHERE id=20').run();
    assert.deepEqual(answers.relevantFiles(1,'升力'),[]);
    db.prepare('UPDATE ai_documents SET course_id=1 WHERE id=20').run();
    db.prepare('UPDATE resources SET course_id=2 WHERE id=20').run();
    assert.deepEqual(answers.relevantFiles(1,'升力'),[]);
  } finally {db.prepare('DELETE FROM resources WHERE id IN (20,21)').run();}
});

test('上下文预算耗尽后未送给模型的资料不会获得可引用编号',()=>{
  const sources = [
    {type:'resource',id:30,title:'长讲义',locator:'文本',text:'x'.repeat(12000)},
    {type:'resource',id:31,title:'未提供的秘密资料',locator:'文本',text:'不应作为答案来源'},
  ];
  const result=answers.buildContext(sources);
  assert.equal(result.context.length,11500);
  assert.deepEqual(result.numbered.map(item=>item.id),[30]);
  assert.doesNotMatch(result.context,/未提供的秘密资料|\[S2\]/);
});

test('同一文档多个检索片段可正常回答，等待期间停用资料会拒绝交付并记失败',async()=>{
  db.prepare("INSERT INTO resources (id,course_id,resource_type,title,upload_by) VALUES (30,1,'courseware','升力原理',2)").run();
  db.prepare("INSERT INTO ai_documents (id,resource_id,course_id,status) VALUES (30,30,1,'ready')").run();
  for (const [index,text] of ['升力来自机翼周围的气流。','迎角变化也会影响升力。'].entries())
    db.prepare("INSERT INTO ai_chunks (document_id,course_id,chunk_index,locator,text) VALUES (30,1,?,'文本',?)").run(index,text);
  try {
    const course=db.prepare('SELECT * FROM courses WHERE id=1').get();
    assert.equal(answers.relevantFiles(1,'升力').length,2);
    const success=await withProvider(()=>({ok:true,json:async()=>providerPayload()}),()=>answers.ask({id:115},course,'升力'));
    assert.equal(success.origin,'provider');
    await withProvider(()=>{
      db.prepare('UPDATE ai_documents SET enabled=0 WHERE id=30').run();
      return {ok:true,json:async()=>providerPayload()};
    },async()=>assert.rejects(()=>answers.ask({id:116},course,'升力'),err=>{
      assert.equal(err.status,409);assert.equal(err.code,'AI_CONTEXT_CHANGED');
      const row=db.prepare('SELECT * FROM ai_usage WHERE id=?').get(err.requestId);
      assert.equal(row.status,'failed');assert.equal(row.total_tokens,168);return true;
    }));
  } finally {db.prepare('DELETE FROM resources WHERE id=30').run();}
});

test('供应商返回前取消任务或停用 AI 时不返回旧上下文答案',async()=>{
  const course=db.prepare('SELECT * FROM courses WHERE id=1').get();
  try {
    await withProvider(()=>{
      db.prepare("UPDATE tasks SET status='cancelled' WHERE id=2").run();
      return {ok:true,json:async()=>providerPayload()};
    },()=>assert.rejects(()=>answers.ask({id:117},course,'课程任务'),{status:409,code:'AI_CONTEXT_CHANGED'}));
  } finally {db.prepare("UPDATE tasks SET status='active' WHERE id=2").run();}
  try {
    await withProvider(()=>{
      settings.saveSettings({enabled:false});
      return {ok:true,json:async()=>providerPayload()};
    },()=>assert.rejects(()=>answers.ask({id:118},course,'课程任务'),{status:503,code:'AI_DISABLED'}));
  } finally {settings.saveSettings({enabled:true});}
});
