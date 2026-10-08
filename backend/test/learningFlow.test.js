const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-learning-flow-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'learning-flow-tests';
process.env.LOGIN_RATE_LIMIT_IP = '1000';

const app = require('../app');
const db = require('../config/database');
let server;
let base;
const tokens = {};

async function api(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function login(username) {
  const result = await api('/auth/login', { method: 'POST', body: { username, password: 'Student!1234' } });
  assert.equal(result.status, 200);
  return result.body.token;
}

before(async () => {
  const password = bcrypt.hashSync('Student!1234', 4);
  const user = db.prepare(`INSERT INTO users (id,username,password_hash,real_name,role,is_active) VALUES (?,?,?,?,?,1)`);
  user.run(1, 'admin', password, '管理员', 'admin');
  user.run(2, 'mentor', password, '执行导师', 'academic_mentor');
  user.run(3, 'student', password, '学生A', 'student');
  user.run(4, 'outsider', password, '未报名学生', 'student');
  user.run(5, 'teacher', password, '观察教师', 'teacher');
  user.run(6, 'othermentor', password, '其他导师', 'academic_mentor');
  db.prepare('UPDATE users SET teacher_id = 5 WHERE id = 3').run();
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (1,'课后巩固课','primary','basic','published',2)").run();
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (2,'草稿课','primary','basic','draft',2)").run();
  db.prepare("INSERT INTO courses (id,title,grade_level,difficulty,status,created_by) VALUES (3,'受邀授课课程','primary','basic','published',1)").run();
  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,instructor_id) VALUES (1,1,'第一课','completed',1,2)").run();
  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,instructor_id) VALUES (2,2,'草稿课时','scheduled',1,2)").run();
  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,instructor_id) VALUES (3,3,'受邀课时','scheduled',1,6)").run();
  db.prepare("INSERT INTO enrollments (id,student_id,course_id,status,enrolled_by) VALUES (1,3,1,'active',2)").run();
  db.prepare("INSERT INTO enrollments (id,student_id,course_id,status,enrolled_by) VALUES (2,3,2,'active',2)").run();
  db.prepare("INSERT INTO tasks (id,lesson_id,title,require_upload,status,sort_order) VALUES (1,1,'综合成果',1,'active',1)").run();
  db.prepare("INSERT INTO tasks (id,lesson_id,title,require_upload,status,sort_order) VALUES (3,3,'受邀课程任务',0,'active',1)").run();
  db.prepare(`INSERT INTO knowledge_cards (id,lesson_id,title,content,sort_order,is_required,status,created_by)
              VALUES (1,1,'必修卡片','需要掌握的知识',1,1,'published',2)`).run();
  db.prepare(`INSERT INTO knowledge_cards (id,lesson_id,title,content,sort_order,is_required,status,created_by)
              VALUES (2,1,'草稿卡片','不可见内容',2,1,'draft',2)`).run();
  db.prepare(`INSERT INTO card_exercises (id,card_id,question_type,prompt,options_json,answer_json,explanation,points,is_required)
              VALUES (1,1,'single_choice','正确选项是什么？','["A","B"]','"A"','因为 A 正确',2,1)`).run();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const username of ['admin', 'mentor', 'student', 'outsider', 'teacher', 'othermentor']) tokens[username] = await login(username);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('旧进度接口只保存播放位置，不能由客户端伪造课时完成', async () => {
  const update = await api('/courses/1/progress', {
    method: 'POST', token: tokens.student, body: { lesson_id: 1, progress: 100, last_position: 12 },
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.progress, 0);
  assert.deepEqual(db.prepare('SELECT progress, last_position, completed_at FROM lesson_progress WHERE student_id = 3 AND lesson_id = 1').get(),
    { progress: 0, last_position: 12, completed_at: null });
  assert.equal((await api('/courses/1/progress', {
    method: 'POST', token: tokens.outsider, body: { lesson_id: 1, progress: 100 },
  })).status, 403);
  assert.equal((await api('/courses/2/progress', {
    method: 'POST', token: tokens.student, body: { lesson_id: 2, progress: 100 },
  })).status, 403);
});

test('学生学习包校验报名和发布状态，且不泄漏答案', async () => {
  assert.equal((await api('/learning/lessons/1', { token: tokens.outsider })).status, 404);
  assert.equal((await api('/learning/lessons/2', { token: tokens.student })).status, 404);
  const result = await api('/learning/lessons/1', { token: tokens.student });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.cards.map((card) => card.id), [1]);
  const exercise = result.body.cards[0].exercises[0];
  assert.equal(Object.hasOwn(exercise, 'answer_json'), false);
  assert.equal(Object.hasOwn(exercise, 'answer'), false);
  assert.equal(exercise.correct_answer, null, '作答前不能泄漏标准答案');
  assert.deepEqual(exercise.options, ['A', 'B']);
  assert.equal(exercise.explanation, null, '作答前不能泄漏答案详解');
  assert.equal(result.body.progress.review_completed, false);
  assert.equal(result.body.progress.cards_done, false);

  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,instructor_id) VALUES (4,1,'未配置卡片课时','completed',2,2)").run();
  const emptyLesson = await api('/learning/lessons/4', { token: tokens.student });
  assert.equal(emptyLesson.status, 200);
  assert.equal(emptyLesson.body.progress.cards_done, false, '没有已发布卡片时不能默认完成');
  await api('/learning/lessons/4/review-complete', { method: 'POST', token: tokens.student });
  assert.equal((await api('/learning/lessons/4/report', {
    method: 'POST', token: tokens.student,
    body: { report: { summary: '不能绕过卡片' }, reflection: { difficulty: '无' } },
  })).status, 409);
  db.prepare('DELETE FROM lessons WHERE id = 4').run();
});

