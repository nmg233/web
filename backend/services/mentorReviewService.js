const db = require('../config/database');
const { courseBelongsToMentor } = require('../helpers/courseScope');
const learningGate = require('../helpers/learningGate');
const notificationService = require('./notificationService');
const versions = require('../helpers/lessonVersions');

class MentorReviewError extends Error {
  constructor(message, status = 400, code = 'MENTOR_REVIEW_INVALID') {
    super(message);
    this.name = 'MentorReviewError';
    this.status = status;
    this.code = code;
  }
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function reportContext(reportId) {
  const report = db.prepare(`
    SELECT r.*, s.real_name AS student_name, s.avatar_url AS student_avatar,
           l.title AS lesson_title, l.course_id, c.title AS course_title,
           c.created_by AS course_created_by, c.status AS course_status, l.status AS lesson_status
    FROM lesson_learning_reports r
    JOIN users s ON s.id = r.student_id
    JOIN lessons l ON l.id = r.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE r.id = ?
  `).get(reportId);
  if (!report) throw new MentorReviewError('学习报告不存在', 404, 'REPORT_NOT_FOUND');
  return report;
}

function assertReviewAccess(user, report) {
  if (user.role === 'admin') return;
  if (user.role !== 'academic_mentor' || !courseBelongsToMentor(user.id, report.course_id)) {
    throw new MentorReviewError('无权访问该学习报告', 403, 'REPORT_FORBIDDEN');
  }
}

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.page_size || query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function list(user, query = {}) {
  const { page, pageSize, offset } = pagination(query);
  const where = [`NOT EXISTS (SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id)`, `r.id = (SELECT latest.id FROM lesson_learning_reports latest
    WHERE latest.student_id = r.student_id AND latest.lesson_id = r.lesson_id
    ORDER BY latest.version DESC, latest.id DESC LIMIT 1)`];
  const params = [];
  if (user.role !== 'admin') {
    where.push('(c.created_by = ? OR EXISTS (SELECT 1 FROM lessons own_l WHERE own_l.course_id = c.id AND own_l.instructor_id = ?))');
    params.push(user.id, user.id);
  }
  for (const [field, column] of [['course_id', 'c.id'], ['lesson_id', 'l.id'], ['student_id', 'r.student_id']]) {
    if (query[field]) {
      where.push(`${column} = ?`);
      params.push(Number(query[field]));
    }
  }
  if (['submitted', 'approved', 'rejected'].includes(query.status)) {
    where.push('r.status = ?');
    params.push(query.status);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM lesson_learning_reports r
    JOIN lessons l ON l.id = r.lesson_id JOIN courses c ON c.id = l.course_id
    WHERE ${whereSql}
  `).get(...params).count;
  const items = db.prepare(`
    SELECT r.id, r.student_id, r.lesson_id, r.version, r.status, r.score, r.submitted_at,
           r.reviewed_at, r.review_comment,
           s.real_name AS student_name, s.avatar_url AS student_avatar,
           l.title AS lesson_title, c.id AS course_id, c.title AS course_title,
           (SELECT COUNT(*) FROM knowledge_cards kc
            WHERE kc.lesson_id = l.id AND kc.status = 'published' AND kc.is_required = 1) AS cards_total,
           (SELECT COUNT(*) FROM knowledge_cards kc
            JOIN student_card_progress scp ON scp.card_id = kc.id
              AND scp.student_id = r.student_id AND scp.completed_at IS NOT NULL
            WHERE kc.lesson_id = l.id AND kc.status = 'published' AND kc.is_required = 1) AS cards_completed,
           (SELECT COUNT(*) FROM tasks t WHERE t.lesson_id = l.id AND t.status = 'active' AND t.require_upload = 1) AS tasks_total,
           (SELECT COUNT(DISTINCT t.id) FROM tasks t JOIN works w ON w.task_id = t.id AND w.student_id = r.student_id
            WHERE t.lesson_id = l.id AND t.status = 'active' AND t.require_upload = 1) AS tasks_submitted,
           (SELECT COUNT(*) FROM lesson_learning_reports old
            WHERE old.student_id = r.student_id AND old.lesson_id = r.lesson_id AND old.status = 'rejected') AS rejected_count
    FROM lesson_learning_reports r
    JOIN users s ON s.id = r.student_id
    JOIN lessons l ON l.id = r.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE ${whereSql}
    ORDER BY CASE r.status WHEN 'submitted' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
             r.submitted_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return { items: items.map((r) => {
    const cards = versions.studentCards(db, r.student_id, r.lesson_id);
    return { ...r, cards_total: cards.length, cards_completed: cards.filter((c) => c.completed_at).length };
  }), pagination: { page, pageSize, total } };
}

function detail(user, reportId) {
  const report = reportContext(reportId);
  assertReviewAccess(user, report);
  const reflection = db.prepare('SELECT * FROM reflections WHERE report_id = ?').get(report.id) || null;
  const contentVersionId = db.prepare('SELECT content_version_id FROM report_content_versions WHERE report_id = ?').get(report.id)?.content_version_id || null;
  const cards = versions.studentCards(db, report.student_id, report.lesson_id, contentVersionId).map((c) => ({
    ...c, exercise_count: c.exercises.length, attempt_count: c.exercises.filter((e) => e.attempt).length,
    exercises: c.exercises.map((e) => ({
      id: e.id, question_type: e.question_type, prompt: e.prompt,
      options: parseJson(e.options_json), reference_answer: parseJson(e.answer_json), explanation: e.explanation,
      student_answer: e.attempt ? parseJson(e.attempt.answer_json) : null,
      attempted: Boolean(e.attempt), correct: e.question_type === 'short_answer' ? null : e.attempt?.is_correct,
      score: e.question_type === 'short_answer' ? null : e.attempt?.score, feedback: e.feedback,
    })),
  }));
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.description, t.require_upload, t.deadline,
           w.id AS work_id, w.title AS work_title, w.review_status, w.version,
           wr.comment AS work_review_comment, wr.suggestion AS work_review_suggestion
    FROM tasks t
    LEFT JOIN works w ON w.id = (
      SELECT latest.id FROM works latest
      WHERE latest.task_id = t.id AND latest.student_id = ?
      ORDER BY latest.version DESC, latest.id DESC LIMIT 1
    )
    LEFT JOIN work_reviews wr ON wr.work_id = w.id
    WHERE t.lesson_id = ? AND t.status = 'active'
    ORDER BY t.sort_order, t.id
  `).all(report.student_id, report.lesson_id);
  const history = db.prepare(`
    SELECT id, version, status, summary, review_comment, reviewer_id, submitted_at, reviewed_at
    FROM lesson_learning_reports WHERE student_id = ? AND lesson_id = ?
    ORDER BY version DESC, id DESC
  `).all(report.student_id, report.lesson_id);
  return {
    student: { id: report.student_id, real_name: report.student_name, avatar_url: report.student_avatar },
    course: { id: report.course_id, title: report.course_title },
    lesson: { id: report.lesson_id, title: report.lesson_title },
    report: { ...report, score_dimensions: parseJson(report.score_dimensions_json) },
    reflection,
    cards,
    consolidation_tasks: tasks,
    history,
    content_version: contentVersionId || versions.boundVersion(db, report.student_id, report.lesson_id)?.id || null,
    read_only: report.course_status === 'archived' || report.lesson_status === 'cancelled' || Boolean(versions.replacement(db,report.id)),
    replacement: versions.replacement(db,report.id),
    progress: learningGate.getLessonLearningState(report.student_id, report.lesson_id),
  };
}

function review(user, reportId, payload = {}) {
  const report = reportContext(reportId);
  assertReviewAccess(user, report);
  if (versions.replacement(db,report.id)) throw new MentorReviewError('历史内容已修复，请等待学生补学并提交新版报告',409,'REPORT_REPLACEMENT_REQUIRED');
  if (!learningGate.canSubmitLessonReport(report.student_id,report.lesson_id)) throw new MentorReviewError('学生尚未完成课堂回顾及全部卡片习题，暂不可评审',409,'LEARNING_INCOMPLETE');
  if (report.course_status === 'archived' || report.lesson_status === 'cancelled') {
    throw new MentorReviewError('归档课程或取消课时只允许查看历史', 409, 'REVIEW_READ_ONLY');
  }
  if (report.status !== 'submitted') {
    throw new MentorReviewError('只能评审待评审报告', 409, 'REPORT_ALREADY_REVIEWED');
  }
  if (!['approved', 'rejected'].includes(payload.status)) {
    throw new MentorReviewError('请选择通过或退回修改');
  }
  const comment = String(payload.comment || '').trim();
  if (payload.status === 'rejected' && !comment) throw new MentorReviewError('退回时必须填写修改意见');
  if (comment.length > 5000) throw new MentorReviewError('评语不能超过 5000 个字符');
  const score = Number(payload.score);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new MentorReviewError('请填写 0–100 的整数评分');
  }
  const dimensions = {};
  const allowedDimensions = ['knowledge_understanding', 'problem_analysis', 'practical_application', 'reflection_expression'];
  for (const key of allowedDimensions) {
    if (payload.dimensions?.[key] === undefined || payload.dimensions?.[key] === null || payload.dimensions?.[key] === '') continue;
    const value = Number(payload.dimensions[key]);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new MentorReviewError('维度评分必须是 0–100 的整数');
    }
    dimensions[key] = value;
  }
  const dimensionsJson = Object.keys(dimensions).length ? JSON.stringify(dimensions) : null;

  let state;
  db.transaction(() => {
    const current = reportContext(reportId);
    if (versions.replacement(db,current.id) || !learningGate.canSubmitLessonReport(current.student_id,current.lesson_id)) throw new MentorReviewError('学习状态已改变，请刷新',409);
    if (current.status !== 'submitted' || learningGate.latestReport(current.student_id, current.lesson_id)?.id !== current.id) {
      throw new MentorReviewError('只能评审最新的待评审报告，请刷新评审队列', 409, 'REPORT_ALREADY_REVIEWED');
    }
    db.prepare(`
      UPDATE lesson_learning_reports SET status = ?, reviewer_id = ?, review_comment = ?, score = ?, score_dimensions_json = ?,
        reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(payload.status, user.id, comment || null, score, dimensionsJson, report.id);
    state = learningGate.recalculateLessonProgress(report.student_id, report.lesson_id);
    learningGate.recordCompletionGrowth(report.student_id, report.lesson_id, user.id);

  const approved = payload.status === 'approved';
  notificationService.safeCreateForUsers({
    eventKey: approved ? 'lesson.report_approved' : 'lesson.report_rejected',
    dedupeKey: `lesson.report_${payload.status}:${report.id}`,
    title: approved ? '学习报告已通过' : '学习报告需要修改',
    summary: `${report.course_title} · ${report.lesson_title}`,
    content: `${approved ? '导师评分' : '本次评分'}：${score} 分。${comment || '学习报告已通过执行导师评审。'}`,
    category: 'course', level: approved ? 'normal' : 'important',
    actionUrl: `/courses/${report.course_id}/lessons/${report.lesson_id}/learn`,
    businessType: 'lesson_report', businessId: report.id,
    createdBy: user.id,
  }, [report.student_id]);
  if (state.completed) {
    notificationService.safeCreateForUsers({
      eventKey: 'lesson.learning_completed',
      dedupeKey: `lesson.learning_completed:${report.student_id}:${report.lesson_id}`,
      title: '本课时学习已完成',
      summary: `${report.course_title} · ${report.lesson_title}`,
      content: `课堂回顾、知识卡片和学习报告均已完成，导师评分 ${score} 分。`,
      category: 'course', level: 'normal',
      actionUrl: `/courses/${report.course_id}/lessons/${report.lesson_id}/learn`,
      businessType: 'lesson', businessId: report.lesson_id,
      createdBy: user.id,
    }, [report.student_id]);
  }
  }).immediate();
  return { report: reportContext(report.id), progress: state };
}

