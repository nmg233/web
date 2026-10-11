const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { before, after, test } = require('node:test');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-authorization-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.UPLOAD_PATH = path.join(dir, 'uploads');
process.env.FEEDBACK_UPLOAD_PATH = path.join(dir, 'feedback');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'authorization-matrix-tests';
process.env.LOGIN_RATE_LIMIT_IP = '1000';
const app = require('../app');
const db = require('../config/database');
const roles = ['admin', 'mentorA', 'mentorB', 'teacherA', 'teacherB', 'studentA', 'studentB', 'media'];
const tokens = {};
let server, base;

async function api(url, { user = 'admin', method = 'GET', body, token = tokens[user] } = {}) {
  const response = await fetch(`${base}/api${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
}

async function login(user, password = 'Matrix!1234') {
  const result = await api('/auth/login', { user: null, method: 'POST', body: { username: user, password } });
  assert.equal(result.status, 200);
  tokens[user] = result.body.token;
}

async function matrix(url, allowed) {
  for (const user of roles) {
    const result = await api(url, { user });
    if (allowed.includes(user)) assert.equal(result.status, 200, `${url}: ${user} should be allowed`);
    else {
      assert.ok([403, 404].includes(result.status), `${url}: ${user} got ${result.status}`);
      assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_A|PRIVATE_B|Matrix!1234|password_hash/);
    }
  }
  assert.equal((await api(url, { user: null })).status, 401, `${url}: anonymous`);
}

before(async () => {
  db.exec("INSERT INTO schools (id,name) VALUES (1,'同校'); INSERT INTO classes (id,name,school_id) VALUES (1,'同班',1)");
  const hash = bcrypt.hashSync('Matrix!1234', 4);
  const kinds = ['admin', 'academic_mentor', 'academic_mentor', 'teacher', 'teacher', 'student', 'student', 'media'];
  [...roles, 'emptyMentor', 'historicalReviewer'].forEach((name, index) => db.prepare(
    'INSERT INTO users (id,username,real_name,password_hash,role,school_id,class_id) VALUES (?,?,?,?,?,1,1)'
  ).run(index + 1, name, name, hash, kinds[index] || 'academic_mentor'));
  db.exec('UPDATE users SET teacher_id=4 WHERE id=6; UPDATE users SET teacher_id=5 WHERE id=7');
  db.exec("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (1,'课程A','primary','basic','published',2),(2,'课程B','primary','basic','published',3)");
  db.exec("INSERT INTO lessons (id,course_id,title,status,sort_order) VALUES (1,1,'课时A','completed',1),(2,2,'课时B','completed',1)");
  db.exec("INSERT INTO enrollments (id,student_id,course_id,status) VALUES (1,6,1,'active'),(2,7,2,'active'),(3,6,2,'active')");
  db.exec("INSERT INTO tasks (id,lesson_id,title,status) VALUES (1,1,'任务A','active'),(2,2,'任务B','active')");
  fs.mkdirSync(process.env.UPLOAD_PATH, { recursive: true });
  for (const [id, student, enrollment, task, label] of [[1,6,1,1,'A'],[2,7,2,2,'B'],[3,6,3,2,'B']]) {
    const file = path.join(process.env.UPLOAD_PATH, `work${id}.txt`);
    fs.writeFileSync(file, `PRIVATE_${label}`);
    db.prepare("INSERT INTO works (id,student_id,enrollment_id,task_id,title,description,file_path,file_name,review_status) VALUES (?,?,?,?,?,?,?,?,'pending')")
      .run(id, student, enrollment, task, `作品${label}`, `PRIVATE_${label}`, file, `work${id}.txt`);
    db.prepare("INSERT INTO lesson_learning_reports (id,student_id,lesson_id,enrollment_id,summary,status,submitted_at) VALUES (?,?,?,?,?,'submitted',CURRENT_TIMESTAMP)")
      .run(id, student, task, enrollment, `PRIVATE_${label}`);
  }
  for (const id of [1,2]) {
    const file = path.join(process.env.UPLOAD_PATH, `resource${id}.txt`);
    fs.writeFileSync(file, `PRIVATE_${id === 1 ? 'A' : 'B'}`);
    db.prepare("INSERT INTO resources (id,course_id,resource_type,title,file_path,upload_by) VALUES (?,?,'courseware',?,?,?)")
      .run(id, id, `资料${id}`, file, id + 1);
  }
  const video = path.join(process.env.UPLOAD_PATH, 'replay.mp4');
  fs.writeFileSync(video, 'test-replay-bytes');
  db.prepare("INSERT INTO course_replays (id,course_id,title,video_path,created_by) VALUES (1,1,'回放A',?,2),(2,2,'回放B',?,3)").run(video, video);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const user of roles) await login(user);
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('五角色学生直接访问：同校同班仍必须有明确分配或课程关系，响应脱敏', async () => {
  await matrix('/students/6', ['admin','mentorA','mentorB','teacherA','studentA']);
  await matrix('/students/7', ['admin','mentorB','teacherB','studentB']);
  const archive = await api('/students/6', { user: 'mentorA' });
  assert.doesNotMatch(JSON.stringify(archive.body), /PRIVATE_B|password_hash|auth_version/);
});

test('课程、资源附件、回放与知识库的五角色直接访问遵循课程归属', async () => {
  await matrix('/courses/1', ['admin','mentorA','studentA']);
  await matrix('/courses/resources/1/download', ['admin','mentorA','studentA']);
  await matrix('/courses/replays/1/stream', ['admin','mentorA','studentA']);
  await matrix('/courses/replays/1/stream-url', ['admin','mentorA','studentA']);
  await matrix('/dashboard/ai/courses/1/documents', ['admin','mentorA']);
});

test('作品详情和附件的权限一致，导师不能凭共同学生关系读取其他课程作品', async () => {
  await matrix('/works/1', ['admin','mentorA','teacherA','studentA']);
  await matrix('/works/1/download', ['admin','mentorA','teacherA','studentA']);
  assert.equal((await api('/works/3', { user:'mentorA' })).status, 403);
  assert.equal((await api('/works/3/download', { user:'mentorA' })).status, 403);
});

test('报告、学生学习包和教师观察入口按用途及对象关系限制访问', async () => {
  await matrix('/mentor-reviews/1', ['admin','mentorA']);
  await matrix('/learning/lessons/1', ['studentA']);
  await matrix('/observer/students/6', ['admin','teacherA']);
  assert.equal((await api('/mentor-reviews/3', { user:'mentorA' })).status, 403);
  assert.equal((await api('/observer/students/7', { user:'teacherA' })).status, 404);
});

test('教师只读、其他导师及非管理身份的直接写入被拒绝，原记录完全保留', async () => {
  const works = db.prepare('SELECT * FROM works').all();
  const reports = db.prepare('SELECT * FROM lesson_learning_reports').all();
  const course = db.prepare('SELECT * FROM courses WHERE id=1').get();
  for (const user of ['teacherA','teacherB','mentorB','studentA','studentB','media']) {
    for (const [url, body] of [
      ['/works/1/review', { status:'approved',problem_discovery:4,solution_design:4,hands_on:4,data_analysis:4,presentation:4 }],
      ['/mentor-reviews/1/review', { status:'approved',score:95,comment:'越权写入' }],
    ]) assert.equal((await api(url, { user,method:'POST',body })).status, 403, `${user}: ${url}`);
    const result = await api('/courses/1', { user,method:'PUT',body:{ title:'越权修改',grade_level:'primary',difficulty:'basic' } });
    assert.ok([403,404].includes(result.status));
  }
  assert.deepEqual(db.prepare('SELECT * FROM works').all(), works);
  assert.deepEqual(db.prepare('SELECT * FROM lesson_learning_reports').all(), reports);
  assert.deepEqual(db.prepare('SELECT * FROM courses WHERE id=1').get(), course);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_reviews').get().n, 0);
});

test('签名回放可供 video 访问，但篡改、过期、移除报名或无效 Bearer 不得放行', async () => {
  const url = (await api('/courses/replays/1/stream-url', { user:'studentA' })).body.url.slice(4);
  assert.equal((await api(url, { user:null })).body, 'test-replay-bytes');
  assert.equal((await api(url, { token:'invalid' })).status, 401);
  for (const [key, value] of [['uid','7'],['v','10'],['sig','f'.repeat(64)],['exp','1'],['v','-1']]) {
    const changed = new URL(`${base}/api${url}`);
    changed.searchParams.set(key, value);
    assert.equal((await api(changed.pathname.slice(4) + changed.search, { user:null })).status, 401);
  }
  assert.equal((await api(url.replace('/replays/1/', '/replays/2/'), { user:null })).status, 401);
  const expired = new URL(`${base}/api${url}`);
  const exp = Math.floor(Date.now()/1000)-1;
  const v = expired.searchParams.get('v');
  expired.searchParams.set('exp', String(exp));
  expired.searchParams.set('sig', crypto.createHmac('sha256', process.env.JWT_SECRET).update(`1:6:${v}:${exp}`).digest('hex'));
  assert.equal((await api(expired.pathname.slice(4)+expired.search, { user:null })).status, 401);
  db.prepare("UPDATE enrollments SET status='removed' WHERE id=1").run();
  assert.equal((await api(url, { user:null })).status, 404);
  db.prepare("UPDATE enrollments SET status='active' WHERE id=1").run();
  db.prepare("UPDATE courses SET status='archived' WHERE id=1").run();
  assert.equal((await api(url, { user:null })).status, 404);
  db.prepare("UPDATE courses SET status='published' WHERE id=1").run();
});

test('禁用/恢复、归档/恢复、重置及修改密码后旧签名播放链接不会复活', async () => {
  for (const action of ['disable','archive']) {
    const url = (await api('/courses/replays/1/stream-url', { user:'studentA' })).body.url.slice(4);
    assert.equal((await api('/students/6/status', { method:'POST',body:{ action,reason:'回放撤销测试' } })).status, 200);
    assert.equal((await api(url, { user:null })).status, 401);
    assert.equal((await api('/students/6/status', { method:'POST',body:{ action:'restore',reason:'测试恢复' } })).status, 200);
    assert.equal((await api(url, { user:null })).status, 401);
    await login('studentA');
  }
  const url = (await api('/courses/replays/1/stream-url', { user:'studentA' })).body.url.slice(4);
  const reset = await api('/auth/admin/reset-password', { method:'POST',body:{user_id:6} });
  assert.equal(reset.status, 200);
  assert.equal((await api(url, { user:null })).status, 401);
  assert.equal((await api('/courses/replays/1/stream', { user:'studentA' })).status, 401);
  await login('studentA', reset.body.temp_password);
  assert.equal((await api('/courses/replays/1/stream', { user:'studentA' })).status, 403);
  const changed = await api('/auth/change-password', { user:'studentA',method:'POST',body:{old_password:reset.body.temp_password,new_password:'MatrixNew!234'} });
  assert.equal(changed.status, 200);
  const { saveAuthSession } = await import('../../frontend/src/utils/authSession.js');
  const stored = new Map([['token',tokens.studentA],['user',JSON.stringify({force_reset_password:1})]]);
  const nextUser = saveAuthSession({setItem:(key,value)=>stored.set(key,value),getItem:key=>stored.get(key)??null,removeItem:key=>stored.delete(key)}, changed.body);
  assert.equal(nextUser.force_reset_password,0);
  assert.equal(JSON.parse(stored.get('user')).force_reset_password,0);
  assert.equal((await api('/auth/me', {token:stored.get('token')})).status,200);
  assert.equal((await api('/auth/refresh', {user:null,method:'POST',body:{refresh_token:stored.get('refresh_token')} })).status,200);
  assert.equal((await api(url, { user:null })).status, 401);
  await login('studentA', 'MatrixNew!234');
  const fresh = (await api('/courses/replays/1/stream-url', { user:'studentA' })).body.url.slice(4);
  assert.equal((await api(fresh, { user:null })).status, 200);
});

test('负责学生的教师/导师以及只有报告评审历史的账号拒绝改角色或删除', async () => {
  db.prepare('UPDATE users SET mentor_id=9 WHERE id=7').run();
  db.prepare('UPDATE lesson_learning_reports SET reviewer_id=10 WHERE id=2').run();
  for (const [id, label] of [[4,'负责学生的教师关系'],[9,'负责学生的导师关系'],[10,'学习报告评审记录']]) {
    const before = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    const changed = await api(`/students/users/${id}`, { method:'PUT',body:{real_name:before.real_name,role:'student',school_id:1,class_id:1} });
    assert.equal(changed.status, 409);
    assert.ok(changed.body.blockers.some(item => item.label === label));
    assert.equal((await api(`/students/users/${id}`, { method:'DELETE' })).status, 400);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get(id), before);
  }
});

test('改密签发新会话失败时完整回滚，密码、旧会话和刷新凭证保持一致', async () => {
  const before = db.prepare('SELECT * FROM users WHERE id=5').get();
  const refresh = db.prepare('SELECT * FROM refresh_tokens WHERE user_id=5').all();
  db.exec("CREATE TEMP TRIGGER fail_password_session BEFORE INSERT ON refresh_tokens WHEN NEW.user_id=5 BEGIN SELECT RAISE(ABORT,'session issuance failure'); END");
  try {
    assert.equal((await api('/auth/change-password', { user:'teacherB',method:'POST',body:{old_password:'Matrix!1234',new_password:'Another!345'} })).status, 500);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=5').get(), before);
    assert.deepEqual(db.prepare('SELECT * FROM refresh_tokens WHERE user_id=5').all(), refresh);
    assert.equal((await api('/auth/me', { user:'teacherB' })).status, 200);
  } finally {db.exec('DROP TRIGGER fail_password_session');}
  await login('teacherB');
});
