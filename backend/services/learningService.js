const db = require('../config/database');
const { courseBelongsToMentor } = require('../helpers/courseScope');
const learningGate = require('../helpers/learningGate');
const notificationService = require('./notificationService');

const versions = require('../helpers/lessonVersions');

const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer'];

class LearningError extends Error {
  constructor(message, status = 400, code = 'LEARNING_INVALID') {
    super(message);
    this.name = 'LearningError';
    this.status = status;
    this.code = code;
  }
}

function text(value, max, required = false) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new LearningError('请填写所有必填内容');
  if (result.length > max) throw new LearningError(`内容不能超过 ${max} 个字符`);
  return result || null;
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new LearningError('数字字段格式不正确');
  }
  return result;
}

function jsonValue(value, label, maxLength = 10000) {
  const result = value;
  const encoded = JSON.stringify(result);
  if (encoded === undefined || encoded.length > maxLength) throw new LearningError(`${label}格式不正确`);
  return { value: result, encoded };
}

function parseStoredJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function lessonContext(lessonId) {
  const row = db.prepare(`
    SELECT l.*, c.id AS course_id, c.title AS course_title, c.status AS course_status,
           c.created_by AS course_created_by
    FROM lessons l JOIN courses c ON c.id = l.course_id
    WHERE l.id = ?
  `).get(lessonId);
  if (!row) throw new LearningError('课时不存在', 404, 'LESSON_NOT_FOUND');
  return row;
}

function studentEnrollment(studentId, lessonId) {
  return db.prepare(`
    SELECT e.id AS enrollment_id, e.course_id, c.title AS course_title,
           l.id AS lesson_id, l.title AS lesson_title
    FROM lessons l
    JOIN courses c ON c.id = l.course_id AND c.status = 'published'
    JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
    WHERE l.id = ? AND l.status != 'cancelled'
  `).get(studentId, lessonId);
}

function assertStudentLesson(studentId, lessonId) {
  const enrollment = studentEnrollment(studentId, lessonId);
  if (!enrollment) throw new LearningError('课时不存在或尚未报名', 404, 'LESSON_NOT_AVAILABLE');
  return enrollment;
}

function assertManageLesson(user, lessonId) {
  const lesson = lessonContext(lessonId);
  if (user.role !== 'admin'
      && (user.role !== 'academic_mentor' || !courseBelongsToMentor(user.id, lesson.course_id))) {
    throw new LearningError('无权管理该课时', 403, 'LESSON_FORBIDDEN');
  }
  return lesson;
}

function assertWritableLesson(user, lessonId) {
  if (user.role !== 'admin') {
    throw new LearningError('仅管理员可编辑知识卡片和练习', 403, 'LEARNING_CONTENT_READ_ONLY');
  }
  const lesson = assertManageLesson(user, lessonId);
  if (lesson.course_status === 'archived') {
    throw new LearningError('已归档课程不能修改学习内容', 409, 'COURSE_ARCHIVED');
  }
  if (lesson.status === 'cancelled') throw new LearningError('已取消课时只允许查看历史', 409, 'LESSON_CANCELLED');
  return lesson;
}

function assertManageCard(user, cardId, writable = false) {
  const card = db.prepare(`
    SELECT c.*, l.course_id FROM knowledge_cards c
    JOIN lessons l ON l.id = c.lesson_id WHERE c.id = ?
  `).get(cardId);
  if (!card) throw new LearningError('知识卡片不存在', 404, 'CARD_NOT_FOUND');
  (writable ? assertWritableLesson : assertManageLesson)(user, card.lesson_id);
  return card;
}

function assertManageExercise(user, exerciseId, writable = false) {
  const exercise = db.prepare(`
    SELECT e.*, c.lesson_id FROM card_exercises e
    JOIN knowledge_cards c ON c.id = e.card_id WHERE e.id = ?
  `).get(exerciseId);
  if (!exercise) throw new LearningError('练习不存在', 404, 'EXERCISE_NOT_FOUND');
  (writable ? assertWritableLesson : assertManageLesson)(user, exercise.lesson_id);
  return exercise;
}

