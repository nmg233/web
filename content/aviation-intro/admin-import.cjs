// 不加载 app/config/database，避免触发初始化或迁移。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '../../backend');

function envFile(file) {
  try { return require('../../backend/node_modules/dotenv').parse(fs.readFileSync(file)); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function resolveDbPath(env = process.env, root = backend) {
  const value = env.DB_PATH || envFile(env.ENV_FILE || '/etc/pbl-platform/backend.env').DB_PATH
    || envFile(path.join(root, '.env')).DB_PATH || 'database/pbl_platform.db';
  return path.resolve(root, value);
}
function id(value, label) {
  if (value === undefined || value === '') return undefined;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(`${label} 必须是正整数`);
  return result;
}
function unique(rows, label) {
  if (rows.length > 1) throw new Error(`${label} 重名或重复，无法唯一确定，请指定 ID 或人工核查`);
  return rows[0];
}
function validate(payload) {
  assert.equal(payload.cards.length, 6);
  const questions = payload.cards.flatMap(c => c.exercises);
  assert.equal(questions.length, 15);
  assert.equal(questions.filter(q => q.question_type === 'single_choice').length, 8);
  assert.equal(questions.filter(q => q.question_type === 'fill_blank').length, 7);
  assert.equal(new Set(questions.map(q => q.source_id)).size, 15);
  assert.equal(new Set(payload.cards.map(c => c.title)).size, 6);
  for (const card of payload.cards) assert.equal(card.status, 'draft');
}
function sameCard(existing, expected) {
  for (const key of ['title', 'summary', 'content', 'key_points', 'common_mistakes', 'example_content', 'estimated_minutes']) {
    assert.deepEqual(existing[key] ?? null, expected[key] ?? null, `卡片冲突：${expected.title} / ${key}`);
  }
  assert.equal(existing.is_required, Number(expected.is_required !== false), `卡片必读设置冲突：${expected.title}`);
  if (existing.status === 'archived') throw new Error(`卡片已归档：${expected.title}`);
}
function sameExercise(existing, expected) {
  for (const key of ['question_type', 'prompt', 'explanation', 'points']) {
    assert.deepEqual(existing[key], expected[key], `题目冲突：${expected.source_id} / ${key}`);
  }
  assert.deepEqual(existing.options ?? JSON.parse(existing.options_json || '[]'), expected.options || [], `选项冲突：${expected.source_id}`);
  assert.deepEqual(existing.answer ?? JSON.parse(existing.answer_json), expected.answer, `答案冲突：${expected.source_id}`);
  assert.equal(existing.is_required, 1, `必答设置冲突：${expected.source_id}`);
  assert.equal(existing.max_attempts, 1, `作答次数冲突：${expected.source_id}`);
  if (existing.retired) throw new Error(`题目已退役：${expected.source_id}`);
}
function planCards(cards, payload) {
  return payload.cards.map(card => {
    const existing = unique(cards.filter(c => c.title === card.title), card.title);
    if (existing) sameCard(existing, card);
    const questions = card.exercises.map(question => {
      const saved = unique((existing?.exercises || []).filter(q => q.prompt === question.prompt), question.source_id);
      if (saved) sameExercise(saved, question);
      return { question, saved };
    });
    return { card, existing, questions };
  });
}
async function writeCards(plan, adapter) {
  const totals = { cards: { added: 0, skipped: 0 }, questions: { added: 0, skipped: 0 } };
  const cards = [];
  for (const { card, existing, questions } of plan) {
    const cardId = existing?.id ?? await adapter.card(card);
    totals.cards[existing ? 'skipped' : 'added']++;
    const exercises = [];
    for (const [index, { question, saved }] of questions.entries()) {
      const exerciseId = saved?.id ?? await adapter.exercise(cardId, question, index + 1);
      totals.questions[saved ? 'skipped' : 'added']++;
      exercises.push({ source_id: question.source_id, id: exerciseId });
    }
    cards.push({ title: card.title, id: cardId, exercises });
  }
  return { totals, cards };
}
function assertTarget(course, lesson) {
  if (!course || !lesson) throw new Error('指定的课程或课时不存在');
  if (lesson.course_id !== course.id) throw new Error('课时不属于指定课程');
  if (course.status === 'archived' || lesson.status === 'cancelled') throw new Error('不能向归档课程或取消课时导入');
}
async function backupDatabase(db, dbPath, Database) {
  const directory = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `pre-aviation-import-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.db`);
  const partial = `${target}.partial`;
  try {
    await db.backup(partial);
    const copy = new Database(partial, { readonly: true, fileMustExist: true });
    try { assert.deepEqual(copy.pragma('integrity_check'), [{ integrity_check: 'ok' }], '备份完整性校验失败'); }
    finally { copy.close(); }
    fs.renameSync(partial, target);
    return target;
  } catch (error) { fs.rmSync(partial, { force: true }); throw error; }
}
function insert(db, table, values) {
  const fields = Object.keys(values);
  return Number(db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...Object.values(values)).lastInsertRowid);
}
async function importDatabase(payload, env = process.env) {
  const Database = require('../../backend/node_modules/better-sqlite3');
  const database = resolveDbPath(env);
  const db = new Database(database, { fileMustExist: true });
  let transaction = false;
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 10000');
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version);
    const expected = fs.readdirSync(path.join(backend, 'database/migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).map(n => Number(n.split('_')[0])).sort((a,b) => a-b);
    assert.deepEqual(versions, expected, '请先通过正式部署完成现有迁移，本脚本不升级数据库');
    const adminId = id(env.PBL_IMPORT_ADMIN_ID, 'PBL_IMPORT_ADMIN_ID');
    if (!adminId && !env.PBL_IMPORT_ADMIN_USERNAME) throw new Error('数据库模式需提供 PBL_IMPORT_ADMIN_ID 或 PBL_IMPORT_ADMIN_USERNAME');
    const admin = adminId ? db.prepare('SELECT * FROM users WHERE id = ?').get(adminId)
      : db.prepare('SELECT * FROM users WHERE username = ?').get(env.PBL_IMPORT_ADMIN_USERNAME);
    if (!admin || admin.role !== 'admin' || !admin.is_active || admin.force_reset_password) throw new Error('需要已激活且完成首次改密的管理员');
    const backup = await backupDatabase(db, database, Database);
    // 获取写锁后重新匹配；并发数据库导入也不会重复写入。
    db.exec('BEGIN IMMEDIATE'); transaction = true;
    const courseId = id(env.PBL_IMPORT_COURSE_ID, 'PBL_IMPORT_COURSE_ID');
    const lessonId = id(env.PBL_IMPORT_LESSON_ID, 'PBL_IMPORT_LESSON_ID');
    let lesson = lessonId ? db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) : undefined;
    if (lessonId && !lesson) throw new Error('指定课时不存在');
    let course = courseId || lesson ? db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId || lesson.course_id)
      : unique(db.prepare('SELECT * FROM courses WHERE title = ?').all(payload.course.title), '课程');
    if (courseId && !course) throw new Error('指定课程不存在');
    if (!course) course = { ...payload.course, status: 'draft', id: insert(db, 'courses', { ...payload.course, status: 'draft', created_by: admin.id }) };
    if (!lesson) lesson = unique(db.prepare('SELECT * FROM lessons WHERE course_id = ? AND title = ?').all(course.id, payload.lesson.title), '课时');
    if (!lesson) lesson = { ...payload.lesson, course_id: course.id, id: insert(db, 'lessons', { ...payload.lesson, course_id: course.id }) };
    assertTarget(course, lesson);
    const cards = db.prepare('SELECT * FROM knowledge_cards WHERE lesson_id = ?').all(lesson.id);
    for (const card of cards) card.exercises = db.prepare('SELECT e.*, EXISTS(SELECT 1 FROM retired_exercises r WHERE r.exercise_id = e.id) AS retired FROM card_exercises e WHERE card_id = ?').all(card.id);
    const result = await writeCards(planCards(cards, payload), {
      card(card) { const { exercises, ...values } = card; return insert(db, 'knowledge_cards', { ...values, is_required: Number(values.is_required), lesson_id: lesson.id, created_by: admin.id }); },
      exercise(cardId, question, sortOrder) { const { source_id, options, answer, ...values } = question; return insert(db, 'card_exercises', { ...values, card_id: cardId, options_json: JSON.stringify(options || []), answer_json: JSON.stringify(answer), sort_order: sortOrder, is_required: 1, max_attempts: 1 }); },
    });
    db.exec('COMMIT'); transaction = false;
    return { mode: 'database', database, backup, course: { id: course.id, title: course.title }, lesson: { id: lesson.id, title: lesson.title }, ...result };
  } finally { if (transaction) db.exec('ROLLBACK'); db.close(); }
}
async function importApi(payload, env = process.env) {
  const url = new URL(env.PBL_IMPORT_API_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API URL 必须是无凭据、查询或片段的 HTTP(S) 地址');
  const base = url.href.replace(/\/$/, '');
  if (!env.PBL_IMPORT_ADMIN_TOKEN) throw new Error('API 模式需提供 PBL_IMPORT_ADMIN_TOKEN');
  const api = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${env.PBL_IMPORT_ADMIN_TOKEN}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${result.error || '请求失败'}；可修复后重新执行`);
    return result;
  };
  const { user } = await api('/auth/me');
  if (user.role !== 'admin' || user.force_reset_password) throw new Error('需要已完成首次改密的管理员 token');
  const courseId = id(env.PBL_IMPORT_COURSE_ID, 'PBL_IMPORT_COURSE_ID');
  const lessonId = id(env.PBL_IMPORT_LESSON_ID, 'PBL_IMPORT_LESSON_ID');
  const lessons = (await api('/learning/manage/lessons')).lessons;
  const selected = lessonId ? lessons.find(l => l.id === lessonId) : undefined;
  if (lessonId && !selected) throw new Error('指定课时不存在');
  let course;
  if (courseId || selected) course = (await api(`/courses/${courseId || selected.course_id}`)).course;
  else course = unique((await api('/courses')).courses.filter(c => c.title === payload.course.title), '课程');
  if (!course) course = { ...payload.course, status: 'draft', ...(await api('/courses', 'POST', payload.course)) };
  let lesson = selected || unique(lessons.filter(l => l.course_id === course.id && l.title === payload.lesson.title), '课时');
  if (selected && selected.course_id !== course.id) throw new Error('课时不属于指定课程');
  if (course.status === 'archived') throw new Error('不能向归档课程导入');
  if (!lesson) lesson = { ...payload.lesson, course_id: course.id, ...(await api(`/courses/${course.id}/lessons`, 'POST', payload.lesson)) };
  assertTarget(course, lesson);
  const managed = await api(`/learning/manage/lessons/${lesson.id}/cards`);
  if (managed.context.read_only) throw new Error('目标课时只读');
  // 管理卡片接口隐藏退役题目。无法核对隐藏记录时拒绝导入，防止重复插入。
  const listed = lessons.find(l => l.id === lesson.id);
  if (listed && Number(listed.exercise_count) !== managed.cards.filter(c => c.status !== 'archived').reduce((sum, c) => sum + c.exercises.length, 0)) {
    throw new Error('课时存在隐藏或退役题目，API 无法完整核对，请使用数据库模式');
  }
  const result = await writeCards(planCards(managed.cards, payload), {
    async card(card) { const { exercises, ...values } = card; return (await api(`/learning/manage/lessons/${lesson.id}/cards`, 'POST', values)).id; },
    async exercise(cardId, question, sortOrder) { const { source_id, ...values } = question; return (await api(`/learning/manage/cards/${cardId}/exercises`, 'POST', { ...values, sort_order: sortOrder, is_required: true, max_attempts: 1 })).id; },
  });
  return { mode: 'api', course: { id: course.id, title: course.title }, lesson: { id: lesson.id, title: lesson.title }, ...result };
}
async function run(env = process.env) {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson.json'), 'utf8'));
  validate(payload);
  const mode = env.PBL_IMPORT_MODE || 'database';
  if (!['database', 'api'].includes(mode)) throw new Error('PBL_IMPORT_MODE 只能为 database 或 api');
  return mode === 'api' ? importApi(payload, env) : importDatabase(payload, env);
}
if (require.main === module) run().then(result => {
  console.log(`导入完成：卡片新增 ${result.totals.cards.added}，跳过 ${result.totals.cards.skipped}；练习题新增 ${result.totals.questions.added}，跳过 ${result.totals.questions.skipped}`);
  console.log(JSON.stringify(result, null, 2));
}).catch(error => { console.error(`导入失败：${error.message}`); process.exitCode = 1; });
module.exports = { resolveDbPath, run, importDatabase, importApi };
