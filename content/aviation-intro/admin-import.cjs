// 一次性本地管理员录入工具；不发布课程或卡片，不修改已有课程。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('../../backend/node_modules/better-sqlite3');
const backend = path.resolve(__dirname, '../../backend');
process.chdir(backend);
require('../../backend/node_modules/dotenv').config({ path: path.join(backend, '.env'), quiet: true });

async function main() {
  const username = process.env.PBL_IMPORT_ADMIN_USERNAME;
  const password = process.env.PBL_IMPORT_ADMIN_PASSWORD;
  if (!username || !password) throw new Error('请通过 PBL_IMPORT_ADMIN_USERNAME / PBL_IMPORT_ADMIN_PASSWORD 提供管理员登录信息');
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson.json'), 'utf8'));
  assert.equal(payload.cards.length, 6);
  const questions = payload.cards.flatMap((card) => card.exercises);
  assert.equal(questions.filter((item) => item.question_type === 'single_choice').length, 8);
  assert.equal(questions.filter((item) => item.question_type === 'fill_blank').length, 7);
  assert.equal(new Set(questions.map((item) => item.source_id)).size, 15);
  for (const card of payload.cards) assert.equal(card.status, 'draft');
  const dbPath = path.resolve(backend, process.env.DB_PATH || 'database/pbl_platform.db');
  const read = new Database(dbPath, { readonly: true, fileMustExist: true });
  let backup;
  try {
    if (read.prepare('SELECT id FROM courses WHERE title = ?').get(payload.course.title)) {
      throw new Error('已有同名课程；停止录入，避免重复或覆盖');
    }
    const versions = read.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
    const publishedVersions = fs.readdirSync(path.join(backend, 'database/migrations')).filter((name) => /^\d+_.*\.sql$/.test(name)).map((name) => Number(name.split('_')[0])).sort((a, b) => a - b);
    assert.deepEqual(versions, publishedVersions, '目标数据库必须已完成现有迁移；本工具不进行结构升级');
    const backupDir = path.join(backend, 'database/backups');
    fs.mkdirSync(backupDir, { recursive: true });
    backup = path.join(backupDir, `before-aviation-draft-${Date.now()}.db`);
    await read.backup(backup);
  } finally { read.close(); }
  const app = require('../../backend/app');
  const db = require('../../backend/config/database');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  let transaction = false;
  const api = async (url, method = 'GET', body) => {
    const response = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${result.error || '请求失败'}`);
    return result;
  };
  try {
    const login = await api('/auth/login', 'POST', { username, password });
    token = login.token;
    const { user } = await api('/auth/me');
    assert.equal(user.role, 'admin');
    assert.equal(Boolean(user.force_reset_password), false, '管理员必须已完成首次改密');
    const tables = ['courses', 'lessons', 'knowledge_cards', 'card_exercises', 'card_exercise_attempts',
      'student_card_progress', 'lesson_progress', 'lesson_review_completions', 'lesson_learning_reports',
      'enrollments', 'tasks', 'works', 'work_reviews', 'reflections', 'growth_records', 'resources', 'course_replays'];
    const original = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
    // 本地专用进程的请求使用同一连接：全部内容录入后才提交；失败则完整回滚。
    db.exec('BEGIN IMMEDIATE'); transaction = true;
    const course = await api('/courses', 'POST', payload.course);
    const lesson = await api(`/courses/${course.id}/lessons`, 'POST', payload.lesson);
    const cards = [];
    for (const card of payload.cards) {
      const { exercises, ...content } = card;
      const created = await api(`/learning/manage/lessons/${lesson.id}/cards`, 'POST', content);
      const exerciseIds = [];
      for (const [index, question] of exercises.entries()) {
        const { source_id, ...exercise } = question;
        const saved = await api(`/learning/manage/cards/${created.id}/exercises`, 'POST', {
          ...exercise, sort_order: index + 1, is_required: true, max_attempts: 1,
        });
        exerciseIds.push({ source_id, id: saved.id });
      }
      cards.push({ id: created.id, title: card.title, exercises: exerciseIds });
    }
    const detail = await api(`/courses/${course.id}`);
    assert.equal(detail.course.status, 'draft');
    assert.equal(detail.lessons.length, 1);
    const managed = (await api(`/learning/manage/lessons/${lesson.id}/cards`)).cards;
    assert.equal(managed.length, 6);
    assert.equal(managed.flatMap((card) => card.exercises).length, 15);
    for (const [index, card] of managed.entries()) {
      const expected = payload.cards[index];
      assert.equal(card.status, 'draft');
      assert.equal(card.content, expected.content);
      for (const [q, exercise] of card.exercises.entries()) {
        assert.deepEqual(exercise.answer, expected.exercises[q].answer);
        assert.equal(exercise.explanation, expected.exercises[q].explanation);
        assert.equal(exercise.max_attempts, 1);
      }
    }
    assert.deepEqual((await api(`/learning/lessons/${lesson.id}/preview`)).cards, [], '草稿不进入已发布预览');
    for (const table of tables) {
      for (const row of original[table]) assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id), row, `原有 ${table} 数据必须保持不变`);
    }
    db.exec('COMMIT'); transaction = false;
    const receipt = {
      database: dbPath, admin: { id: user.id, username: user.username }, backup,
      course: { id: course.id, title: payload.course.title, status: 'draft' },
      lesson: { id: lesson.id, title: payload.lesson.title }, cards,
      totals: { cards: 6, single_choice: 8, fill_blank: 7, questions: 15, points: 15 },
      source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'lesson.json'))).digest('hex'),
      existing_business_rows_unchanged: true, created_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(__dirname, 'import-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    if (transaction) db.exec('ROLLBACK');
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