function lessonPackage(studentId, lessonId) {
  const enrollment = assertStudentLesson(studentId, lessonId);
  const lesson = lessonContext(lessonId);
  let version = versions.boundVersion(db, studentId, lessonId);
  if (!version) {
    const ready = versions.readiness(db, lessonId);
    if (!ready.ready) throw new LearningError(`课后学习尚未开放：${ready.issues.join('；')}`, 409, 'LESSON_CONTENT_INCOMPLETE');
    const closure = versions.courseState(db, studentId, lesson.course_id);
    if (closure.completed && !closure.lesson_ids.includes(Number(lessonId))) {
      throw new LearningError('该新增课时不属于你的已结课学习范围', 409, 'COURSE_ALREADY_COMPLETED');
    }
    version = versions.bind(db, studentId, lessonId);
  }
  const cards = versions.studentCards(db, studentId, lessonId);
  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT w.id FROM works w WHERE w.student_id = ? AND w.task_id = t.id
       ORDER BY w.version DESC, w.id DESC LIMIT 1) AS work_id,
      (SELECT w.review_status FROM works w WHERE w.student_id = ? AND w.task_id = t.id
       ORDER BY w.version DESC, w.id DESC LIMIT 1) AS work_status
    FROM tasks t WHERE t.lesson_id = ? AND t.status = 'active'
    ORDER BY t.sort_order, t.id
  `).all(studentId, studentId, lessonId);
  const originalReport = learningGate.latestReport(studentId, lessonId);
  const repair = versions.replacement(db,originalReport?.id);
  const report = repair ? { ...originalReport, original_status:originalReport.status, status:'rejected',
    resubmission_required:true, review_comment:'历史内容已补齐，请完成补学后重新提交新版报告。' } : originalReport;
  const reflection = report ? db.prepare('SELECT * FROM reflections WHERE report_id = ?').get(report.id) || null : null;
  const replays = version.content.replays.map(({ file_path, ...r }) => r);
  const resources = version.content.resources.map(({ file_path, ...r }) => ({
    ...r, has_file: Boolean(file_path), download_name: file_path ? require('path').basename(file_path) : null,
  }));

  return {
    course: { id: lesson.course_id, title: lesson.course_title },
    lesson: {
      id: lesson.id, title: lesson.title, description: lesson.description,
      duration: lesson.duration, start_at: lesson.start_at, end_at: lesson.end_at,
    },
    enrollment_id: enrollment.enrollment_id,
    content_version: { id: version.id, legacy_compat: Boolean(version.legacy_compat), repair: version.content.repair || null },
    course_completion: versions.courseState(db, studentId, lesson.course_id),
    replays,
    resources,
    cards: cards.map((card) => ({
      ...card,
      required: Boolean(card.is_required),
      completed: Boolean(card.completed_at),
      exercises: card.exercises.map(({ attempt, feedback, answer_json, options_json, ...e }) => ({
        ...e, options: parseStoredJson(options_json, []), attempted: Boolean(attempt),
        attempts: attempt?.attempt_no || 0, passed: attempt?.is_correct === 1,
        best_score: attempt?.score || 0, student_answer: attempt ? parseStoredJson(attempt.answer_json) : null,
        auto_graded: e.question_type !== 'short_answer',
        blank_count: parseStoredJson(answer_json)?.blanks?.length || 0,
        correct_answer: attempt ? parseStoredJson(answer_json) : null,
        explanation: attempt ? e.explanation : null, feedback: feedback || null,
      })),
    })),
    consolidation_tasks: tasks,
    report,
    reflection,
    progress: learningGate.recalculateLessonProgress(studentId, lessonId),
  };
}

// 独立只读内容包：不调用学生学习包，避免重算进度或返回作答历史。
function previewLesson(user, lessonId) {
  if (!['admin', 'academic_mentor', 'teacher'].includes(user.role)) {
    throw new LearningError('无权预览该课时', 403, 'LESSON_FORBIDDEN');
  }
  const lesson = lessonContext(lessonId);
  if (user.role === 'academic_mentor' && !courseBelongsToMentor(user.id, lesson.course_id)) {
    throw new LearningError('无权预览该课时', 403, 'LESSON_FORBIDDEN');
  }
  if (user.role === 'teacher' && !db.prepare(`
    SELECT 1 FROM enrollments e JOIN users s ON s.id = e.student_id
    WHERE e.course_id = ? AND e.status = 'active'
      AND s.teacher_id = ? AND s.role = 'student'
      AND s.is_active = 1 AND s.archived_at IS NULL LIMIT 1
  `).get(lesson.course_id, user.id)) {
    throw new LearningError('无权预览该课时', 403, 'LESSON_FORBIDDEN');
  }
  const cards = db.prepare(`
    SELECT id, lesson_id, title, summary, content, key_points, common_mistakes,
           example_content, sort_order, is_required, estimated_minutes, status
    FROM knowledge_cards WHERE lesson_id = ? AND status = 'published'
    ORDER BY sort_order, id
  `).all(lessonId);
  // 显式选择可公开字段，答案和解析不进入预览数据。
  const exercises = db.prepare(`
    SELECT e.id, e.card_id, e.question_type, e.prompt, e.options_json,
           e.points, e.sort_order, e.is_required, e.max_attempts
    FROM card_exercises e JOIN knowledge_cards c ON c.id = e.card_id
    WHERE c.lesson_id = ? AND c.status = 'published' ORDER BY e.sort_order, e.id
  `).all(lessonId);
  return {
    read_only: true,
    course: { id: lesson.course_id, title: lesson.course_title },
    lesson: {
      id: lesson.id, title: lesson.title, description: lesson.description,
      duration: lesson.duration, start_at: lesson.start_at, end_at: lesson.end_at,
    },
    cards: cards.map((card) => ({
      ...card,
      required: Boolean(card.is_required),
      exercises: exercises.filter((exercise) => exercise.card_id === card.id).map(({ options_json, ...exercise }) => ({
        ...exercise, options: parseStoredJson(options_json, []),
      })),
    })),
  };
}

function completeReview(studentId, lessonId) {
  assertStudentLesson(studentId, lessonId);
  requireStarted(studentId, lessonId);
  db.prepare(`
    INSERT INTO lesson_review_completions (student_id, lesson_id, completed_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, lesson_id) DO UPDATE SET
      completed_at = COALESCE(lesson_review_completions.completed_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, lessonId);
  return learningGate.recalculateLessonProgress(studentId, lessonId);
}

