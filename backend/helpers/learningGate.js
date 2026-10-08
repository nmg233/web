const db = require('../config/database');
const versions = require('./lessonVersions');

function cardStats(studentId, lessonId) {
  const cards = versions.studentCards(db, studentId, lessonId);
  return { total: cards.length, completed: cards.filter((c) => c.completed_at).length };
}

function isReviewCompleted(studentId, lessonId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM lesson_review_completions WHERE student_id = ? AND lesson_id = ?
  `).get(studentId, lessonId));
}

function consolidationStats(studentId, lessonId) {
  return db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM works w
             WHERE w.task_id = t.id AND w.student_id = ?
           ) THEN 1 ELSE 0 END) AS submitted,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM works w
             WHERE w.task_id = t.id AND w.student_id = ? AND w.review_status = 'approved'
           ) THEN 1 ELSE 0 END) AS approved
    FROM tasks t
    WHERE t.lesson_id = ? AND t.status = 'active' AND t.require_upload = 1
  `).get(studentId, studentId, lessonId);
}

function latestReport(studentId, lessonId) {
  return db.prepare(`
    SELECT * FROM lesson_learning_reports
    WHERE student_id = ? AND lesson_id = ?
    ORDER BY version DESC, id DESC LIMIT 1
  `).get(studentId, lessonId) || null;
}

function areRequiredCardsCompleted(studentId, lessonId) {
  const stats = cardStats(studentId, lessonId);
  return stats.total > 0 && Number(stats.completed || 0) === stats.total;
}

function areConsolidationTasksSubmitted(studentId, lessonId) {
  const stats = consolidationStats(studentId, lessonId);
  return stats.total === 0 || Number(stats.submitted || 0) === stats.total;
}

function canSubmitLessonReport(studentId, lessonId) {
  return isReviewCompleted(studentId, lessonId)
    && areRequiredCardsCompleted(studentId, lessonId);
}

function getLessonLearningState(studentId, lessonId) {
  return versions.completionEvidence(db,studentId,lessonId);
}

function recalculateLessonProgress(studentId, lessonId) {
  const state = getLessonLearningState(studentId, lessonId);
  db.prepare(`
    INSERT INTO lesson_progress (student_id, lesson_id, progress, completed_at, updated_at)
    VALUES (?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, lesson_id) DO UPDATE SET
      progress = excluded.progress,
      completed_at = CASE
        WHEN excluded.completed_at IS NOT NULL THEN COALESCE(lesson_progress.completed_at, excluded.completed_at)
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, lessonId, state.percent, state.completed ? 1 : 0);
  const lesson = db.prepare('SELECT course_id FROM lessons WHERE id = ?').get(lessonId);
  if (lesson) versions.courseState(db, studentId, lesson.course_id, true);
  return state;
}

function recordCompletionGrowth(studentId, lessonId, recordedBy = null) {
  const state = getLessonLearningState(studentId, lessonId);
  if (!state.completed) return false;
  const context = db.prepare(`
    SELECT l.title AS lesson_title, r.version
    FROM lessons l
    JOIN lesson_learning_reports r ON r.id = (
      SELECT latest.id FROM lesson_learning_reports latest
      WHERE latest.student_id = ? AND latest.lesson_id = l.id AND latest.status = 'approved'
      ORDER BY latest.version DESC, latest.id DESC LIMIT 1
    )
    WHERE l.id = ?
  `).get(studentId, lessonId);
  if (!context) return false;
  const description = `完成课时《${context.lesson_title}》课后学习闭环（报告第 ${context.version} 版）`;
  const exists = db.prepare(
    "SELECT 1 FROM growth_records WHERE student_id = ? AND event_type = 'system' AND description = ? LIMIT 1"
  ).get(studentId, description);
  if (exists) return false;
  db.prepare("INSERT INTO growth_records (student_id,event_type,description,recorded_by) VALUES (?,'system',?,?)")
    .run(studentId, description, recordedBy);
  return true;
}

module.exports = {
  getLessonLearningState,
  areRequiredCardsCompleted,
  areConsolidationTasksSubmitted,
  isReviewCompleted,
  canSubmitLessonReport,
  recalculateLessonProgress,
  recordCompletionGrowth,
  latestReport,
};
