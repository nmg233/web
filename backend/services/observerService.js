const db = require('../config/database');

class ObserverError extends Error {
  constructor(message, status = 400, code = 'OBSERVER_INVALID') {
    super(message);
    this.name = 'ObserverError';
    this.status = status;
    this.code = code;
  }
}

function scopeSql(user, alias = 's') {
  if (user.role === 'admin') return { sql: '1 = 1', params: [] };
  if (user.role !== 'teacher') throw new ObserverError('无权访问观察工作台', 403, 'OBSERVER_FORBIDDEN');
  return { sql: `${alias}.teacher_id = ?`, params: [user.id] };
}

function studentRow(user, studentId) {
  const scope = scopeSql(user, 's');
  const student = db.prepare(`
    SELECT s.id, s.username, s.real_name, s.avatar_url, s.school_id, s.class_id,
           school.name AS school_name, cls.name AS class_name, cls.grade
    FROM users s
    LEFT JOIN schools school ON school.id = s.school_id
    LEFT JOIN classes cls ON cls.id = s.class_id
    WHERE s.id = ? AND s.role = 'student' AND s.is_active = 1
      AND s.archived_at IS NULL AND ${scope.sql}
  `).get(studentId, ...scope.params);
  if (!student) throw new ObserverError('学生不存在或未分配给当前教师', 404, 'OBSERVER_STUDENT_NOT_FOUND');
  return student;
}

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.page_size || query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function students(user, query = {}) {
  const { page, pageSize, offset } = pagination(query);
  const scope = scopeSql(user, 's');
  const where = ["s.role = 'student'", 's.is_active = 1', 's.archived_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (String(query.search || '').trim()) {
    const keyword = `%${String(query.search).trim().slice(0, 100)}%`;
    where.push('(s.real_name LIKE ? OR s.username LIKE ?)');
    params.push(keyword, keyword);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM users s WHERE ${whereSql}`).get(...params).count;
  const items = db.prepare(`
    SELECT s.id, s.username, s.real_name, s.avatar_url,
           school.name AS school_name, cls.name AS class_name,
           (SELECT MAX(activity_at) FROM (
             SELECT MAX(a.submitted_at) AS activity_at FROM card_exercise_attempts a WHERE a.student_id = s.id
             UNION ALL SELECT MAX(r.submitted_at) FROM lesson_learning_reports r WHERE r.student_id = s.id
             UNION ALL SELECT MAX(w.created_at) FROM works w WHERE w.student_id = s.id
           )) AS last_learning_at,
           (SELECT COUNT(*) FROM lesson_progress lp
            WHERE lp.student_id = s.id AND lp.completed_at >= datetime('now', '-30 days')) AS completed_30d,
           (SELECT COUNT(*) FROM lesson_progress lp
            JOIN lessons l ON l.id = lp.lesson_id
            WHERE lp.student_id = s.id AND lp.completed_at IS NULL AND lp.progress > 0) AS pending_lessons,
           (SELECT COUNT(*) FROM lesson_learning_reports r
            WHERE r.student_id = s.id AND r.status = 'rejected') AS rejected_reports,
           (SELECT r.status FROM lesson_learning_reports r WHERE r.student_id = s.id
            ORDER BY r.updated_at DESC, r.id DESC LIMIT 1) AS latest_report_status
    FROM users s
    LEFT JOIN schools school ON school.id = s.school_id
    LEFT JOIN classes cls ON cls.id = s.class_id
    WHERE ${whereSql}
    ORDER BY last_learning_at DESC, s.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((item) => ({
    ...item,
    risk_tags: [
      ...(item.pending_lessons >= 2 ? ['连续课时未完成'] : []),
      ...(item.rejected_reports >= 2 ? ['报告多次退回'] : []),
    ],
  }));
  return { items, pagination: { page, pageSize, total } };
}

function dashboard(user) {
  const list = students(user, { page: 1, page_size: 100 });
  const ids = list.items.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const weeklyCompleted = ids.length ? db.prepare(`
    SELECT COUNT(*) AS count FROM lesson_progress
    WHERE student_id IN (${placeholders}) AND completed_at >= datetime('now', '-7 days')
  `).get(...ids).count : 0;
  const recentReports = ids.length ? db.prepare(`
    SELECT r.id, r.student_id, r.status, r.version, r.submitted_at,
           s.real_name AS student_name, l.title AS lesson_title, c.title AS course_title
    FROM lesson_learning_reports r
    JOIN users s ON s.id = r.student_id
    JOIN lessons l ON l.id = r.lesson_id JOIN courses c ON c.id = l.course_id
    WHERE r.student_id IN (${placeholders})
    ORDER BY r.updated_at DESC, r.id DESC LIMIT 10
  `).all(...ids) : [];
  return {
    stats: {
      assigned_students: list.pagination.total,
      weekly_completed: weeklyCompleted,
      pending_students: list.items.filter((item) => item.pending_lessons > 0).length,
      rejected_reports: list.items.reduce((sum, item) => sum + item.rejected_reports, 0),
      risk_students: list.items.filter((item) => item.risk_tags.length > 0).length,
    },
    risk_students: list.items.filter((item) => item.risk_tags.length > 0).slice(0, 10),
    recent_reports: recentReports,
  };
}

function studentDetail(user, studentId) {
  const student = studentRow(user, studentId);
  const courses = db.prepare(`
    SELECT e.id AS enrollment_id, c.id, c.title, c.status, e.enrolled_at,
           COUNT(DISTINCT l.id) AS lesson_count,
           COUNT(DISTINCT CASE WHEN lp.completed_at IS NOT NULL THEN l.id END) AS completed_lessons
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    LEFT JOIN lessons l ON l.course_id = c.id
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = e.student_id
    WHERE e.student_id = ? AND e.status = 'active'
    GROUP BY e.id, c.id ORDER BY e.enrolled_at DESC
  `).all(student.id);
  const lessons = db.prepare(`
    SELECT lp.lesson_id, lp.progress, lp.completed_at, lp.updated_at,
           l.title AS lesson_title, c.id AS course_id, c.title AS course_title,
           r.id AS report_id, r.version AS report_version, r.status AS report_status,
           r.summary, r.key_points, r.application, r.difficulties, r.next_plan, r.score, r.review_comment, r.reviewed_at
    FROM lesson_progress lp
    JOIN lessons l ON l.id = lp.lesson_id JOIN courses c ON c.id = l.course_id
    LEFT JOIN lesson_learning_reports r ON r.id = (
      SELECT latest.id FROM lesson_learning_reports latest
      WHERE latest.student_id = lp.student_id AND latest.lesson_id = lp.lesson_id
      ORDER BY latest.version DESC, latest.id DESC LIMIT 1
    )
    WHERE lp.student_id = ? ORDER BY lp.updated_at DESC
  `).all(student.id);
  const reflections = db.prepare(`
    SELECT r.id, r.lesson_id, r.difficulty, r.solution, r.improvement, r.new_question, r.reflection_version, r.entry_note, r.together_note, r.extra_note, r.report_id, r.created_at,
           l.title AS lesson_title
    FROM reflections r LEFT JOIN lessons l ON l.id = r.lesson_id
    WHERE r.student_id = ? ORDER BY r.created_at DESC LIMIT 50
  `).all(student.id);
  const works = db.prepare(`
    SELECT w.id, w.title, w.description, w.review_status, w.version, w.created_at,
           t.title AS task_title, c.title AS course_title,
           wr.comment AS review_comment, wr.suggestion AS review_suggestion
    FROM works w
    LEFT JOIN tasks t ON t.id = w.task_id
    LEFT JOIN lessons l ON l.id = t.lesson_id
    LEFT JOIN courses c ON c.id = l.course_id
    LEFT JOIN work_reviews wr ON wr.work_id = w.id
    WHERE w.student_id = ? AND w.review_status = 'approved'
    ORDER BY w.updated_at DESC LIMIT 50
  `).all(student.id);
  const timeline = db.prepare(`
    SELECT id, event_type, description, created_at
    FROM growth_records WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT 100
  `).all(student.id);
  return { student, courses, lessons, reflections, approved_works: works, timeline };
}

module.exports = { ObserverError, dashboard, students, studentDetail };