function answersEqual(type, actual, expected) {
  if (type === 'multiple_choice') {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    return JSON.stringify([...new Set(actual.map(String))].sort())
      === JSON.stringify([...new Set(expected.map(String))].sort());
  }
  if (type === 'true_false') {
    const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';
    return normalizeBoolean(actual) === normalizeBoolean(expected);
  }
  const normalize = (value) => String(value ?? '').trim();
  if (type === 'fill_blank' && expected?.blanks) {
    return Array.isArray(actual) && actual.length === expected.blanks.length
      && expected.blanks.every((accepted, i) => accepted.some((s) => normalize(s) === normalize(actual[i])));
  }
  if (Array.isArray(expected)) return expected.some((item) => normalize(item) === normalize(actual));
  return normalize(actual) === normalize(expected);
}

function requireStarted(studentId, lessonId) {
  const version = versions.boundVersion(db, studentId, lessonId);
  if (!version) throw new LearningError('请先进入本课时学习总界面', 409, 'LESSON_NOT_STARTED');
  return version;
}

function assertCardOrder(studentId, lessonId, cardId) {
  const cards = versions.studentCards(db, studentId, lessonId);
  const index = cards.findIndex((c) => c.id === Number(cardId));
  if (index < 0) throw new LearningError('知识卡片不属于当前学习版本', 404);
  if (cards.slice(0, index).some((c) => !c.completed_at)) throw new LearningError('请按顺序完成前面的知识卡片', 409, 'CARD_ORDER_REQUIRED');
  return cards[index];
}

