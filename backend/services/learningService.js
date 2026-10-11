const {contentRevision:hash}=require('../helpers/contentRevision');
const db = require('../config/database');
const { courseBelongsToMentor } = require('../helpers/courseScope');
const learningGate = require('../helpers/learningGate');
const notificationService = require('./notificationService');

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
  const lesson = assertManageLesson(user, lessonId);
  if (lesson.course_status === 'archived') {
    throw new LearningError('已归档课程不能修改学习内容', 409, 'COURSE_ARCHIVED');
  }
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
  const cards = db.prepare(`
    SELECT c.*, p.viewed_at, p.completed_at, COALESCE(p.best_score, 0) AS best_score
    FROM knowledge_cards c
    LEFT JOIN student_card_progress p ON p.card_id = c.id AND p.student_id = ?
    WHERE c.lesson_id = ? AND c.status = 'published'
    ORDER BY c.sort_order, c.id
  `).all(studentId, lessonId);
  const cardIds = cards.map((card) => card.id);
  const exercises = cardIds.length ? db.prepare(`
    SELECT id, card_id, question_type, prompt, options_json, answer_json, explanation,
           points, sort_order, is_required, max_attempts
    FROM card_exercises
    WHERE card_id IN (${cardIds.map(() => '?').join(',')})
    ORDER BY sort_order, id
  `).all(...cardIds) : [];
  const attempts = cardIds.length ? db.prepare(`
    SELECT e.card_id, a.exercise_id, COUNT(*) AS attempts,
           MAX(a.is_correct) AS passed, MAX(a.score) AS best_score
    FROM card_exercise_attempts a
    JOIN card_exercises e ON e.id = a.exercise_id
    WHERE a.student_id = ? AND e.card_id IN (${cardIds.map(() => '?').join(',')})
    GROUP BY e.card_id, a.exercise_id
  `).all(studentId, ...cardIds) : [];
  const attemptMap = new Map(attempts.map((item) => [item.exercise_id, item]));
  const exerciseMap = new Map();
  exercises.forEach((item) => {
    const list = exerciseMap.get(item.card_id) || [];
    const attempt = attemptMap.get(item.id);
    list.push({
      ...item,
      options: parseStoredJson(item.options_json, []),
      options_json: undefined,
      answer_json: undefined,
      attempts: attempt?.attempts || 0,
      attempted: Boolean(attempt?.attempts),
      passed: Boolean(attempt?.passed),
      best_score: attempt?.best_score || 0,
      correct_answer: attempt ? parseStoredJson(item.answer_json) : null,
      explanation: attempt ? item.explanation : null,
    });
    exerciseMap.set(item.card_id, list);
  });

  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT w.id FROM works w WHERE w.student_id = ? AND w.task_id = t.id
       ORDER BY w.version DESC, w.id DESC LIMIT 1) AS work_id,
      (SELECT w.review_status FROM works w WHERE w.student_id = ? AND w.task_id = t.id
       ORDER BY w.version DESC, w.id DESC LIMIT 1) AS work_status
    FROM tasks t WHERE t.lesson_id = ? AND t.status = 'active'
    ORDER BY t.sort_order, t.id
  `).all(studentId, studentId, lessonId);
  const report = learningGate.latestReport(studentId, lessonId);
  const reflection = report ? db.prepare('SELECT * FROM reflections WHERE report_id = ?').get(report.id) || null : null;
  const replays = db.prepare(`
    SELECT id, course_id, lesson_id, title, description, duration_seconds, recording_date, sort_order
    FROM course_replays WHERE course_id = ? AND (lesson_id = ? OR lesson_id IS NULL)
    ORDER BY CASE WHEN lesson_id = ? THEN 0 ELSE 1 END, sort_order, id
  `).all(lesson.course_id, lessonId, lessonId);
  const resources = db.prepare(`
    SELECT id, course_id, lesson_id, resource_type, title, description, display_order, file_size, file_name,file_type,created_at,
           CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END AS has_file
    FROM resources WHERE course_id = ? AND (lesson_id = ? OR lesson_id IS NULL)
    ORDER BY CASE WHEN lesson_id = ? THEN 0 ELSE 1 END, display_order, created_at DESC
  `).all(lesson.course_id, lessonId, lessonId);

  return {
    course: { id: lesson.course_id, title: lesson.course_title },
    lesson: {
      id: lesson.id, title: lesson.title, description: lesson.description,teaching_tip:lesson.teaching_tip,
      presentation_type:lesson.presentation_type,content_state:lesson.content_state,article_url:lesson.article_url,article_title:lesson.article_title,moments_note:lesson.moments_note,
      review_content:lesson.review_content,report_guidance:lesson.report_guidance,experiment_guidance:lesson.experiment_guidance,article_blocks:require('./articleBlocks').parse(lesson.article_blocks),location:lesson.location,instructor_name:db.prepare('SELECT real_name FROM users WHERE id=?').get(lesson.instructor_id)?.real_name||null,
      duration: lesson.duration, start_at: lesson.start_at, end_at: lesson.end_at,
    },
    enrollment_id: enrollment.enrollment_id,
    replays,
    resources,
    cards: cards.map((card) => ({
      ...card,
      required: Boolean(card.is_required),
      completed: Boolean(card.completed_at),
      exercises: exerciseMap.get(card.id) || [],
    })),
    consolidation_tasks: tasks,
    report,
    reflection,
    progress: learningGate.recalculateLessonProgress(studentId, lessonId),
  };
}

function completeReview(studentId, lessonId) {
  assertStudentLesson(studentId, lessonId);
  if(lessonContext(lessonId).content_state==='preparing')throw new LearningError('教学内容尚未准备，不能标记完成',409,'CONTENT_PREPARING');
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
  const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('zh-CN');
  if (Array.isArray(expected)) return expected.some((item) => normalize(item) === normalize(actual));
  return normalize(actual) === normalize(expected);
}

function refreshCardProgress(studentId, cardId) {
  const stats = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM card_exercise_attempts a
             WHERE a.student_id = ? AND a.exercise_id = e.id
           ) THEN 1 ELSE 0 END) AS answered,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM card_exercise_attempts a
             WHERE a.student_id = ? AND a.exercise_id = e.id AND a.is_correct = 1
           ) THEN 1 ELSE 0 END) AS passed,
           COALESCE(SUM(e.points), 0) AS total_points,
           COALESCE(SUM((SELECT MAX(a.score) FROM card_exercise_attempts a
             WHERE a.student_id = ? AND a.exercise_id = e.id)), 0) AS earned
    FROM card_exercises e WHERE e.card_id = ? AND e.is_required = 1
  `).get(studentId, studentId, studentId, cardId);
  const bestScore = stats.total_points > 0 ? Math.round((stats.earned / stats.total_points) * 100) : 100;
  db.prepare(`
    INSERT INTO student_card_progress (student_id, card_id, best_score, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, card_id) DO UPDATE SET
      best_score = MAX(student_card_progress.best_score, excluded.best_score),
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, cardId, bestScore);
  return Number(stats.answered || 0) === Number(stats.total || 0);
}

function submitExercise(studentId, exerciseId, answer) {
  const exercise = db.prepare(`
    SELECT e.*, c.lesson_id, c.status AS card_status
    FROM card_exercises e JOIN knowledge_cards c ON c.id = e.card_id
    WHERE e.id = ?
  `).get(exerciseId);
  if (!exercise || exercise.card_status !== 'published') {
    throw new LearningError('练习不存在', 404, 'EXERCISE_NOT_FOUND');
  }
  assertStudentLesson(studentId, exercise.lesson_id);
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
  const attemptCount = db.prepare(
    'SELECT COUNT(*) AS count FROM card_exercise_attempts WHERE student_id = ? AND exercise_id = ?'
  ).get(studentId, exercise.id).count;
  if (attemptCount >= 1) {
    throw new LearningError('每道题只有一次作答机会', 409, 'MAX_ATTEMPTS_REACHED');
  }
  const expected = parseStoredJson(exercise.answer_json);
  const correct = answersEqual(exercise.question_type, submitted.value, expected);
  const attemptNo = attemptCount + 1;
  const score = correct ? exercise.points : 0;
  let cardCompleted;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO card_exercise_attempts
        (student_id, exercise_id, answer_json, is_correct, score, attempt_no)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, exercise.id, submitted.encoded, correct ? 1 : 0, score, attemptNo);
    cardCompleted = refreshCardProgress(studentId, exercise.card_id);
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
  if (!card || card.status !== 'published') throw new LearningError('知识卡片不存在', 404, 'CARD_NOT_FOUND');
  assertStudentLesson(studentId, card.lesson_id);
  if (!learningGate.isReviewCompleted(studentId, card.lesson_id)) {
    throw new LearningError('请先完成课堂回顾', 409, 'LESSON_REVIEW_REQUIRED');
  }
  const exercises = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM card_exercise_attempts a
             WHERE a.student_id = ? AND a.exercise_id = e.id
           ) THEN 1 ELSE 0 END) AS answered
    FROM card_exercises e WHERE e.card_id = ?
  `).get(studentId, card.id);
  if (Number(exercises.answered || 0) !== Number(exercises.total || 0)) {
    throw new LearningError('请先作答本卡片的全部练习', 409, 'CARD_EXERCISES_REQUIRED');
  }
  db.prepare(`
    INSERT INTO student_card_progress (student_id, card_id, viewed_at, completed_at, best_score, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 100, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, card_id) DO UPDATE SET
      viewed_at = COALESCE(student_card_progress.viewed_at, CURRENT_TIMESTAMP),
      completed_at = COALESCE(student_card_progress.completed_at, CURRENT_TIMESTAMP),
      best_score = 100, updated_at = CURRENT_TIMESTAMP
  `).run(studentId, card.id);
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
    reflection: (()=>{try{return require('../helpers/reflectionContent').validateReflection(reflection);}catch(e){throw new LearningError(e.message,e.status||400);}})(),
  };
}

