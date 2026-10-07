const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { runMigrations } = require('../database/migrate');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-revision-'));
Object.assign(process.env, {
  DB_PATH: path.join(dir, 'test.db'), UPLOAD_PATH: path.join(dir, 'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(dir, 'feedback'), NODE_ENV: 'test',
  JWT_SECRET: 'revision-regression', LOGIN_RATE_LIMIT_IP: '1000',
});
const app = require('../app');
const db = require('../config/database');
let server, base;
const tokens = {};
const video = Buffer.from('0000ftypisom0000');

async function api(url, method = 'GET', body, user = 'student') {
  const multipart = body instanceof FormData;
  const res = await fetch(`${base}/api${url}`, {
    method, headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
function replayForm(summary) {
  const form = new FormData();
  form.append('file', new Blob([video], { type: 'video/mp4' }), 'replay.mp4');
  form.append('title', '课后回放');
  form.append('description', '原简介');
  form.append('duration_seconds', '1800');
  form.append('recording_date', '2026-10-07');
  form.append('sort_order', '3');
  if (summary !== undefined) form.append('summary', summary);
  return form;
}
function reportPayload(baseId, suffix = '一') {
  return {
    base_report_id: baseId,
    report: { summary: `学习总结${suffix}`, application: `应用设想${suffix}` },
    reflection: { difficulty: `遇到困难${suffix}`, solution: `解决方式${suffix}`, improvement: `改进${suffix}`, new_question: `问题${suffix}` },
  };
}
const reports = () => db.prepare('SELECT * FROM lesson_learning_reports WHERE lesson_id = 1 ORDER BY version').all();

before(async () => {
  const hash = bcrypt.hashSync('Test!1234', 4);
  for (const [id, username, role] of [[1,'admin','admin'],[2,'mentor','academic_mentor'],[3,'student','student'],[4,'outsider','student'],[5,'teacher','teacher'],[6,'othermentor','academic_mentor']]) {
    db.prepare('INSERT INTO users (id,username,password_hash,real_name,role) VALUES (?,?,?,?,?)').run(id,username,hash,username,role);
  }
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (1,'测试课程','primary','basic','published',2)").run();
  db.prepare("INSERT INTO lessons (id,course_id,title,status) VALUES (1,1,'测试课时','completed'),(2,1,'另一个课时','completed')").run();
  db.prepare("INSERT INTO enrollments (id,student_id,course_id,status) VALUES (1,3,1,'active')").run();
  db.prepare("INSERT INTO knowledge_cards (id,lesson_id,title,content,status,created_by) VALUES (1,1,'知识卡片','原内容','published',2)").run();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const user of ['admin','mentor','student','outsider','teacher','othermentor']) {
    const login = await api('/auth/login', 'POST', { username:user,password:'Test!1234' }, null);
    assert.equal(login.status, 200); tokens[user] = login.body.token;
  }
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close(); fs.rmSync(dir, { recursive:true, force:true });
});

test('main已应用滑翔机014/015的旧库补充摘要，保留已有视频且重复启动幂等', () => {
  const old = new Database(':memory:');
  try {
    runMigrations(old);
    old.exec('ALTER TABLE course_replays DROP COLUMN summary; DELETE FROM schema_migrations WHERE version = 16;');
    old.prepare("INSERT INTO users (id,username,password_hash,real_name,role) VALUES (1,'old','hash','旧导师','academic_mentor')").run();
    old.prepare("INSERT INTO courses (id,title,grade_level,difficulty,created_by) VALUES (1,'旧课程','primary','basic',1)").run();
    old.prepare("INSERT INTO course_replays (id,course_id,title,description,video_path,created_by) VALUES (1,1,'旧回放','旧简介','old.mp4',1)").run();
    runMigrations(old); runMigrations(old);
    assert.deepEqual(old.prepare('SELECT title,description,video_path,summary FROM course_replays').get(), { title:'旧回放',description:'旧简介',video_path:'old.mp4',summary:null });
    assert.deepEqual(old.prepare('SELECT version,name FROM schema_migrations WHERE version>=14 ORDER BY version').all(), [
      { version:14,name:'014_glider_design_params.sql' },
      { version:15,name:'015_glider_trajectories.sql' },
      { version:16,name:'016_replay_summary.sql' },
      { version:17,name:'017_account_batches.sql' },
    ]);
    assert.equal(old.pragma('integrity_check', { simple:true }), 'ok');
  } finally { old.close(); }
});

test('已应用旧014摘要迁移的库保留摘要并补齐main滑翔机结构，重复启动幂等', () => {
  const old = new Database(':memory:');
  try {
    runMigrations(old);
    for (const column of ['wing_area','mass','elevator_deg','rudder_deg']) old.exec(`ALTER TABLE glider_simulations DROP COLUMN ${column}`);
    old.exec(`DROP TABLE glider_trajectories;
      DELETE FROM schema_migrations WHERE version IN (14,15);
      UPDATE schema_migrations SET version=14,name='014_replay_summary.sql' WHERE version=16;
      INSERT INTO users (id,username,password_hash,real_name,role) VALUES (1,'old','hash','旧导师','academic_mentor');
      INSERT INTO courses (id,title,grade_level,difficulty,created_by) VALUES (1,'旧课程','primary','basic',1);
      INSERT INTO course_replays (id,course_id,title,description,summary,video_path,created_by)
        VALUES (1,1,'旧回放','旧简介','已上传摘要','old.mp4',1);`);
    runMigrations(old); runMigrations(old);
    assert.deepEqual(old.prepare('SELECT title,description,video_path,summary FROM course_replays').get(),
      { title:'旧回放',description:'旧简介',video_path:'old.mp4',summary:'已上传摘要' });
    const columns = old.prepare('PRAGMA table_info(glider_simulations)').all().map((column) => column.name);
    for (const column of ['wing_area','mass','elevator_deg','rudder_deg']) assert.ok(columns.includes(column));
    assert.ok(old.prepare("SELECT name FROM sqlite_master WHERE name='glider_trajectories'").get());
    assert.deepEqual(old.prepare('SELECT version,name FROM schema_migrations WHERE version>=14 ORDER BY version').all(), [
      { version:14,name:'014_glider_design_params.sql' },
      { version:15,name:'015_glider_trajectories.sql' },
      { version:16,name:'016_replay_summary.sql' },
      { version:17,name:'017_account_batches.sql' },
    ]);
    assert.equal(old.pragma('integrity_check', { simple:true }), 'ok');
  } finally { old.close(); }
});

test('旧014摘要迁移记录与结构不一致时停止升级，不错误覆盖迁移记录', () => {
  const old = new Database(':memory:');
  try {
    runMigrations(old);
    old.exec(`ALTER TABLE course_replays DROP COLUMN summary;
      DELETE FROM schema_migrations WHERE version IN (14,15);
      UPDATE schema_migrations SET version=14,name='014_replay_summary.sql' WHERE version=16;`);
    const before = old.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    assert.throws(() => runMigrations(old), /旧版摘要迁移记录与实际结构不一致/);
    assert.deepEqual(old.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), before);
  } finally { old.close(); }
});

test('回放可先上传视频，随后单独添加、更改或清空摘要，其余信息保留', async () => {
  const created = await api('/courses/1/replays','POST',replayForm(),'mentor');
  assert.equal(created.status,200);
  const original = db.prepare('SELECT * FROM course_replays WHERE id=?').get(created.body.id);
  assert.equal(original.summary,null);
  for (const summary of ['第一讲摘要\n重点：升力与阻力','更新后的摘要','']) {
    assert.equal((await api(`/courses/replays/${original.id}`,'PUT',{summary},'mentor')).status,200);
    const current = db.prepare('SELECT * FROM course_replays WHERE id=?').get(original.id);
    assert.equal(current.summary,summary || null);
    for (const field of ['title','description','video_path','duration_seconds','recording_date','sort_order']) assert.equal(current[field],original[field]);
    assert.deepEqual(fs.readFileSync(current.video_path),video);
  }
  assert.equal((await api(`/courses/replays/${original.id}`,'PUT',{summary:'课堂重点'},'admin')).status,200);
  assert.equal((await api(`/courses/replays/${original.id}`,'PUT',{title:'仅修改标题'},'mentor')).status,200);
  assert.equal(db.prepare('SELECT summary FROM course_replays WHERE id=?').get(original.id).summary,'课堂重点');
});

test('上传时可附带Markdown课程纪要，列表和学生课时接口原样返回且不泄漏磁盘路径', async () => {
  const summary = '## 课程纪要\n\n**重点知识**\n\n- 课堂活动\n\n| 参数 | 含义 |\n| --- | --- |\n| L | 升力 |';
  const created = await api('/courses/1/replays','POST',replayForm(`  ${summary}  `),'mentor');
  assert.equal(created.status,200);
  const list = await api('/courses/1/replays');
  assert.equal(list.body.replays.find((item) => item.id === created.body.id).summary.replace(/\r\n/g,'\n'),summary);
  assert.equal(Object.hasOwn(list.body.replays[0],'video_path'),false);
  const lesson = await api('/learning/lessons/1');
  assert.equal(lesson.body.replays.find((item) => item.id === created.body.id).summary.replace(/\r\n/g,'\n'),summary);
  db.prepare('UPDATE course_replays SET lesson_id=2 WHERE id=?').run(created.body.id);
  assert.equal((await api('/learning/lessons/1')).body.replays.some((item) => item.id === created.body.id),false);
  assert.equal((await api('/learning/lessons/2')).body.replays.some((item) => item.id === created.body.id),true);
});

test('摘要长度和类型异常返回400且不修改数据，上传失败清理视频文件', async () => {
  const before = db.prepare('SELECT * FROM course_replays WHERE id=1').get();
  for (const summary of ['长'.repeat(10001),null,{},123]) assert.equal((await api('/courses/replays/1','PUT',{summary},'mentor')).status,400);
  assert.deepEqual(db.prepare('SELECT * FROM course_replays WHERE id=1').get(),before);
  const files = fs.readdirSync(path.join(dir,'uploads/course-replays')).sort();
  assert.equal((await api('/courses/1/replays','POST',replayForm('长'.repeat(10001)),'mentor')).status,400);
  assert.deepEqual(fs.readdirSync(path.join(dir,'uploads/course-replays')).sort(),files);
  assert.equal((await api('/courses/replays/1','PUT',{summary:'字'.repeat(10000)},'mentor')).status,200);
});

test('摘要管理和读取遵守课程与角色权限', async () => {
  const original = db.prepare('SELECT * FROM course_replays WHERE id=1').get();
  for (const user of ['student','outsider','teacher','othermentor']) {
    assert.ok([403,404].includes((await api('/courses/replays/1','PUT',{summary:'越权'},user)).status));
  }
  for (const user of ['outsider','teacher','othermentor']) assert.equal((await api('/courses/1/replays','GET',undefined,user)).status,404);
  assert.deepEqual(db.prepare('SELECT * FROM course_replays WHERE id=1').get(),original);
});

test('Markdown知识卡片源码完整保存，草稿隐藏，发布后学生获得相同内容', async () => {
  const markdown = '## 升力\n\n**核心概念**\n\n- 流速\n- 压力\n\n```js\nconst lift = 1;\n```\n\n| 参数 | 含义 |\n| --- | --- |\n| L | 升力 |';
  const created = await api('/learning/manage/lessons/1/cards','POST',{title:'Markdown卡片',content:markdown,status:'draft'},'mentor');
  assert.equal(created.status,201);
  assert.equal((await api('/learning/lessons/1')).body.cards.some((item) => item.id === created.body.id),false);
  assert.equal((await api(`/learning/manage/cards/${created.body.id}`,'PUT',{status:'published'},'mentor')).status,200);
  assert.equal((await api('/learning/lessons/1')).body.cards.find((item) => item.id === created.body.id).content,markdown);
  assert.equal((await api(`/learning/manage/cards/${created.body.id}`,'PUT',{content:markdown+'\n\n> 继续探究'},'othermentor')).status,403);
  assert.equal(db.prepare('SELECT content FROM knowledge_cards WHERE id=?').get(created.body.id).content,markdown);
  await api('/learning/lessons/1/review-complete','POST');
  for (const card of (await api('/learning/lessons/1')).body.cards) assert.equal((await api(`/learning/cards/${card.id}/complete`,'POST')).status,200);
});

test('缺少或空白反思无法提交，首次提交保存四项反思并进入待评审', async () => {
  for (const reflection of [undefined,{}, {difficulty:'   '}]) {
    assert.equal((await api('/learning/lessons/1/report','POST',{report:{summary:'总结'},reflection})).status,400);
  }
  assert.equal(reports().length,0);
  const submitted = await api('/learning/lessons/1/report','POST',reportPayload(null));
  assert.equal(submitted.status,201);
  const lesson = (await api('/learning/lessons/1')).body;
  assert.equal(lesson.progress.percent,85);
  assert.equal(lesson.report.status,'submitted');
  assert.equal(lesson.reflection.report_id,submitted.body.report.id);
  for (const [field,value] of Object.entries(reportPayload(null).reflection)) assert.equal(lesson.reflection[field],value);
});

test('打回后保留报告、反思和意见，前两阶段保持完成，同日可再次提交', async () => {
  const first = reports()[0];
  assert.equal((await api(`/mentor-reviews/${first.id}/review`,'POST',{status:'rejected',comment:'补充实验过程',score:60},'mentor')).status,200);
  const lesson = (await api('/learning/lessons/1')).body;
  assert.equal(lesson.progress.percent,60); assert.equal(lesson.progress.status,'revision');
  assert.equal(lesson.progress.review_completed,true); assert.equal(lesson.progress.cards_done,true); assert.equal(lesson.progress.report_unlocked,true);
  assert.equal(lesson.report.review_comment,'补充实验过程'); assert.equal(lesson.reflection.difficulty,'遇到困难一');
  const second = await api('/learning/lessons/1/report','POST',reportPayload(first.id,'二'));
  assert.equal(second.status,201); assert.equal(second.body.report.version,2); assert.equal(second.body.report.parent_report_id,first.id);
  assert.equal(reports()[0].summary,first.summary);
  assert.equal(db.prepare('SELECT difficulty FROM reflections WHERE report_id=?').get(first.id).difficulty,'遇到困难一');
  const reviewDetail = (await api(`/mentor-reviews/${second.body.report.id}`,'GET',undefined,'mentor')).body;
  assert.equal(reviewDetail.reflection.difficulty,'遇到困难二'); assert.deepEqual(reviewDetail.history.map((item) => item.version),[2,1]);
  assert.equal((await api(`/mentor-reviews/${first.id}/review`,'POST',{status:'approved',score:99},'mentor')).status,409);
});

test('连续打回时过期页面不能提交，失败回滚后可重试，重复并发提交只保存一版', async () => {
  const [first,second] = reports();
  assert.equal((await api(`/mentor-reviews/${second.id}/review`,'POST',{status:'rejected',comment:'再次补充反思',score:70},'mentor')).status,200);
  const stale = await api('/learning/lessons/1/report','POST',reportPayload(first.id,'过期'));
  assert.equal(stale.status,409); assert.equal(stale.body.code,'REPORT_VERSION_CHANGED'); assert.equal(reports().length,2);
  db.exec("CREATE TRIGGER fail_revision BEFORE INSERT ON reflections BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
  assert.equal((await api('/learning/lessons/1/report','POST',reportPayload(second.id,'三'))).status,500);
  assert.equal(reports().length,2); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reflections WHERE lesson_id=1').get().count,2);
  assert.equal((await api('/learning/lessons/1')).body.progress.percent,60);
  db.exec('DROP TRIGGER fail_revision');
  const concurrent = await Promise.all([api('/learning/lessons/1/report','POST',reportPayload(second.id,'三')),api('/learning/lessons/1/report','POST',reportPayload(second.id,'三'))]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(),[201,409]);
  assert.equal(reports().length,3); assert.equal(reports()[2].parent_report_id,second.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reflections WHERE report_id=?').get(reports()[2].id).count,1);
});

test('再次通过后最新版本完成课时，旧版本意见与反思保留，重复评审不会重复成长记录', async () => {
  const latest = reports().at(-1);
  const result = await api(`/mentor-reviews/${latest.id}/review`,'POST',{status:'approved',comment:'修改完整',score:95,dimensions:{reflection_expression:96}},'mentor');
  assert.equal(result.status,200); assert.equal(result.body.progress.percent,100); assert.equal(result.body.progress.completed,true);
  const lesson = (await api('/learning/lessons/1')).body;
  assert.equal(lesson.report.version,3); assert.equal(lesson.reflection.difficulty,'遇到困难三');
  assert.equal((await api('/learning/lessons/1/report','POST',reportPayload(latest.id,'四'))).status,409);
  assert.equal((await api(`/mentor-reviews/${latest.id}/review`,'POST',{status:'approved',score:95},'mentor')).status,409);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM growth_records WHERE description LIKE '完成课时%' ").get().count,1);
  assert.deepEqual(reports().map((item) => item.status),['rejected','rejected','approved']);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reflections WHERE lesson_id=1').get().count,3);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok'); assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