// 创建题目与学生提交使用同一套类型/选项校验，避免把无效选项当成错误答案消耗机会。
function validateAnswer(type, options, answer, reference = false, expected = null) {
  const values = options.map((o, i) => typeof o === 'object' && o !== null ? (o.value ?? o.key ?? String(i)) : o);
  if (type === 'single_choice' && !values.includes(answer)) throw new LearningError('单选题答案必须是有效选项');
  if (type === 'multiple_choice' && (!Array.isArray(answer) || !answer.length || new Set(answer).size !== answer.length || answer.some((v) => !values.includes(v)))) {
    throw new LearningError('多选题答案必须是不重复的有效选项');
  }
  if (type === 'true_false' && typeof answer !== 'boolean') throw new LearningError('判断题答案必须是 true 或 false');
  if (type === 'short_answer' && (typeof answer !== 'string' || !answer.trim())) throw new LearningError('请填写简答题内容');
  if (type === 'fill_blank') {
    if (reference) {
      const groups = answer?.blanks || (Array.isArray(answer) ? [answer] : [[answer]]);
      if (!Array.isArray(groups) || !groups.length || groups.length > 20
        || groups.some((g) => !Array.isArray(g) || !g.length || g.some((s) => typeof s !== 'string' || !s.trim()))) {
        throw new LearningError('每个空需要至少一个非空的可接受答案');
      }
    } else if (expected?.blanks) {
      if (!Array.isArray(answer) || answer.length !== expected.blanks.length || answer.some((s) => typeof s !== 'string' || !s.trim())) throw new LearningError('请填写每个空的答案');
    } else if (typeof answer !== 'string' || !answer.trim()) throw new LearningError('请填写答案');
  }
}

function submitExercise(studentId, exerciseId, answer) {
  const current = db.prepare(`
    SELECT e.*, c.lesson_id, c.status AS card_status
    FROM card_exercises e JOIN knowledge_cards c ON c.id = e.card_id
    WHERE e.id = ?
  `).get(exerciseId);
  if (!current) {
    throw new LearningError('练习不存在', 404, 'EXERCISE_NOT_FOUND');
  }
  assertStudentLesson(studentId, current.lesson_id);
  requireStarted(studentId, current.lesson_id);
  const card = assertCardOrder(studentId, current.lesson_id, current.card_id);
  const exercise = card.exercises.find((e) => e.id === Number(exerciseId));
  if (!exercise) throw new LearningError('练习不属于当前学习版本', 404);
  exercise.lesson_id = current.lesson_id;
  if (!learningGate.isReviewCompleted(studentId, exercise.lesson_id)) {
    throw new LearningError('请先完成课堂回顾', 409, 'LESSON_REVIEW_REQUIRED');
  }
  const submitted = jsonValue(answer, '答案', 4000);
  if (submitted.value === null || submitted.value === undefined || submitted.value === ''
      || (Array.isArray(submitted.value) && submitted.value.length === 0)) {
    throw new LearningError('请选择或填写答案');
  }
  if (exercise.question_type === 'multiple_choice' && !Array.isArray(submitted.value)) {
    throw new LearningError('多选题答案必须是数组');
  }
  validateAnswer(exercise.question_type, parseStoredJson(exercise.options_json, []), submitted.value, false, parseStoredJson(exercise.answer_json));
  const attemptCount = db.prepare(
    'SELECT COUNT(*) AS count FROM card_exercise_attempts WHERE student_id = ? AND exercise_id = ?'
  ).get(studentId, exercise.id).count;
  if (attemptCount >= 1) {
    throw new LearningError('每道题只有一次作答机会', 409, 'MAX_ATTEMPTS_REACHED');
  }
  const expected = parseStoredJson(exercise.answer_json);
  const correct = exercise.question_type === 'short_answer' ? null : answersEqual(exercise.question_type, submitted.value, expected);
  const attemptNo = attemptCount + 1;
  const score = correct ? exercise.points : 0;
  let cardCompleted;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO card_exercise_attempts
        (student_id, exercise_id, answer_json, is_correct, score, attempt_no)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, exercise.id, submitted.encoded, correct === null ? null : correct ? 1 : 0, score, attemptNo);
    const state = versions.studentCards(db, studentId, current.lesson_id).find((c) => c.id === current.card_id);
    db.prepare(`INSERT INTO student_card_progress (student_id, card_id, best_score) VALUES (?, ?, ?)
      ON CONFLICT(student_id, card_id) DO UPDATE SET best_score = excluded.best_score, updated_at = CURRENT_TIMESTAMP`)
      .run(studentId, current.card_id, state.best_score ?? 0);
    cardCompleted = state.exercises.every((e) => e.attempt);
  })();
  const progress = learningGate.recalculateLessonProgress(studentId, exercise.lesson_id);
  return {
    correct,
    score,
    explanation: exercise.explanation || null,
    correct_answer: expected,
    attempt_no: attemptNo,
    card_completed: cardCompleted,
    lesson_progress: progress.percent,
  };
}