function feedback(user, reportId, exerciseId, payload) {
  const report = reportContext(reportId);
  assertReviewAccess(user, report);
  if (report.course_status === 'archived' || report.lesson_status === 'cancelled') throw new MentorReviewError('历史课时只读', 409);
  if (versions.replacement(db,report.id)) throw new MentorReviewError('已替代的历史报告只允许查看',409);
  if (learningGate.latestReport(report.student_id, report.lesson_id)?.id !== report.id) throw new MentorReviewError('请在最新报告中填写反馈', 409);
  const reportVersion = db.prepare('SELECT content_version_id FROM report_content_versions WHERE report_id=?').get(report.id)?.content_version_id;
  const exercise = versions.studentCards(db, report.student_id, report.lesson_id,reportVersion).flatMap((c) => c.exercises).find((e) => e.id === Number(exerciseId));
  if (!exercise?.attempt) throw new MentorReviewError('未找到本课时的作答记录', 404);
  const content = String(payload.content || '').trim();
  if (!content || content.length > 5000) throw new MentorReviewError('请填写 1–5000 字的反馈');
  db.prepare(`INSERT INTO exercise_feedback (student_id, exercise_id, mentor_id, content) VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, exercise_id) DO UPDATE SET mentor_id = excluded.mentor_id, content = excluded.content, updated_at = CURRENT_TIMESTAMP`)
    .run(report.student_id, exercise.id, user.id, content);
  return { message: '习题反馈已保存' };
}

module.exports = { MentorReviewError, list, detail, review, feedback };
