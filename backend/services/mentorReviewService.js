const db = require('../config/database');
const { courseBelongsToMentor } = require('../helpers/courseScope');
const learningGate = require('../helpers/learningGate');
const notificationService = require('./notificationService');

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
           c.created_by AS course_created_by
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
  const where = ['1 = 1'];
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
  return { items, pagination: { page, pageSize, total } };
}

function detail(user, reportId) {
  const report = reportContext(reportId);
  assertReviewAccess(user, report);
  const reflection = db.prepare('SELECT * FROM reflections WHERE report_id = ?').get(report.id) || null;
  const cards = db.prepare(`
    SELECT c.id, c.title, c.is_required, p.completed_at, p.best_score,
           COUNT(DISTINCT e.id) AS exercise_count,
           COUNT(a.id) AS attempt_count,
           SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_attempts
    FROM knowledge_cards c
    LEFT JOIN student_card_progress p ON p.card_id = c.id AND p.student_id = ?
    LEFT JOIN card_exercises e ON e.card_id = c.id
    LEFT JOIN card_exercise_attempts a ON a.exercise_id = e.id AND a.student_id = ?
    WHERE c.lesson_id = ? AND c.status != 'archived'
    GROUP BY c.id ORDER BY c.sort_order, c.id
  `).all(report.student_id, report.student_id, report.lesson_id);
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
    progress: learningGate.getLessonLearningState(report.student_id, report.lesson_id),
  };
}

function review(user, reportId, payload = {}) {
  const report = reportContext(reportId);
  assertReviewAccess(user, report);
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
  if (!['number','string'].includes(typeof payload.score) || String(payload.score).trim()==='' || !Number.isInteger(score) || score < 0 || score > 100) {
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
    db.prepare(`
      UPDATE lesson_learning_reports SET status = ?, reviewer_id = ?, review_comment = ?, score = ?, score_dimensions_json = ?,
        reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(payload.status, user.id, comment || null, score, dimensionsJson, report.id);
    state = learningGate.recalculateLessonProgress(report.student_id, report.lesson_id);
    learningGate.recordCompletionGrowth(report.student_id, report.lesson_id, user.id);
  })();

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
  return { report: reportContext(report.id), progress: state };
}

module.exports = { MentorReviewError, list, detail, review };