function completeCard(studentId, cardId) {
  const card = db.prepare('SELECT id, lesson_id, status FROM knowledge_cards WHERE id = ?').get(cardId);
  if (!card) throw new LearningError('知识卡片不存在', 404, 'CARD_NOT_FOUND');
  assertStudentLesson(studentId, card.lesson_id);
  requireStarted(studentId, card.lesson_id);
  const snapshot = assertCardOrder(studentId, card.lesson_id, cardId);
  if (!learningGate.isReviewCompleted(studentId, card.lesson_id)) {
    throw new LearningError('请先完成课堂回顾', 409, 'LESSON_REVIEW_REQUIRED');
  }
  if (!snapshot.exercises.length || !snapshot.exercises.every((e) => e.attempt)) {
    throw new LearningError('请先作答本卡片的全部练习', 409, 'CARD_EXERCISES_REQUIRED');
  }
  db.prepare(`
    INSERT INTO student_card_progress (student_id, card_id, viewed_at, completed_at, best_score, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, card_id) DO UPDATE SET
      viewed_at = COALESCE(student_card_progress.viewed_at, CURRENT_TIMESTAMP),
      completed_at = COALESCE(student_card_progress.completed_at, CURRENT_TIMESTAMP),
      best_score = excluded.best_score, updated_at = CURRENT_TIMESTAMP
  `).run(studentId, card.id, snapshot.best_score ?? 0);
  return learningGate.recalculateLessonProgress(studentId, card.lesson_id);
}

function validateReport(data) {
  const report = data?.report || {};
  const reflection = data?.reflection || {};
  return {
    report: {
      summary: text(report.summary, 5000, true),
      key_points: text(report.key_points, 5000),
      application: text(report.application, 5000),
      difficulties: text(report.difficulties, 5000),
      next_plan: text(report.next_plan, 5000),
    },
    reflection: {
      difficulty: text(reflection.difficulty, 2000, true),
      solution: text(reflection.solution, 2000),
      improvement: text(reflection.improvement, 2000),
      new_question: text(reflection.new_question, 2000),
    },
  };
}

