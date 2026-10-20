const db = require('../config/database');
const learningGate = require('../helpers/learningGate');
const versions = require('../helpers/lessonVersions');

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
  return {sql:require('./teacherObservations').sql(user,`${alias}.id`),params:[]};
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

function students(user, query = {}, all = false) {
  const { page, pageSize, offset } = pagination(query);
  const scope = scopeSql(user, 's');
  const where = ["s.role = 'student'", 's.is_active = 1', 's.archived_at IS NULL', scope.sql];
  const params = [...scope.params];
  for (const key of ['school_id', 'class_id']) {
    if (query[key]) { where.push(`s.${key} = ?`); params.push(Number(query[key])); }
  }
  if (String(query.search || '').trim()) {
    const keyword = `%${String(query.search).trim().slice(0, 100)}%`;
    where.push('(s.real_name LIKE ? OR s.username LIKE ?)');
    params.push(keyword, keyword);
  }
  if (query.course_id) {
    where.push(`EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.course_id = ? AND e.status = 'active' ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','e.course_id'):''})`);
    params.push(Number(query.course_id));
  }
  const statusSql = {
    not_started: `NOT EXISTS (SELECT 1 FROM student_lesson_versions v JOIN lessons l ON l.id=v.lesson_id
      JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id AND e.student_id=v.student_id
      WHERE v.student_id = s.id ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','c.id'):''} AND e.status='active' AND l.status!='cancelled' AND c.status='published'
      ${query.course_id ? 'AND c.id = ?' : ''})`,
    learning: `EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','e.course_id'):''} AND e.status = 'active'
      AND EXISTS (SELECT 1 FROM courses c WHERE c.id=e.course_id AND c.status='published')
      ${query.course_id ? 'AND e.course_id = ?' : ''}
      AND NOT EXISTS (SELECT 1 FROM enrollment_completions ec WHERE ec.enrollment_id = e.id))`,
    completed: `EXISTS (SELECT 1 FROM enrollments e JOIN enrollment_completions ec ON ec.enrollment_id = e.id WHERE e.student_id = s.id ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','e.course_id'):''} AND e.status = 'active' ${query.course_id ? 'AND e.course_id = ?' : ''})`,
    revision: `EXISTS (SELECT 1 FROM lesson_learning_reports r JOIN lessons l ON l.id=r.lesson_id
      JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id AND e.student_id=r.student_id
      WHERE r.student_id = s.id ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','c.id'):''} AND l.status!='cancelled' AND c.status='published' AND e.status='active'
      ${query.course_id ? 'AND c.id = ?' : ''} AND (r.status = 'rejected'
      OR EXISTS (SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id))
      AND r.id = (SELECT last.id FROM lesson_learning_reports last WHERE last.student_id = s.id AND last.lesson_id = r.lesson_id ORDER BY version DESC,id DESC LIMIT 1))`,
  };
  if (statusSql[query.learning_status]) { where.push(statusSql[query.learning_status]); if (query.course_id) params.push(Number(query.course_id)); }
  const whereSql = where.join(' AND ');
  const selectedCourse = Number.isSafeInteger(Number(query.course_id)) ? Number(query.course_id) : 0;
  const activityScope = (query.course_id ? `AND l.course_id = ${selectedCourse}` : '')+(user.role==='teacher'?' AND '+require('./teacherObservations').sql(user,'s.id','l.course_id'):'');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM users s WHERE ${whereSql}`).get(...params).count;
  const items = db.prepare(`
    SELECT s.id, s.username, s.real_name, s.avatar_url,
           school.name AS school_name, cls.name AS class_name,
           (SELECT MAX(activity_at) FROM (
             SELECT MAX(a.submitted_at) AS activity_at FROM card_exercise_attempts a JOIN card_exercises x ON x.id=a.exercise_id JOIN knowledge_cards k ON k.id=x.card_id JOIN lessons l ON l.id=k.lesson_id WHERE a.student_id = s.id ${activityScope}
             UNION ALL SELECT MAX(r.submitted_at) FROM lesson_learning_reports r JOIN lessons l ON l.id=r.lesson_id WHERE r.student_id = s.id ${activityScope}
             UNION ALL SELECT MAX(w.created_at) FROM works w JOIN tasks t ON t.id=w.task_id JOIN lessons l ON l.id=t.lesson_id WHERE w.student_id = s.id ${activityScope}
             UNION ALL SELECT MAX(p.updated_at) FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.student_id=s.id ${activityScope}
           )) AS last_learning_at,
           (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id
            WHERE lp.student_id = s.id AND lp.completed_at >= datetime('now', '-30 days') ${activityScope}) AS completed_30d,
           (SELECT COUNT(*) FROM lesson_progress lp
            JOIN lessons l ON l.id = lp.lesson_id
            WHERE lp.student_id = s.id AND lp.completed_at IS NULL AND lp.progress > 0) AS pending_lessons,
           (SELECT COUNT(*) FROM lesson_learning_reports r
            WHERE r.student_id = s.id AND (r.status = 'rejected'
              OR EXISTS (SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id))
            AND r.id=(SELECT latest.id FROM lesson_learning_reports latest WHERE latest.student_id=r.student_id AND latest.lesson_id=r.lesson_id ORDER BY latest.version DESC,latest.id DESC LIMIT 1)) AS rejected_reports,
           (SELECT CASE WHEN EXISTS(SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id)
             THEN 'rejected' ELSE r.status END FROM lesson_learning_reports r JOIN lessons l ON l.id=r.lesson_id WHERE r.student_id = s.id ${activityScope}
            ORDER BY r.updated_at DESC, r.id DESC LIMIT 1) AS latest_report_status
    FROM users s
    LEFT JOIN schools school ON school.id = s.school_id
    LEFT JOIN classes cls ON cls.id = s.class_id
    WHERE ${whereSql}
    ORDER BY last_learning_at DESC, s.id DESC
    ${all ? '' : 'LIMIT ? OFFSET ?'}
  `).all(...params, ...(all ? [] : [pageSize, offset])).map((row) => {
    const courseRows = db.prepare(`SELECT c.id,c.title,c.status FROM enrollments e JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=? AND e.status='active' ${query.course_id ? 'AND c.id=?' : ''}`).all(row.id, ...(query.course_id ? [Number(query.course_id)] : [])).filter(c=>user.role!=='teacher'||require('./teacherObservations').can(user,row.id,c.id));
    const summaries = courseRows.map((course) => {
      const completion = versions.courseState(db, row.id, course.id);
      const lessons = db.prepare("SELECT id,title,status FROM lessons WHERE course_id=? ORDER BY sort_order,id").all(course.id)
        .filter((l) => completion.lesson_ids.includes(l.id))
        .map((l) => ({ ...l, ...learningGate.getLessonLearningState(row.id, l.id) }));
      const actionable = !completion.completed && course.status === 'published' ? lessons.filter((l) => l.status !== 'cancelled') : [];
      const current = actionable.find((l) => !l.completed);
      return { ...course, completion, lesson_count: lessons.length,
        completed_lessons: completion.completed ? lessons.length : lessons.filter((l) => l.completed).length,
        current_lesson: current?.title || null, current_stage: current?.status || null,
        pending_lessons: actionable.filter((l) => l.percent > 0 && !l.completed).length,
        pending_reports: actionable.filter((l) => l.report_status === 'submitted').length,
        missing_reports: actionable.filter((l) => l.report_unlocked && !['submitted','approved'].includes(l.report_status)).length,
        rejected_reports: actionable.filter((l) => l.report_status === 'rejected').length };
    });
    const item = { ...row, courses: summaries,
      pending_lessons: summaries.reduce((n, c) => n + c.pending_lessons, 0),
      rejected_reports: summaries.reduce((n, c) => n + c.rejected_reports, 0) };
    return { ...item,
    risk_tags: [
      ...(item.pending_lessons >= 2 ? ['连续课时未完成'] : []),
      ...(item.rejected_reports >= 2 ? ['多份报告待修改'] : []),
    ],
  }; });
  const scoped = db.prepare(`SELECT DISTINCT s.school_id, school.name AS school_name, s.class_id, cls.name AS class_name,
    c.id AS course_id, c.title AS course_title FROM users s
    LEFT JOIN schools school ON school.id = s.school_id LEFT JOIN classes cls ON cls.id = s.class_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' LEFT JOIN courses c ON c.id = e.course_id
    WHERE s.role = 'student' AND s.is_active = 1 AND s.archived_at IS NULL AND ${scope.sql} ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'s.id','c.id'):''}`).all(...scope.params);
  const options = (id, name) => [...new Map(scoped.filter((s) => s[id]).map((s) => [s[id], { value: s[id], label: s[name], school_id: s.school_id }])).values()];
  return { items, pagination: { page, pageSize, total }, filters: {
    schools: options('school_id','school_name'), classes: options('class_id','class_name'), courses: options('course_id','course_title'),
  } };
}

function dashboard(user) {
  const list = students(user, {}, true);
  const ids = list.items.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const weeklyCompleted = ids.length ? db.prepare(`
    SELECT COUNT(*) AS count FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id
    WHERE p.student_id IN (${placeholders}) AND p.completed_at >= datetime('now', '-7 days') ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'p.student_id','l.course_id'):''}
  `).get(...ids).count : 0;
  const recentReports = ids.length ? db.prepare(`
    SELECT r.id, r.student_id, CASE WHEN EXISTS(SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id)
             THEN 'rejected' ELSE r.status END AS status, r.version, r.submitted_at,
           s.real_name AS student_name, l.title AS lesson_title, c.title AS course_title
    FROM lesson_learning_reports r
    JOIN users s ON s.id = r.student_id
    JOIN lessons l ON l.id = r.lesson_id JOIN courses c ON c.id = l.course_id
    WHERE r.student_id IN (${placeholders}) ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'r.student_id','c.id'):''}
      AND r.id=(SELECT latest.id FROM lesson_learning_reports latest WHERE latest.student_id=r.student_id AND latest.lesson_id=r.lesson_id ORDER BY latest.version DESC,latest.id DESC LIMIT 1)
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
    LEFT JOIN lessons l ON l.course_id = c.id AND l.status != 'cancelled'
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = e.student_id
    WHERE e.student_id = ? AND e.status = 'active' ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'e.student_id','c.id'):''}
    GROUP BY e.id, c.id ORDER BY e.enrolled_at DESC
  `).all(student.id).map((course) => {
    const completion = versions.courseState(db, student.id, course.id);
    const lessons = db.prepare('SELECT id, title, status FROM lessons WHERE course_id = ? ORDER BY sort_order, id').all(course.id)
      .filter((l) => completion.lesson_ids.includes(l.id));
    return { ...course, completion, lessons, lesson_count: lessons.length,
      completed_lessons: completion.completed ? lessons.length : lessons.filter((l) => learningGate.getLessonLearningState(student.id, l.id).completed).length };
  });
  const lessons = db.prepare(`
    SELECT l.id AS lesson_id, COALESCE(lp.progress, 0) AS progress, lp.completed_at, lp.updated_at,
           l.title AS lesson_title, c.id AS course_id, c.title AS course_title,
           r.id AS report_id, r.version AS report_version, r.status AS report_status,
           r.summary, r.key_points, r.application, r.difficulties, r.next_plan, r.score, r.review_comment, r.reviewed_at
    FROM enrollments enrollment JOIN courses c ON c.id = enrollment.course_id
    JOIN lessons l ON l.course_id = c.id
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = enrollment.student_id
    LEFT JOIN lesson_learning_reports r ON r.id = (
      SELECT latest.id FROM lesson_learning_reports latest
      WHERE latest.student_id = enrollment.student_id AND latest.lesson_id = l.id
      ORDER BY latest.version DESC, latest.id DESC LIMIT 1
    )
    WHERE enrollment.student_id = ? AND enrollment.status = 'active' ORDER BY c.id, l.sort_order, l.id
  `).all(student.id).filter(l=>user.role!=='teacher'||require('./teacherObservations').can(user,student.id,l.course_id)).filter((l) => {
    const state = versions.courseState(db, student.id, l.course_id);
    return state.lesson_ids.includes(l.lesson_id);
  }).map((l) => ({ ...l, progress: learningGate.getLessonLearningState(student.id,l.lesson_id).percent, original_report_status:l.report_status,
    report_status:learningGate.getLessonLearningState(student.id,l.lesson_id).report_status,
    stages: learningGate.getLessonLearningState(student.id, l.lesson_id),
    content_version: versions.boundVersion(db, student.id, l.lesson_id)?.id || null,
    cards: versions.studentCards(db, student.id, l.lesson_id).map((c) => ({
      id: c.id, title: c.title, completed_at: c.completed_at, best_score: c.best_score,
      answered: c.exercises.filter((e) => e.attempt).length, exercise_count: c.exercises.length,
    })) }));
  const reflections = db.prepare(`
    SELECT r.id, r.lesson_id, r.difficulty, r.solution, r.improvement, r.new_question, r.reflection_version, r.entry_note, r.together_note, r.extra_note, r.report_id, r.created_at,
           l.title AS lesson_title
    FROM reflections r LEFT JOIN lessons l ON l.id = r.lesson_id
    WHERE r.student_id = ? ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'r.student_id','l.course_id'):''} ORDER BY r.created_at DESC LIMIT 50
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
    WHERE w.student_id = ? AND w.review_status = 'approved' ${user.role==='teacher'?'AND '+require('./teacherObservations').sql(user,'w.student_id','c.id'):''}
    ORDER BY w.updated_at DESC LIMIT 50
  `).all(student.id);
  const timeline = db.prepare(`
    SELECT id, event_type, description, created_at
    FROM growth_records WHERE student_id = ? ${user.role==='teacher'?`AND work_id IN(SELECT w.id FROM works w JOIN enrollments e ON e.id=w.enrollment_id WHERE ${require('./teacherObservations').sql(user,'w.student_id','e.course_id')} AND w.review_status='approved')`:''} ORDER BY created_at DESC, id DESC LIMIT 100
  `).all(student.id);
  return { student, courses, lessons, reflections, approved_works: works, timeline };
}

module.exports = { ObserverError, dashboard, students, studentDetail };