test('课堂回顾和知识卡片必须按顺序显式完成，加载页面不会自动完成', async () => {
  assert.equal((await api('/learning/exercises/1/submit', {
    method: 'POST', token: tokens.student, body: { answer: 'A' },
  })).status, 409);
  assert.equal((await api('/learning/cards/1/complete', {
    method: 'POST', token: tokens.student,
  })).status, 409);

  const review = await api('/learning/lessons/1/review-complete', {
    method: 'POST', token: tokens.student,
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.progress.review_completed, true);

  let attempt = await api('/learning/exercises/1/submit', {
    method: 'POST', token: tokens.student, body: { answer: 'B' },
  });
  assert.equal(attempt.status, 200);
  assert.equal(attempt.body.correct, false);
  assert.equal(attempt.body.explanation, '因为 A 正确');
  assert.equal(attempt.body.correct_answer, 'A');
  assert.equal(attempt.body.card_completed, true);
  const repeated = await api('/learning/exercises/1/submit', {
    method: 'POST', token: tokens.student, body: { answer: 'A' },
  });
  assert.equal(repeated.status, 409);
  assert.equal(repeated.body.code, 'MAX_ATTEMPTS_REACHED');

  let state = await api('/learning/lessons/1', { token: tokens.student });
  assert.equal(state.body.progress.cards_done, false);
  assert.equal(state.body.cards[0].completed, false);
  assert.equal(state.body.cards[0].exercises[0].attempted, true);
  assert.equal(state.body.cards[0].exercises[0].passed, false);
  assert.equal(state.body.cards[0].exercises[0].explanation, '因为 A 正确');
  assert.equal(state.body.cards[0].exercises[0].correct_answer, 'A');

  const completed = await api('/learning/cards/1/complete', {
    method: 'POST', token: tokens.student,
  });
  assert.equal(completed.status, 200);
  state = await api('/learning/lessons/1', { token: tokens.student });
  assert.equal(state.body.progress.cards_done, true);
  assert.equal(state.body.progress.report_unlocked, true);
});

test('报告与反思保持原子提交，且不再依赖单独的综合成果阶段', async () => {
  const payload = {
    report: { summary: '我掌握了关键知识并完成实践。', key_points: '关键点 A' },
    reflection: { difficulty: '实验参数调整', solution: '逐次验证' },
  };
  db.exec("CREATE TRIGGER fail_reflection BEFORE INSERT ON reflections BEGIN SELECT RAISE(ABORT,'reflection failed'); END");
  const failed = await api('/learning/lessons/1/report', {
    method: 'POST', token: tokens.student, body: payload,
  });
  assert.equal(failed.status, 500);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lesson_learning_reports').get().count, 0);
  db.exec('DROP TRIGGER fail_reflection');

  const submitted = await api('/learning/lessons/1/report', {
    method: 'POST', token: tokens.student, body: payload,
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.report.version, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reflections WHERE report_id = ?').get(submitted.body.report.id).count, 1);
});

test('退回报告可创建新版本，已提交版本不可原地覆盖', async () => {
  const first = db.prepare('SELECT id FROM lesson_learning_reports WHERE version = 1').get();
  assert.equal((await api(`/mentor-reviews/${first.id}/review`, {
    method: 'POST', token: tokens.mentor, body: { status: 'rejected', comment: '请补充应用过程', score: 65 },
  })).status, 200);

  const payload = {
    report: { summary: '补充后的学习总结与应用过程。', application: '将知识用于综合成果。' },
    reflection: { difficulty: '梳理应用过程', improvement: '保留实验记录' },
  };
  const second = await api('/learning/lessons/1/report', {
    method: 'POST', token: tokens.student, body: payload,
  });
  assert.equal(second.status, 201);
  assert.equal(second.body.report.version, 2);
  assert.equal(second.body.report.parent_report_id, first.id);
  assert.equal((await api('/learning/lessons/1/report', {
    method: 'POST', token: tokens.student, body: payload,
  })).status, 409);
});

test('导师评审和内容管理严格按课程归属授权', async () => {
  const second = db.prepare('SELECT id FROM lesson_learning_reports WHERE version = 2').get();
  const queue = await api('/mentor-reviews?status=submitted', { token: tokens.mentor });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.items.map((item) => item.id), [second.id]);
  assert.equal((await api(`/mentor-reviews/${second.id}`, { token: tokens.othermentor })).status, 403);
  assert.equal((await api('/learning/manage/lessons/1/cards', { token: tokens.othermentor })).status, 403);
  assert.equal((await api('/learning/manage/lessons/1/cards', { token: tokens.teacher })).status, 403);
  const created = await api('/learning/manage/lessons/1/cards', {
    method: 'POST', token: tokens.admin,
    body: { title: '补充卡片', content: '补充学习内容', status: 'draft' },
  });
  assert.equal(created.status, 201);
});

test('题库七个写接口拒绝导师、教师和学生且不改变历史数据', async () => {
  const writes = [
    ['POST', '/learning/manage/lessons/1/cards', { title: '禁止新增', content: '内容' }],
    ['POST', '/learning/manage/lessons/1/cards/reorder', { card_ids: [2, 1] }],
    ['PUT', '/learning/manage/cards/1', { title: '禁止修改', status: 'archived' }],
    ['DELETE', '/learning/manage/cards/1'],
    ['POST', '/learning/manage/cards/1/exercises', { question_type: 'fill_blank', prompt: '题目', answer: '答案', explanation: '解析' }],
    ['PUT', '/learning/manage/exercises/1', { answer: 'B', explanation: '禁止修改' }],
    ['DELETE', '/learning/manage/exercises/1'],
  ];
  const snapshot = () => Object.fromEntries([
    'knowledge_cards', 'card_exercises', 'card_exercise_attempts', 'student_card_progress',
    'lesson_progress', 'lesson_learning_reports', 'courses', 'enrollments',
  ].map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
  const original = snapshot();
  for (const role of ['mentor', 'othermentor', 'teacher', 'student']) {
    for (const [method, url, body] of writes) {
      assert.equal((await api(url, { method, body, token: tokens[role] })).status, 403, `${role}: ${method} ${url}`);
    }
  }
  assert.deepEqual(snapshot(), original);
});

test('服务层直接调用也拒绝导师写题库，导师只读接口隐藏答案和解析', async () => {
  const service = require('../services/learningService');
  const mentor = { id: 2, role: 'academic_mentor' };
  for (const write of [
    () => service.createCard(mentor, 1, {}),
    () => service.updateCard(mentor, 1, {}),
    () => service.deleteCard(mentor, 1),
    () => service.reorderCards(mentor, 1, [1, 2]),
    () => service.createExercise(mentor, 1, {}),
    () => service.updateExercise(mentor, 1, {}),
    () => service.deleteExercise(mentor, 1),
  ]) {
    assert.throws(write, (error) => error.status === 403 && error.code === 'LEARNING_CONTENT_READ_ONLY');
  }
  const result = await api('/learning/manage/lessons/1/cards', { token: tokens.mentor });
  assert.equal(result.status, 200);
  const exercise = result.body.cards.find((card) => card.id === 1).exercises[0];
  for (const field of ['answer_json', 'answer', 'correct_answer', 'explanation']) {
    assert.equal(Object.hasOwn(exercise, field), false, field);
  }
  const admin = await api('/learning/manage/lessons/1/cards', { token: tokens.admin });
  assert.equal(admin.body.cards.find((card) => card.id === 1).exercises[0].answer, 'A');
});

test('管理员仍可创建、修改、排序和删除知识卡片与练习', async () => {
  const request = (url, method, body) => api(url, { method, body, token: tokens.admin });
  const card = await request('/learning/manage/lessons/3/cards', 'POST', { title: '管理员卡片', content: '正文', status: 'draft' });
  assert.equal(card.status, 201);
  const id = card.body.id;
  assert.equal((await request(`/learning/manage/cards/${id}`, 'PUT', { title: '更新标题' })).status, 200);
  assert.equal((await request('/learning/manage/lessons/3/cards/reorder', 'POST', { card_ids: [id] })).status, 200);
  const exercise = await request(`/learning/manage/cards/${id}/exercises`, 'POST', { question_type: 'fill_blank', prompt: '作用力', answer: '重力', explanation: '地球吸引' });
  assert.equal(exercise.status, 201);
  assert.equal((await request(`/learning/manage/exercises/${exercise.body.id}`, 'PUT', { explanation: '更新解析' })).status, 200);
  assert.equal((await request(`/learning/manage/exercises/${exercise.body.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/learning/manage/cards/${id}`, 'DELETE')).status, 200);
});

test('内容编排中心列出导师创建或受邀授课课程的课时', async () => {
  const owner = await api('/learning/manage/lessons', { token: tokens.mentor });
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.body.lessons.map((item) => item.id), [1, 2]);
  const invited = await api('/learning/manage/lessons', { token: tokens.othermentor });
  assert.equal(invited.status, 200);
  assert.deepEqual(invited.body.lessons.map((item) => item.id), [3]);
  assert.equal((await api('/learning/manage/lessons/3/cards', { token: tokens.othermentor })).status, 200);
  const tasks = await api('/tasks', { token: tokens.othermentor });
  assert.deepEqual(tasks.body.tasks.map((item) => item.id), [3]);
  assert.equal((await api('/learning/manage/lessons', { token: tokens.teacher })).status, 403);
});

test('教师观察端仅返回明确分配学生且所有学习写接口均拒绝教师', async () => {
  const dashboard = await api('/observer', { token: tokens.teacher });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.stats.assigned_students, 1);
  const list = await api('/observer/students', { token: tokens.teacher });
  assert.deepEqual(list.body.items.map((item) => item.id), [3]);
  assert.equal((await api('/observer/students/3', { token: tokens.teacher })).status, 200);
  assert.equal((await api('/observer/students/4', { token: tokens.teacher })).status, 404);
  assert.equal((await api('/learning/lessons/1', { token: tokens.teacher })).status, 403);
  assert.equal((await api('/mentor-reviews', { token: tokens.teacher })).status, 403);
});

test('报告通过并评分后完成课时并只写一条成长记录', async () => {
  const report = db.prepare('SELECT id FROM lesson_learning_reports WHERE version = 2').get();
  const review = await api(`/mentor-reviews/${report.id}/review`, {
    method: 'POST', token: tokens.mentor,
    body: { status: 'approved', comment: '学习报告完整', score: 92, dimensions: { knowledge_understanding: 95, reflection_expression: 88 } },
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.report.score, 92);
  const reviewedDetail = await api(`/mentor-reviews/${report.id}`, { token: tokens.mentor });
  assert.deepEqual(reviewedDetail.body.report.score_dimensions, { knowledge_understanding: 95, reflection_expression: 88 });
  const progress = db.prepare('SELECT progress, completed_at FROM lesson_progress WHERE student_id = 3 AND lesson_id = 1').get();
  assert.equal(progress.progress, 100);
  assert.ok(progress.completed_at);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM growth_records WHERE student_id = 3 AND description LIKE '完成课时%' ").get().count, 1);
});
