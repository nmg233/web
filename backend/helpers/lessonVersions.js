const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Migration bridges also execute this module against pre-publication schemas.
// Do not reference future columns/helpers until migration 1035 has run.
function hasPublication(db){return db.pragma('table_info(lessons)').some(c=>c.name==='publication_state');}

function usableVideo(replay) {
  if (!String(replay.description || '').trim() || !replay.file_path) return false;
  let descriptor;
  try {
    descriptor = fs.openSync(replay.file_path, 'r');
    if (!fs.fstatSync(descriptor).isFile()) return false;
    const bytes = Buffer.alloc(16);
    const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    const ext = path.extname(replay.file_path).toLowerCase();
    return (ext === '.mp4' && count >= 8 && bytes.toString('ascii', 4, 8) === 'ftyp')
      || (ext === '.webm' && count >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3);
  } catch { return false; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function validReference(exercise) {
  try {
    const answer = JSON.parse(exercise.answer_json);
    const options = JSON.parse(exercise.options_json || '[]');
    const nonempty = (v) => typeof v === 'string' && Boolean(v.trim());
    const values = options.map((o, i) => typeof o === 'object' && o ? o.value ?? o.key ?? String(i) : o);
    if (['single_choice','multiple_choice'].includes(exercise.question_type)) {
      if (values.length < 2 || values.length > 20 || new Set(values).size !== values.length || !values.every(nonempty)) return false;
      if (exercise.question_type === 'single_choice') return values.includes(answer);
      return Array.isArray(answer) && answer.length > 0 && new Set(answer).size === answer.length && answer.every((v) => values.includes(v));
    }
    if (exercise.question_type === 'true_false') return typeof answer === 'boolean';
    if (exercise.question_type === 'short_answer') return nonempty(answer);
    if (exercise.question_type === 'fill_blank') {
      if (answer?.blanks) return Array.isArray(answer.blanks) && answer.blanks.length > 0 && answer.blanks.length <= 20
        && answer.blanks.every((b) => Array.isArray(b) && b.length > 0 && b.every(nonempty));
      return Array.isArray(answer) ? answer.length > 0 && answer.every(nonempty) : nonempty(answer);
    }
    return false;
  } catch { return false; }
}

// 不依赖全局数据库，迁移器与运行时共用相同的快照格式。
function currentContent(db, lessonId) {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  const cards = db.prepare("SELECT * FROM knowledge_cards WHERE lesson_id = ? AND status = 'published' ORDER BY sort_order, id").all(lessonId);
  for (const card of cards) {
    card.exercises = db.prepare(`SELECT * FROM card_exercises WHERE card_id = ?
      AND NOT EXISTS (SELECT 1 FROM retired_exercises x WHERE x.exercise_id = card_exercises.id)
      ORDER BY sort_order, id`).all(card.id);
  }
  const replays = db.prepare(`SELECT id, course_id, lesson_id, title, description, summary, video_path AS file_path,
    duration_seconds, recording_date, sort_order FROM course_replays
    WHERE course_id = ? AND (lesson_id = ? OR lesson_id IS NULL) ORDER BY sort_order, id`).all(lesson.course_id, lessonId);
  const resources = db.prepare(`SELECT *
    FROM resources WHERE course_id = ? AND (lesson_id = ? OR lesson_id IS NULL) ORDER BY id`).all(lesson.course_id, lessonId);
  const experiments=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='course_experiments'").get()?db.prepare('SELECT * FROM course_experiments WHERE course_id=? AND lesson_id=? ORDER BY id').all(lesson.course_id,lessonId):[];
  const tasks=db.prepare('SELECT * FROM tasks WHERE lesson_id=? ORDER BY sort_order,id').all(lessonId);
  return { lesson: { ...lesson }, cards, replays, resources, experiments, tasks };
}

function hasAuthoredReview(lesson) {
  const blocks = (() => { try { const value = JSON.parse(lesson.article_blocks || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
  return Boolean(String(lesson.review_content || '').trim()
    || blocks.some((block) => (block.type === 'paragraph' && String(block.text || '').trim()) || (block.type === 'rich' && require('../services/articleHtml').plainText(block.html || '').trim()))
    || (String(lesson.article_title || '').trim() && /^https:\/\//.test(lesson.article_url || '')));
}

function readiness(db, lessonId, source = null) {
  const content = source || currentContent(db, lessonId);
  const issues = [];
  const lesson = content.lesson;
  if (lesson.content_state === 'preparing' && lesson.presentation_type !== 'visit') issues.push('教学内容尚未准备完成');
  // Article/text courses retain their supported review medium. Unconfigured traditional
  // lessons still require the upstream readable, lesson-specific video and introduction.
  if (!hasAuthoredReview(lesson) && !content.replays.some((replay) => replay.lesson_id === Number(lessonId) && usableVideo(replay))) {
    issues.push('至少为本课时绑定一个可读取的 MP4/WebM 视频并填写视频简介（课程共享视频不替代课时视频），或填写真实课堂回顾/文章');
  }
  if (lesson.presentation_type !== 'visit' && lesson.cards_required !== 0 && !content.cards.length) issues.push('至少发布一张知识卡片');
  for (const card of lesson.presentation_type === 'visit' || lesson.cards_required === 0 ? [] : content.cards) {
    if (!card.exercises.length) issues.push(`卡片「${card.title}」缺少配套习题`);
    for (const e of card.exercises) {
      if (!validReference(e) || !String(e.explanation || '').trim() || !String(e.prompt || '').trim()) {
        issues.push(`卡片「${card.title}」的习题缺少合法题目、答案或详解`);
      }
    }
  }
  return { ready: issues.length === 0, issues };
}

function saveVersion(db, lessonId, legacy = false) {
  const content = currentContent(db, lessonId);
  const encoded = JSON.stringify(content);
  const fingerprint = crypto.createHash('sha256').update(encoded).digest('hex');
  db.prepare(`INSERT OR IGNORE INTO lesson_content_versions (lesson_id, fingerprint, content_json, legacy_compat)
    VALUES (?, ?, ?, ?)`).run(lessonId, fingerprint, encoded, legacy ? 1 : 0);
  return db.prepare('SELECT * FROM lesson_content_versions WHERE lesson_id = ? AND fingerprint = ?').get(lessonId, fingerprint);
}

function withSupplement(db, row) {
  if (!row) return null;
  const content = JSON.parse(row.content_json);
  const legacyLessonFields = !Object.hasOwn(content.lesson, 'article_blocks');
  const hasSupplements = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lesson_version_supplements'").get();
  const supplement = hasSupplements ? db.prepare('SELECT * FROM lesson_version_supplements WHERE content_version_id=?').get(row.id) : null;
  if (supplement) {
    content.lesson = { ...JSON.parse(supplement.lesson_json), ...content.lesson };
    const resources = JSON.parse(supplement.resources_json || '[]');
    content.resources = content.resources.map((resource) => ({ ...resources.find((r) => r.id === resource.id), ...resource }));
  }
  return { ...row, content, legacy_lesson_fields: legacyLessonFields, supplement_source: supplement ? 'upgrade' : null };
}

function boundVersion(db, studentId, lessonId) {
  const row = db.prepare(`SELECT v.* FROM student_lesson_versions s JOIN lesson_content_versions v ON v.id = s.content_version_id
    WHERE s.student_id = ? AND s.lesson_id = ?`).get(studentId, lessonId);
  return withSupplement(db, row);
}

function bind(db, studentId, lessonId) {
  return db.transaction(() => {
    const existing = boundVersion(db, studentId, lessonId);
    if (existing) return existing;
    if(hasPublication(db))require('./lessonPublication').assertStudentOpen(db,lessonId);
    const formal=hasPublication(db)?db.prepare('SELECT published_version_id FROM lessons WHERE id=?').get(lessonId):null;
    const version = formal?.published_version_id ? db.prepare('SELECT * FROM lesson_content_versions WHERE id=?').get(formal.published_version_id) : saveVersion(db, lessonId);
    db.prepare('INSERT INTO student_lesson_versions (student_id, lesson_id, content_version_id) VALUES (?, ?, ?)').run(studentId, lessonId, version.id);
    return boundVersion(db, studentId, lessonId);
  }).immediate();
}

function studentCards(db, studentId, lessonId, contentVersionId = null) {
  const row = contentVersionId ? db.prepare('SELECT * FROM lesson_content_versions WHERE id = ? AND lesson_id = ?').get(contentVersionId,lessonId) : null;
  const version = row ? withSupplement(db, row) : boundVersion(db, studentId, lessonId);
  const formal=hasPublication(db)?require('./lessonPublication').formalContent(db,lessonId):null;
  const cards = version ? version.content.cards : (formal||currentContent(db, lessonId)).cards;
  return cards.map((card) => {
    const p = db.prepare('SELECT * FROM student_card_progress WHERE student_id = ? AND card_id = ?').get(studentId, card.id);
    const exercises = card.exercises.map((e) => {
      const attempt = db.prepare('SELECT * FROM card_exercise_attempts WHERE student_id = ? AND exercise_id = ? ORDER BY attempt_no DESC, id DESC LIMIT 1').get(studentId, e.id);
      const feedback = db.prepare('SELECT content, updated_at FROM exercise_feedback WHERE student_id = ? AND exercise_id = ?').get(studentId, e.id);
      return { ...e, attempt, feedback };
    });
    const graded = exercises.filter((e) => e.question_type !== 'short_answer');
    const total = graded.reduce((sum, e) => sum + e.points, 0);
    const earned = graded.reduce((sum, e) => sum + (e.attempt?.score || 0), 0);
    return { ...card, viewed_at: p?.viewed_at, completed_at: p?.completed_at && exercises.length && exercises.every((e) => e.attempt) ? p.completed_at : null,
      best_score: total ? Math.round(earned / total * 100) : null, exercises };
  });
}

function replacement(db, reportId) {
  if (!reportId || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_replacements'").get()) return null;
  return db.prepare('SELECT * FROM report_replacements WHERE report_id=?').get(reportId) || null;
}

function completionEvidence(db, studentId, lessonId) {
  const version = boundVersion(db, studentId, lessonId);
  const stored = db.prepare('SELECT completed_at FROM lesson_progress WHERE student_id=? AND lesson_id=?').get(studentId,lessonId);
  const report = db.prepare('SELECT * FROM lesson_learning_reports WHERE student_id=? AND lesson_id=? ORDER BY version DESC,id DESC LIMIT 1').get(studentId,lessonId);
  const needsRevision = Boolean(replacement(db,report?.id));
  const legacyCompleted = Boolean(version?.legacy_compat && stored?.completed_at && report?.status === 'approved' && !needsRevision);
  const reviewCompleted = Boolean(db.prepare('SELECT 1 FROM lesson_review_completions WHERE student_id=? AND lesson_id=?').get(studentId,lessonId));
  const cards = studentCards(db,studentId,lessonId);
  const cardsCompleted = cards.filter(c=>c.completed_at).length;
  const source = version?.content || (hasPublication(db) ? require('./lessonPublication').formalContent(db,lessonId) : null) || currentContent(db,lessonId);
  const cardsRequired = source.lesson.cards_required !== 0;
  const cardsDone = !cardsRequired || (cards.length > 0 && cardsCompleted === cards.length);
  const submitted = Boolean(report && ['submitted','approved'].includes(report.status) && !needsRevision);
  const approved = report?.status === 'approved' && !needsRevision;
  const completed = legacyCompleted || (reviewCompleted && cardsDone && approved);
  const percent = legacyCompleted ? 100 : (reviewCompleted ? 25 : 0) + (!cardsRequired ? (reviewCompleted ? 35 : 0) : cards.length ? Math.round(cardsCompleted/cards.length*35) : 0) + (submitted ? 25 : 0) + (approved ? 15 : 0);
  return { percent, review_completed:reviewCompleted, cards_total:cards.length, cards_completed:cardsCompleted,
    cards_required:cardsRequired, cards_done:cardsDone, cards_unlocked:reviewCompleted, report_unlocked:reviewCompleted && cardsDone,
    report_status:needsRevision ? 'rejected' : report?.status || null, resubmission_required:needsRevision,
    status:completed ? 'completed' : needsRevision || report?.status === 'rejected' ? 'revision'
      : submitted ? 'reviewing' : cardsDone ? 'reporting' : reviewCompleted ? 'learning' : 'reviewing_lesson', completed };
}

function courseState(db, studentId, courseId, persist = false) {
  const enrollment = db.prepare("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'").get(studentId, courseId);
  if (!enrollment) return { percent: 0, completed: false, completed_at: null, lesson_ids: [] };
  const closure = db.prepare('SELECT * FROM enrollment_completions WHERE enrollment_id = ?').get(enrollment.id);
  if (closure) return { percent: 100, completed: true, completed_at: closure.completed_at, lesson_ids: JSON.parse(closure.lesson_manifest_json) };
  const required=hasPublication(db)?require('./lessonPublication').requiredSql('l',studentId):"l.status!='cancelled'";
  const lessons = db.prepare(`SELECT l.id FROM lessons l WHERE l.course_id = ? AND ${required} ORDER BY l.sort_order, l.id`).all(courseId);
  const states = lessons.map((l) => completionEvidence(db,studentId,l.id));
  const allPassed = lessons.length > 0 && states.every((s) => s.completed);
  const lessonIds = lessons.map((l) => l.id);
  const temporarilyClosed=hasPublication(db)&&db.prepare(`SELECT 1 FROM lessons l WHERE course_id=? AND publication_state='closed' AND ${required} LIMIT 1`).get(courseId);
  const completed = allPassed && !temporarilyClosed;
  if (persist && completed && !temporarilyClosed) {
    db.prepare('INSERT OR IGNORE INTO enrollment_completions (enrollment_id, lesson_manifest_json) VALUES (?, ?)').run(enrollment.id, JSON.stringify(lessonIds));
    db.prepare('UPDATE enrollments SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?').run(enrollment.id);
  }
  return { percent: completed ? 100 : (states.length ? Math.round(states.reduce((sum, s) => sum + s.percent, 0) / states.length) : 0),
    completed, completed_at: completed ? db.prepare('SELECT completed_at FROM enrollment_completions WHERE enrollment_id = ?').get(enrollment.id)?.completed_at || null : null,
    lesson_ids: lessonIds };
}

// 必须在任何教学内容编辑之前执行一次，保留旧作答、报告、进度与答题次数。
function migrateLegacy(db) {
  const historyTables = ['lesson_progress', 'lesson_review_completions', 'lesson_learning_reports', 'student_card_progress', 'card_exercise_attempts'];
  const hasHistory = historyTables.some((name) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
    && db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n > 0);
  if (!hasHistory) return;
  const pairs = db.prepare(`SELECT student_id, lesson_id FROM lesson_progress
    UNION SELECT student_id, lesson_id FROM lesson_review_completions
    UNION SELECT student_id, lesson_id FROM lesson_learning_reports
    UNION SELECT p.student_id, c.lesson_id FROM student_card_progress p JOIN knowledge_cards c ON c.id = p.card_id
    UNION SELECT a.student_id, c.lesson_id FROM card_exercise_attempts a JOIN card_exercises e ON e.id = a.exercise_id JOIN knowledge_cards c ON c.id = e.card_id`).all();
  for (const p of pairs) {
    const v = saveVersion(db, p.lesson_id, true);
    db.prepare('INSERT OR IGNORE INTO student_lesson_versions (student_id, lesson_id, content_version_id) VALUES (?, ?, ?)').run(p.student_id, p.lesson_id, v.id);
  }
  db.exec(`INSERT OR IGNORE INTO report_content_versions (report_id, content_version_id)
    SELECT r.id, s.content_version_id FROM lesson_learning_reports r JOIN student_lesson_versions s
      ON s.student_id = r.student_id AND s.lesson_id = r.lesson_id`);
  for (const e of db.prepare("SELECT student_id, course_id FROM enrollments WHERE status = 'active'").all()) courseState(db, e.student_id, e.course_id, true);
}

function repairLegacy(db, actorId, studentId, lessonId, reason) {
  return db.transaction(() => {
    const old = boundVersion(db,studentId,lessonId);
    if (!old?.legacy_compat) throw Object.assign(new Error('仅允许修复历史兼容快照'), { status:409 });
    const enrollment = db.prepare(`SELECT e.id FROM enrollments e JOIN lessons l ON l.course_id = e.course_id
      WHERE e.student_id = ? AND l.id = ? AND e.status = 'active'`).get(studentId,lessonId);
    if (!enrollment || db.prepare('SELECT 1 FROM enrollment_completions WHERE enrollment_id = ?').get(enrollment.id)) throw Object.assign(new Error('报名不存在或已结课，不修改结课历史'), { status:409 });
    const ready = readiness(db,lessonId);
    if (!ready.ready) throw Object.assign(new Error('请先补齐当前教学内容：' + ready.issues.join('；')), { status:409 });
    const current = currentContent(db,lessonId);
    const content = JSON.parse(JSON.stringify(old.content));
    let changed = false;
    if (!content.cards.length) { content.cards = current.cards; changed = true; }
    for (const card of content.cards) {
      if (!card.exercises.length) {
        const fixed = current.cards.find((c) => c.id === card.id);
        if (!fixed?.exercises.length) throw Object.assign(new Error('请先为原卡片补齐习题并发布'), { status:409 });
        card.exercises = fixed.exercises; changed = true;
      }
    }
    if (!hasAuthoredReview(content.lesson) && !content.replays.some(usableVideo)) {
      if (hasAuthoredReview(current.lesson)) {
        // A real authored review is also a supported medium. Repair only missing
        // review fields, keeping the student's original cards, answers and prose.
        for (const field of ['review_content','article_url','article_title','article_blocks']) {
          content.lesson[field] = current.lesson[field];
        }
        const blocks = (() => { try { const value = JSON.parse(current.lesson.article_blocks || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
        const imageIds = new Set(blocks.flatMap(block => block.type === 'image' ? [block.resourceId] : block.type === 'rich' ? (block.resourceIds || []) : []));
        const oldIds = new Set(content.resources.map((resource) => resource.id));
        content.resources.push(...current.resources.filter((resource) => imageIds.has(resource.id) && !oldIds.has(resource.id)));
        changed = true;
      } else if (current.replays.some(usableVideo)) {
        content.replays = current.replays; changed = true;
      }
    }
    if (!changed) throw Object.assign(new Error('此兼容快照没有可定向补齐的缺失内容'), { status:409 });
    content.repair = { actor_id:actorId, reason, base_version_id:old.id };
    const encoded = JSON.stringify(content);
    const fingerprint = crypto.createHash('sha256').update(encoded).digest('hex');
    db.prepare('INSERT OR IGNORE INTO lesson_content_versions (lesson_id,fingerprint,content_json,legacy_compat) VALUES (?,?,?,1)').run(lessonId,fingerprint,encoded);
    const fixed = db.prepare('SELECT id FROM lesson_content_versions WHERE lesson_id = ? AND fingerprint = ?').get(lessonId,fingerprint);
    db.prepare('UPDATE student_lesson_versions SET content_version_id = ? WHERE student_id = ? AND lesson_id = ?').run(fixed.id,studentId,lessonId);
    db.prepare('INSERT INTO lesson_version_repairs (student_id,lesson_id,old_version_id,new_version_id,actor_id,reason) VALUES (?,?,?,?,?,?)').run(studentId,lessonId,old.id,fixed.id,actorId,reason);
    const report = db.prepare('SELECT id FROM lesson_learning_reports WHERE student_id=? AND lesson_id=? ORDER BY version DESC,id DESC LIMIT 1').get(studentId,lessonId);
    if (report) db.prepare(`INSERT INTO report_replacements(report_id,content_version_id,actor_id,reason) VALUES(?,?,?,?)
      ON CONFLICT(report_id) DO UPDATE SET content_version_id=excluded.content_version_id,actor_id=excluded.actor_id,reason=excluded.reason`)
      .run(report.id,fixed.id,actorId,reason);
    return { old_version_id:old.id, new_version_id:fixed.id };
  }).immediate();
}

module.exports = { currentContent, readiness, saveVersion, boundVersion, bind, studentCards, courseState, migrateLegacy, repairLegacy, completionEvidence, replacement };
