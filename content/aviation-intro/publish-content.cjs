// 发布已审核内容，并补齐课后任务入口；凭据只从环境变量读取。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '../../backend'));
require('../../backend/node_modules/dotenv').config({ quiet: true });
const app = require('../../backend/app');
const db = require('../../backend/config/database');

async function main() {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson.json'), 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(path.join(__dirname, 'import-receipt.json'), 'utf8'));
  const courseId = receipt.course.id;
  const lessonId = receipt.lesson.id;
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  assert.equal(course.title, payload.course.title);
  assert.equal(course.status, 'published');
  assert.equal(db.prepare('SELECT course_id FROM lessons WHERE id = ?').get(lessonId).course_id, courseId);
  const backup = path.resolve(`database/backups/before-aviation-publish-${Date.now()}.db`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  await db.backup(backup);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let token;
  let transaction = false;
  const api = async (url, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    assert.ok(res.ok, `${method} ${url}: ${res.status} ${result.error || ''}`);
    return result;
  };
  try {
    token = (await api('/auth/login', { username: process.env.PBL_IMPORT_ADMIN_USERNAME, password: process.env.PBL_IMPORT_ADMIN_PASSWORD })).token;
    assert.equal((await api('/auth/me')).user.role, 'admin');
    const protectedTables = ['courses', 'lessons', 'enrollments', 'card_exercises', 'card_exercise_attempts', 'student_card_progress', 'lesson_progress', 'lesson_learning_reports', 'reflections', 'works'];
    const before = Object.fromEntries(protectedTables.map((name) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]));
    db.exec('BEGIN IMMEDIATE'); transaction = true;
    const cards = (await api(`/learning/manage/lessons/${lessonId}/cards`)).cards;
    assert.equal(cards.length, 6);
    for (const [i, card] of cards.entries()) {
      assert.equal(card.title, payload.cards[i].title);
      assert.equal(card.content, payload.cards[i].content);
      assert.equal(card.exercises.length, payload.cards[i].exercises.length);
      if (card.status === 'draft') await api(`/learning/manage/cards/${card.id}`, { status: 'published' }, 'PUT');
      else assert.equal(card.status, 'published');
    }
    const title = '滑翔机与空气动力学：知识卡片与基础练习';
    let task = db.prepare("SELECT id FROM tasks WHERE lesson_id = ? AND title = ? AND status = 'active'").get(lessonId, title);
    if (!task) task = await api(`/courses/lessons/${lessonId}/tasks`, {
      title, description: '先完成课堂回顾，再阅读6张知识卡片，完成8道单选和7道填空练习。每题只有一次作答机会，提交后查看答案解析；全部作答后确认学完卡片，再完成学习报告与反思。',
      task_type: 'inquiry', require_upload: false,
    });
    for (const table of protectedTables) assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(), before[table], table);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM knowledge_cards WHERE lesson_id = ? AND status = 'published'").get(lessonId).n, 6);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    db.exec('COMMIT'); transaction = false;
    const published = { course_id: courseId, lesson_id: lessonId, task_id: task.id, task_title: title, cards_published: 6, questions: 15, backup, published_at: new Date().toISOString() };
    fs.writeFileSync(path.join(__dirname, 'publication-receipt.json'), JSON.stringify(published, null, 2) + '\n');
    console.log(JSON.stringify(published, null, 2));
    for (const username of ['student_wang', 'student_chen', 'student_liu']) {
      token = (await api('/auth/login', { username, password: process.env.PBL_VERIFY_STUDENT_PASSWORD })).token;
      const tasks = (await api('/tasks')).tasks;
      assert.ok(tasks.some((item) => item.id === task.id && item.course_id === courseId));
      const learning = await api(`/learning/lessons/${lessonId}`);
      assert.equal(learning.cards.length, 6);
      assert.equal(learning.cards.flatMap((card) => card.exercises).length, 15);
      for (const exercise of learning.cards.flatMap((card) => card.exercises)) {
        if (!exercise.attempted) {
          assert.equal(exercise.correct_answer, null);
          assert.equal(exercise.explanation, null);
        }
      }
      console.log(`${username}: 课后任务入口、6张卡片、15道练习校验通过`);
    }
  } finally {
    if (transaction) db.exec('ROLLBACK');
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