function submitReport(studentId, lessonId, data) {
  const enrollment = assertStudentLesson(studentId, lessonId);
  if(lessonContext(lessonId).content_state==='preparing')throw new LearningError('教学内容尚未准备，不能提交报告',409,'CONTENT_PREPARING');
  if (!learningGate.canSubmitLessonReport(studentId, lessonId)) {
    throw new LearningError('请先完成课堂回顾、全部知识卡片和配套练习', 409, 'REPORT_LOCKED');
  }
  const payload = validateReport(data);
  const previous = learningGate.latestReport(studentId, lessonId);
  if (previous && previous.status !== 'rejected') {
    throw new LearningError('当前报告已提交或通过，不能覆盖', 409, 'REPORT_IMMUTABLE');
  }
  const version = previous ? previous.version + 1 : 1;
  const parentId = previous ? previous.id : null;
  const reportId = db.transaction(() => {
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
    db.prepare(`
      INSERT INTO reflections (
        student_id, enrollment_id, lesson_id, report_id,
        difficulty, solution, improvement, new_question,reflection_version,entry_note,together_note,extra_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId, enrollment.enrollment_id, lessonId, id,
      payload.reflection.difficulty, payload.reflection.solution,
      payload.reflection.improvement, payload.reflection.new_question,
      payload.reflection.reflection_version,payload.reflection.entry_note,payload.reflection.together_note,payload.reflection.extra_note,
    );
    learningGate.recalculateLessonProgress(studentId, lessonId);
    return id;
  })();
  const context = lessonContext(lessonId);
  notificationService.safeCreateForUsers({
    eventKey: 'lesson.report_submitted',
    dedupeKey: `lesson.report_submitted:${reportId}`,
    title: '收到新的学习报告',
    summary: `${context.course_title} · ${context.title}`,
    content: `学生提交了第 ${version} 版课时学习报告，请及时评审。`,
    category: 'course', level: 'important',
    actionUrl: `/mentor/reviews/${reportId}`,
    businessType: 'lesson_report', businessId: reportId,
    createdBy: studentId,
  }, [...new Set([context.course_created_by, context.instructor_id].filter(Boolean))]);
  return db.prepare('SELECT * FROM lesson_learning_reports WHERE id = ?').get(reportId);
}

function listManagedCards(user, lessonId) {
  assertManageLesson(user, lessonId);
  const cards = db.prepare('SELECT * FROM knowledge_cards WHERE lesson_id = ? ORDER BY sort_order, id').all(lessonId);
  if (!cards.length) return [];
  const ids = cards.map((item) => item.id);
  const exercises = db.prepare(`SELECT * FROM card_exercises WHERE card_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`).all(...ids);
  return cards.map((card) => ({
    ...card,
    content_revision:hash(card),
    exercises: exercises.filter((item) => item.card_id === card.id).map((item) => ({
      ...item,
      content_revision:hash(item),
      options: parseStoredJson(item.options_json, []),
      answer: parseStoredJson(item.answer_json),
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
    LEFT JOIN card_exercises ce ON ce.card_id = kc.id
    WHERE ${where}
    GROUP BY l.id, c.id
    ORDER BY CASE c.status WHEN 'published' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
             c.updated_at DESC, l.sort_order, l.id
  `).all(...params);
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
  return { id: Number(result.lastInsertRowid), content_revision:hash(db.prepare('SELECT * FROM knowledge_cards WHERE id=?').get(result.lastInsertRowid)) };
}

function updateCard(user, cardId, data) {
  const current = assertManageCard(user, cardId, true);
  if(data.expected_revision!==undefined&&data.expected_revision!==hash(db.prepare('SELECT * FROM knowledge_cards WHERE id=?').get(current.id)))throw new LearningError('内容已由其他维护者修改，请重新读取并核对后保存',409);
  const value = cardPayload({ ...current, ...data });
  db.prepare(`
    UPDATE knowledge_cards SET title = ?, summary = ?, content = ?, key_points = ?,
      common_mistakes = ?, example_content = ?, sort_order = ?, is_required = ?,
      estimated_minutes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(value.title, value.summary, value.content, value.key_points, value.common_mistakes,
    value.example_content, value.sort_order, value.is_required, value.estimated_minutes,
    value.status, current.id);
  return { id: current.id,content_revision:hash(db.prepare('SELECT * FROM knowledge_cards WHERE id=?').get(current.id)) };
}

function deleteCard(user, cardId) {
  const card = assertManageCard(user, cardId, true);
  const hasProgress = db.prepare('SELECT 1 FROM student_card_progress WHERE card_id = ? LIMIT 1').get(card.id)
    || db.prepare(`SELECT 1 FROM card_exercise_attempts a JOIN card_exercises e ON e.id = a.exercise_id WHERE e.card_id = ? LIMIT 1`).get(card.id);
  if (hasProgress) {
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
  return { id:Number(result.lastInsertRowid),content_revision:hash(db.prepare('SELECT * FROM card_exercises WHERE id=?').get(result.lastInsertRowid)) };
}

function updateExercise(user, exerciseId, data) {
  const current = assertManageExercise(user, exerciseId, true);
  if(data.expected_revision!==undefined&&data.expected_revision!==hash(db.prepare('SELECT * FROM card_exercises WHERE id=?').get(current.id)))throw new LearningError('内容已由其他维护者修改，请重新读取并核对后保存',409);
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
  return { id:current.id,content_revision:hash(db.prepare('SELECT * FROM card_exercises WHERE id=?').get(current.id)) };
}

function deleteExercise(user, exerciseId) {
  const exercise = assertManageExercise(user, exerciseId, true);
  if (db.prepare('SELECT 1 FROM card_exercise_attempts WHERE exercise_id = ? LIMIT 1').get(exercise.id)) {
    throw new LearningError('该练习已有作答记录，不能删除，可改为非必修', 409, 'EXERCISE_HAS_ATTEMPTS');
  }
  db.prepare('DELETE FROM card_exercises WHERE id = ?').run(exercise.id);
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
  LearningError,
  lessonPackage,
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
