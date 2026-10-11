const db = require('../config/database');

function unfinished(courseId, lessonId = null) {
  const reports = db.prepare(`SELECT r.id,r.student_id,u.real_name AS student_name,l.title,r.status,'report' AS kind
    FROM lesson_learning_reports r JOIN lessons l ON l.id=r.lesson_id JOIN users u ON u.id=r.student_id
    WHERE l.course_id=? AND (? IS NULL OR l.id=?)
    AND (r.status IN ('submitted','rejected') OR EXISTS (SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id AND rr.replacement_report_id IS NULL))
    AND r.id=(SELECT x.id FROM lesson_learning_reports x WHERE x.student_id=r.student_id AND x.lesson_id=r.lesson_id ORDER BY x.version DESC,x.id DESC LIMIT 1)`)
    .all(courseId,lessonId,lessonId);
  const works = db.prepare(`SELECT w.id,w.student_id,u.real_name AS student_name,COALESCE(t.title,w.title) AS title,w.review_status AS status,'work' AS kind
    FROM works w JOIN users u ON u.id=w.student_id LEFT JOIN tasks t ON t.id=w.task_id
    LEFT JOIN lessons l ON l.id=t.lesson_id LEFT JOIN enrollments e ON e.id=w.enrollment_id
    WHERE COALESCE(l.course_id,e.course_id)=? AND (? IS NULL OR l.id=?) AND w.review_status IN ('pending','rejected')
    AND w.id=(SELECT x.id FROM works x WHERE COALESCE(x.parent_work_id,x.id)=COALESCE(w.parent_work_id,w.id) ORDER BY x.version DESC,x.id DESC LIMIT 1)`)
    .all(courseId,lessonId,lessonId);
  return [...reports,...works];
}

function hasLearningHistory(courseId) {
  for (const table of ['student_lesson_versions','lesson_progress','lesson_review_completions','lesson_learning_reports','reflections']) {
    if (db.prepare(`SELECT 1 FROM ${table} h JOIN lessons l ON l.id=h.lesson_id WHERE l.course_id=? LIMIT 1`).get(courseId)) return true;
  }
  if (db.prepare(`SELECT 1 FROM student_card_progress p JOIN knowledge_cards c ON c.id=p.card_id JOIN lessons l ON l.id=c.lesson_id WHERE l.course_id=? LIMIT 1`).get(courseId)) return true;
  if (db.prepare(`SELECT 1 FROM card_exercise_attempts a JOIN card_exercises e ON e.id=a.exercise_id JOIN knowledge_cards c ON c.id=e.card_id JOIN lessons l ON l.id=c.lesson_id WHERE l.course_id=? LIMIT 1`).get(courseId)) return true;
  return Boolean(db.prepare(`SELECT 1 FROM works w LEFT JOIN tasks t ON t.id=w.task_id LEFT JOIN lessons l ON l.id=t.lesson_id
    LEFT JOIN enrollments e ON e.id=w.enrollment_id WHERE COALESCE(l.course_id,e.course_id)=? LIMIT 1`).get(courseId));
}

function assertCanClose(courseId, lessonId = null) {
  const items = unfinished(courseId,lessonId);
  if (items.length) throw Object.assign(new Error('请先处理全部待评或待修改的最新报告及独立成果，再归档或取消'),{status:409,items});
}

module.exports = { unfinished,hasLearningHistory,assertCanClose };
