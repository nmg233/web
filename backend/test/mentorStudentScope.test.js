const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-mentor-students-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'mentor-student-tests';
process.env.LOGIN_RATE_LIMIT_IP = '100';
const app = require('../app');
const db = require('../config/database');
let server, base;
const tokens = {};
async function api(url, token = tokens.mentor_a, body) {
  const response = await fetch(base + '/api' + url, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const ids = rows => rows.map(r => r.id).sort((a,b) => a-b);
const treeStudents = tree => [...tree.schools.flatMap(s => s.classes.flatMap(c => c.roles.student)), ...tree.unassigned.student];
before(async () => {
  for (const id of [1,2]) {
    db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(id,`学校${id}`);
    db.prepare('INSERT INTO classes (id,name,school_id) VALUES (?,?,?)').run(id,`班级${id}`,id);
  }
  const rows = [[1,'admin','admin',null],[2,'mentor_a','academic_mentor',null],[3,'mentor_b','academic_mentor',null],
    [4,'teacher','teacher',1],[5,'own','student',1],[6,'other','student',1],[7,'none','student',1],
    [8,'historical','student',2],[9,'archived','student',1],[10,'mentor_empty','academic_mentor',null],
    [11,'media','media',null]];
  for (const [id,name,role,school] of rows) db.prepare('INSERT INTO users (id,username,real_name,role,school_id,class_id,password_hash) VALUES (?,?,?,?,?,?,?)')
    .run(id,name,name,role,school,school,bcrypt.hashSync('user123',4));
  db.prepare('UPDATE users SET teacher_id = 4 WHERE id IN (5, 8, 9)').run();
  db.prepare("UPDATE users SET is_active=0,archived_at=CURRENT_TIMESTAMP WHERE id=9").run();
  for (const [id,owner,status] of [[1,2,'published'],[2,3,'published'],[3,2,'draft'],[4,2,'archived']]) {
    db.prepare("INSERT INTO courses (id,title,created_by,status,grade_level,difficulty) VALUES (?,?,?,?,'primary','basic')").run(id,`课程${id}`,owner,status);
    db.prepare('UPDATE courses SET theme = ? WHERE id = ?').run(`主题${id}`,id);
  }
  for (const [student,course,status] of [[5,1,'active'],[5,3,'active'],[6,2,'active'],[8,4,'removed'],[9,1,'active']]) {
    db.prepare('INSERT INTO enrollments (student_id,course_id,status) VALUES (?,?,?)').run(student,course,status);
  }
  require('./helpers/explicitScopeFixture.cjs').observers(db);
  server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  base=`http://127.0.0.1:${server.address().port}`;
  for (const name of ['admin','mentor_a','mentor_b','teacher','own','mentor_empty','media']) tokens[name]=(await api('/auth/login',null,{username:name,password:'user123'})).body.token;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('导师工作台统计限于负责课程；新媒体只能读取已发布课程列表',async()=>{
  assert.deepEqual((await api('/dashboard',tokens.mentor_a)).body.stats,
    {schoolCount:2,userCount:3,courseCount:3,workCount:0});
  assert.deepEqual((await api('/dashboard',tokens.mentor_b)).body.stats,
    {schoolCount:1,userCount:1,courseCount:1,workCount:0});
  assert.deepEqual((await api('/dashboard',tokens.mentor_empty)).body.stats,
    {schoolCount:0,userCount:0,courseCount:0,workCount:0});
  assert.equal((await api('/dashboard',tokens.admin)).body.stats.courseCount,4);
  assert.equal((await api('/courses',tokens.teacher)).status,403);
  const mediaCourses=(await api('/courses',tokens.media)).body.courses;
  assert.deepEqual(ids(mediaCourses),[1,2]);
  assert.ok(mediaCourses.every((course)=>course.student_count===undefined && course.creator_name===undefined));
  assert.deepEqual((await api('/courses',tokens.media)).body.themes.map((item)=>item.theme).sort(),['主题1','主题2']);
  assert.deepEqual((await api('/courses',tokens.mentor_a)).body.themes.map((item)=>item.theme).sort(),['主题1','主题3','主题4']);
  assert.deepEqual((await api('/courses',tokens.own)).body.themes.map((item)=>item.theme),['主题1']);
  assert.notEqual((await api('/courses/1',tokens.media)).status,200);
});

test('导师列表仅有课程相关学生，历史/归档关系保留，多课程不重复，搜索无法扩大权限',async()=>{
  assert.deepEqual(ids((await api('/students')).body.students),[5,8,9]);
  assert.deepEqual(ids((await api('/students',tokens.mentor_b)).body.students),[6]);
  assert.deepEqual((await api('/students',tokens.mentor_empty)).body.students,[]);
  for (const query of ['search=other','search=none','search=%25&school_id=1&class_id=1&mentor_id=3']) {
    const rows=(await api('/students?'+query)).body.students;
    assert.ok(rows.every(r=>[5,8,9].includes(r.id)));
  }
  assert.deepEqual(ids((await api('/students?school_id=2')).body.students),[8]);
  assert.deepEqual(ids((await api('/students',tokens.mentor_b)).body.schools),[1]);
});

test('直接访问无关学生详情及档案返回403，相关学生允许',async()=>{
  for(const id of [5,8,9]) for(const url of [`/students/${id}`,`/archives/generate?student_id=${id}`]) assert.equal((await api(url)).status,200,url);
  for(const id of [6,7]) for(const url of [`/students/${id}`,`/archives/generate?student_id=${id}`]) {
    const response=await api(url);assert.equal(response.status,403,url);assert.equal(response.body.student,undefined);
  }
  assert.equal((await api('/students/5',tokens.mentor_b)).status,403);
  assert.equal((await api('/students/3',tokens.mentor_a)).status,403);
  assert.equal((await api('/students/3',tokens.admin)).status,200);
});

test('档案树、学校/班级批量导出和搜索均应用相同关系限制',async()=>{
  const tree=(await api('/archives/tree')).body;
  assert.deepEqual(ids(treeStudents(tree.tree)),[5,8,9]);
  assert.deepEqual(ids(tree.courses),[1,3,4]);
  assert.deepEqual((await api('/archives/tree?search=other')).body.tree.schools,[]);
  assert.deepEqual((await api('/archives/tree',tokens.mentor_empty)).body.tree.schools,[]);
  for(const query of ['school_id=1','class_id=1']) {
    const batch=await api('/archives/generate-batch?'+query);
    assert.equal(batch.status,200);assert.deepEqual(ids(batch.body.archives.map(a=>a.student)),[5,9]);
  }
  assert.deepEqual((await api('/archives/generate-batch?class_id=1&search=other')).body.archives,[]);
  assert.deepEqual(ids((await api('/archives/generate-batch?school_id=2')).body.archives.map(a=>a.student)),[8]);
});

test('无关学生不能添加成长记录；课程候选只包含合法负责学生',async()=>{
  assert.equal((await api('/archives/growth-records',tokens.mentor_a,{student_id:6,description:'越权记录'})).status,403);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM growth_records').get().c,0);
  assert.equal((await api('/archives/growth-records',tokens.mentor_a,{student_id:5,description:'合法观察'})).status,200);
  const candidates=await api('/courses/3/enroll/candidates?search=other');
  assert.equal(candidates.status,200);assert.deepEqual(ids(candidates.body.students),[]);
  assert.equal((await api('/courses/3/enroll',tokens.mentor_a,{student_ids:[6]})).status,403);
  assert.equal((await api('/courses/2/enroll/candidates')).status,403);
});

test('管理员全量、教师明确分配范围、学生本人档案',async()=>{
  const admin=(await api('/students',tokens.admin)).body.tree;
  assert.deepEqual(ids(treeStudents(admin)),[5,6,7,8,9]);
  assert.deepEqual(ids((await api('/students',tokens.teacher)).body.students),[5,8,9]);
  assert.deepEqual(ids(treeStudents((await api('/archives/tree',tokens.teacher)).body.tree)),[5,8,9]);
  assert.deepEqual(ids((await api('/archives/generate-batch?school_id=1',tokens.teacher)).body.archives.map(a=>a.student)),[5,9]);
  assert.deepEqual(ids((await api('/archives/generate-batch?school_id=2',tokens.teacher)).body.archives.map(a=>a.student)),[8]);
  assert.equal((await api('/archives/generate?student_id=8',tokens.teacher)).status,200);
  assert.equal((await api('/archives/generate?student_id=6',tokens.teacher)).status,403);
  assert.equal((await api('/archives/generate?student_id=6',tokens.admin)).status,200);
  const own=await api('/archives/generate?student_id=6',tokens.own);
  assert.equal(own.status,200);assert.equal(own.body.student.id,5);
});