function submitReport(studentId, lessonId, data) {
  const enrollment = assertStudentLesson(studentId, lessonId);
  requireStarted(studentId, lessonId);
  if (!learningGate.canSubmitLessonReport(studentId, lessonId)) {
    throw new LearningError('请先完成课堂回顾、全部知识卡片和配套练习', 409, 'REPORT_LOCKED');
  }
  const payload = validateReport(data);
  let version;
  const reportId = db.transaction(() => {
    // 取得写锁后核实当前版本，避免重复请求或旧页面基于过期版本提交。
    const previous = learningGate.latestReport(studentId, lessonId);
    if (previous && previous.status !== 'rejected' && !versions.replacement(db,previous.id)) {
      throw new LearningError('当前报告已提交或通过，不能覆盖', 409, 'REPORT_IMMUTABLE');
    }
    if (data.base_report_id !== undefined && data.base_report_id !== (previous?.id ?? null)) {
      throw new LearningError('报告版本已更新，请刷新页面后根据最新意见修改', 409, 'REPORT_VERSION_CHANGED');
    }
    version = previous ? previous.version + 1 : 1;
    const parentId = previous ? previous.id : null;
    const result = db.prepare(`
      INSERT INTO lesson_learning_reports (
        student_id, lesson_id, enrollment_id, summary, key_points, application,
        difficulties, next_plan, status, parent_report_id, version, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      studentId, lessonId, enrollment.enrollment_id, payload.report.summary,
      payload.report.key_points, payload.report.application, payload.report.difficulties,
      payload.report.next_plan, parentId, version,
    );
    const id = Number(result.lastInsertRowid);
    if (previous) db.prepare('UPDATE report_replacements SET replacement_report_id=? WHERE report_id=?').run(id,previous.id);
    db.prepare('INSERT INTO report_content_versions (report_id, content_version_id) VALUES (?, ?)').run(id, requireStarted(studentId,lessonId).id);
    db.prepare(`
      INSERT INTO reflections (
        student_id, enrollment_id, lesson_id, report_id,
        difficulty, solution, improvement, new_question
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId, enrollment.enrollment_id, lessonId, id,
      payload.reflection.difficulty, payload.reflection.solution,
      payload.reflection.improvement, payload.reflection.new_question,
    );
    learningGate.recalculateLessonProgress(studentId, lessonId);
  const context = lessonContext(lessonId);
  notificationService.safeCreateForUsers({
    eventKey: 'lesson.report_submitted',
    dedupeKey: `lesson.report_submitted:${id}`,
    title: '收到新的学习报告',
    summary: `${context.course_title} · ${context.title}`,
    content: `学生提交了第 ${version} 版课时学习报告，请及时评审。`,
    category: 'course', level: 'important',
    actionUrl: `/mentor/reviews/${id}`,
    businessType: 'lesson_report', businessId: id,
    createdBy: studentId,
  }, [...new Set([context.course_created_by, context.instructor_id].filter(Boolean))]);
    return id;
  }).immediate();

  return db.prepare('SELECT * FROM lesson_learning_reports WHERE id = ?').get(reportId);
}

function listManagedCards(user, lessonId) {
  assertManageLesson(user, lessonId);
  const cards = db.prepare('SELECT * FROM knowledge_cards WHERE lesson_id = ? ORDER BY sort_order, id').all(lessonId);
  if (!cards.length) return [];
  const ids = cards.map((item) => item.id);
  const exercises = db.prepare(`SELECT * FROM card_exercises WHERE NOT EXISTS (SELECT 1 FROM retired_exercises x WHERE x.exercise_id = card_exercises.id) AND card_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`).all(...ids);
  return cards.map((card) => ({
    ...card,
    exercises: exercises.filter((item) => item.card_id === card.id).map((item) => ({
      ...item,
      options: parseStoredJson(item.options_json, []),
      answer_json: user.role === 'admin' ? item.answer_json : undefined,
      answer: user.role === 'admin' ? parseStoredJson(item.answer_json) : undefined,
      explanation: user.role === 'admin' ? item.explanation : undefined,
    })),
  }));
}

function listManagedLessons(user) {
  const where = user.role === 'admin'
    ? '1 = 1'
    : '(c.created_by = ? OR EXISTS (SELECT 1 FROM lessons scope_l WHERE scope_l.course_id = c.id AND scope_l.instructor_id = ?))';
  const params = user.role === 'admin' ? [] : [user.id, user.id];
  return db.prepare(`
    SELECT l.id, l.course_id, l.title, l.status, l.sort_order, l.start_at,
           c.title AS course_title, c.status AS course_status,
           COUNT(DISTINCT kc.id) AS card_count,
           COUNT(DISTINCT CASE WHEN kc.status = 'published' THEN kc.id END) AS published_card_count,
           COUNT(DISTINCT ce.id) AS exercise_count
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    LEFT JOIN knowledge_cards kc ON kc.lesson_id = l.id AND kc.status != 'archived'
    LEFT JOIN card_exercises ce ON ce.card_id = kc.id AND NOT EXISTS (SELECT 1 FROM retired_exercises x WHERE x.exercise_id=ce.id)
    WHERE ${where}
    GROUP BY l.id, c.id
    ORDER BY CASE c.status WHEN 'published' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
             c.updated_at DESC, l.sort_order, l.id
  `).all(...params).map((l) => ({ ...l, readiness: versions.readiness(db, l.id) }));
}

function cardPayload(data) {
  const status = data.status || 'draft';
  if (!['draft', 'published', 'archived'].includes(status)) throw new LearningError('无效的卡片状态');
  return {
    title: text(data.title, 200, true),
    summary: text(data.summary, 1000),
    content: text(data.content, 20000, true),
    key_points: text(data.key_points, 10000),
    common_mistakes: text(data.common_mistakes, 10000),
    example_content: text(data.example_content, 10000),
    sort_order: integer(data.sort_order, { min: 0, max: 10000, fallback: 0 }),
    is_required: data.is_required === false || data.is_required === 0 ? 0 : 1,
    estimated_minutes: integer(data.estimated_minutes, { min: 1, max: 600 }),
    status,
  };
}

function createCard(user, lessonId, data) {
  assertWritableLesson(user, lessonId);
  const value = cardPayload(data);
  if (data.sort_order === undefined) {
    value.sort_order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM knowledge_cards WHERE lesson_id = ?').get(lessonId).value || 0) + 1;
  }
  const result = db.prepare(`
    INSERT INTO knowledge_cards (
      lesson_id, title, summary, content, key_points, common_mistakes,
      example_content, sort_order, is_required, estimated_minutes, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lessonId, value.title, value.summary, value.content, value.key_points,
    value.common_mistakes, value.example_content, value.sort_order, value.is_required,
    value.estimated_minutes, value.status, user.id);
  return { id: Number(result.lastInsertRowid) };
}

function updateCard(user, cardId, data) {
  const current = assertManageCard(user, cardId, true);
  const value = cardPayload({ ...current, ...data });
  db.prepare(`
    UPDATE knowledge_cards SET title = ?, summary = ?, content = ?, key_points = ?,
      common_mistakes = ?, example_content = ?, sort_order = ?, is_required = ?,
      estimated_minutes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(value.title, value.summary, value.content, value.key_points, value.common_mistakes,
    value.example_content, value.sort_order, value.is_required, value.estimated_minutes,
    value.status, current.id);
  return { id: current.id };
}

function deleteCard(user, cardId) {
  const card = assertManageCard(user, cardId, true);
  const hasProgress = db.prepare('SELECT 1 FROM student_card_progress WHERE card_id = ? LIMIT 1').get(card.id)
    || db.prepare(`SELECT 1 FROM card_exercise_attempts a JOIN card_exercises e ON e.id = a.exercise_id WHERE e.card_id = ? LIMIT 1`).get(card.id);
  if (hasProgress || db.prepare('SELECT 1 FROM card_exercises WHERE card_id = ? LIMIT 1').get(card.id) || db.prepare('SELECT 1 FROM lesson_content_versions WHERE lesson_id = ? LIMIT 1').get(card.lesson_id)) {
    db.prepare("UPDATE knowledge_cards SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(card.id);
    return { id: card.id, archived: true };
  }
  db.prepare('DELETE FROM knowledge_cards WHERE id = ?').run(card.id);
  return { id: card.id, deleted: true };
}

function exercisePayload(data) {
  if (!QUESTION_TYPES.includes(data.question_type)) throw new LearningError('无效的练习题型');
  const options = data.options === undefined && data.options_json !== undefined
    ? parseStoredJson(data.options_json, data.options_json)
    : (data.options ?? []);
  const answer = data.answer === undefined && data.answer_json !== undefined
    ? parseStoredJson(data.answer_json, data.answer_json)
    : data.answer;
  const optionJson = jsonValue(options, '选项');
  const answerJson = jsonValue(answer, '标准答案');
  if (!Array.isArray(options)) throw new LearningError('选项必须是数组');
  if (['single_choice', 'multiple_choice'].includes(data.question_type)) {
    const values = options.map((o, i) => typeof o === 'object' && o !== null ? (o.value ?? o.key ?? String(i)) : o);
    if (values.some((v) => typeof v !== 'string' || !v.trim()) || new Set(values).size !== values.length
      || options.some((o) => typeof o === 'object' && (!o || !String(o.label ?? o.text ?? '').trim()))) throw new LearningError('选项不能为空或重复');
  }
  validateAnswer(data.question_type, options, answer, true);
  if (['single_choice', 'multiple_choice'].includes(data.question_type)
      && (!Array.isArray(optionJson.value) || optionJson.value.length < 2 || optionJson.value.length > 20)) {
    throw new LearningError('选择题需要 2–20 个选项');
  }
  return {
    question_type: data.question_type,
    prompt: text(data.prompt, 5000, true),
    options_json: optionJson.encoded,
    answer_json: answerJson.encoded,
    explanation: text(data.explanation, 5000, true),
    points: integer(data.points, { min: 1, max: 100, fallback: 1 }),
    sort_order: integer(data.sort_order, { min: 0, max: 10000, fallback: 0 }),
    is_required: data.is_required === false || data.is_required === 0 ? 0 : 1,
    max_attempts: 1,
  };
}

function createExercise(user, cardId, data) {
  const card = assertManageCard(user, cardId, true);
  const value = exercisePayload(data);
  if (data.sort_order === undefined) {
    value.sort_order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM card_exercises WHERE card_id = ?').get(card.id).value || 0) + 1;
  }
  const result = db.prepare(`
    INSERT INTO card_exercises (
      card_id, question_type, prompt, options_json, answer_json, explanation,
      points, sort_order, is_required, max_attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(card.id, value.question_type, value.prompt, value.options_json, value.answer_json,
    value.explanation, value.points, value.sort_order, value.is_required, value.max_attempts);
  return { id: Number(result.lastInsertRowid) };
}

function updateExercise(user, exerciseId, data) {
  const current = assertManageExercise(user, exerciseId, true);
  const value = exercisePayload({
    ...current,
    options: parseStoredJson(current.options_json, []),
    answer: parseStoredJson(current.answer_json),
    ...data,
  });
  db.prepare(`
    UPDATE card_exercises SET question_type = ?, prompt = ?, options_json = ?,
      answer_json = ?, explanation = ?, points = ?, sort_order = ?, is_required = ?,
      max_attempts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(value.question_type, value.prompt, value.options_json, value.answer_json,
    value.explanation, value.points, value.sort_order, value.is_required,
    value.max_attempts, current.id);
  return { id: current.id };
}

function deleteExercise(user, exerciseId) {
  const exercise = assertManageExercise(user, exerciseId, true);
  // 题库逻辑删除，旧版本仍引用同一题号且唯一作答机会不增加。
  db.prepare('INSERT OR IGNORE INTO retired_exercises (exercise_id) VALUES (?)').run(exercise.id);
  return { id: exercise.id };
}

function reorderCards(user, lessonId, cardIds) {
  assertWritableLesson(user, lessonId);
  if (!Array.isArray(cardIds) || cardIds.length > 200) throw new LearningError('排序数据格式不正确');
  const ids = cardIds.map((id) => integer(id, { min: 1 }));
  if (new Set(ids).size !== ids.length) throw new LearningError('排序数据包含重复卡片');
  const existing = db.prepare('SELECT id FROM knowledge_cards WHERE lesson_id = ? ORDER BY id').all(lessonId).map((row) => row.id);
  if (existing.length !== ids.length || existing.some((id) => !ids.includes(id))) {
    throw new LearningError('排序数据必须包含本课时全部卡片');
  }
  const update = db.prepare('UPDATE knowledge_cards SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))();
  return { ids };
}

module.exports = {
  managedContext(user, lessonId) {
    const lesson = assertManageLesson(user, lessonId);
    return { lesson_id:lesson.id, course_id:lesson.course_id,
      read_only:lesson.course_status === 'archived' || lesson.status === 'cancelled' };
  },
  repairLegacy(user, lessonId, studentId, reason) {
    if (user.role !== 'admin') throw new LearningError('仅管理员可以修复兼容快照',403);
    assertWritableLesson(user,lessonId);
    const explanation = text(reason,500,true);
    try {
      return db.transaction(() => {
        const result = versions.repairLegacy(db,user.id,Number(studentId),Number(lessonId),explanation);
        learningGate.recalculateLessonProgress(Number(studentId),Number(lessonId));
        return result;
      }).immediate();
    } catch (err) { if (err.status) throw new LearningError(err.message,err.status); throw err; }
  },
  LearningError,
  lessonPackage,
  previewLesson,
  completeReview,
  submitExercise,
  completeCard,
  submitReport,
  listManagedCards,
  listManagedLessons,
  createCard,
  updateCard,
  deleteCard,
  createExercise,
  updateExercise,
  deleteExercise,
  reorderCards,
};
