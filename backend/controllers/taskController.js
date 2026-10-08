const db = require('../config/database');

function canManageTask(user, taskId) {
  if (user.role === 'admin') return true;
  return !!db.prepare(`
    SELECT 1 FROM tasks t
    JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE t.id = ? AND (c.created_by = ? OR EXISTS (
      SELECT 1 FROM lessons own_l WHERE own_l.course_id = c.id AND own_l.instructor_id = ?
    ))
  `).get(taskId, user.id, user.id);
}

function taskStatus(task, userId) {
  if (!userId) return 'pending';
  const work = db.prepare('SELECT review_status FROM works WHERE student_id = ? AND task_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1').get(userId, task.id);
  if (!work) return 'pending';
  if (work.review_status === 'approved') return 'completed';
  if (work.review_status === 'rejected') return 'in_progress';
  return 'submitted';
}

function taskWritable(taskId) {
  return Boolean(db.prepare(`SELECT 1 FROM tasks t JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id WHERE t.id = ? AND c.status != 'archived'
    AND l.status != 'cancelled' AND t.status != 'cancelled'`).get(taskId));
}

function taskStatusFromReview(reviewStatus) {
  if (!reviewStatus) return 'pending';
  if (reviewStatus === 'approved') return 'completed';
  if (reviewStatus === 'rejected') return 'in_progress';
  return 'submitted';
}

function taskStatusFromLearning(progress, reportStatus) {
  if (Number(progress || 0) >= 100 || reportStatus === 'approved') return 'completed';
  if (reportStatus === 'submitted') return 'submitted';
  if (Number(progress || 0) > 0 || reportStatus === 'rejected') return 'in_progress';
  return 'pending';
}

function taskQuery(user) {
  const userId = user.role === 'student' ? user.id : null;
  // 任务可见范围：学生=已报名课程；执行导师=自己管理课程；管理员=全部
  const scopeConditions = [];
  const scopeParams = [];
  if (user.role === 'student') {
    scopeConditions.push('EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ? AND e.status = ?)');
    scopeParams.push(user.id, 'active');
  } else if (user.role === 'academic_mentor') {
    scopeConditions.push('(c.created_by = ? OR EXISTS (SELECT 1 FROM lessons own_l WHERE own_l.course_id = c.id AND own_l.instructor_id = ?))');
    scopeParams.push(user.id, user.id);
  }
  const scopeSql = scopeConditions.length ? ` AND ${scopeConditions.join(' AND ')}` : '';

  const tasks = db.prepare(`
    SELECT t.*, l.title AS lesson_title, l.course_id, c.title AS course_title,
      (SELECT review_status FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS review_status,
      (SELECT id FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS work_id,
      (SELECT progress FROM lesson_progress WHERE student_id = ? AND lesson_id = l.id) AS learning_progress,
      (SELECT status FROM lesson_learning_reports WHERE student_id = ? AND lesson_id = l.id ORDER BY version DESC, id DESC LIMIT 1) AS report_status
    FROM tasks t
    JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE c.status = 'published' AND l.status != 'cancelled' AND t.status = 'active'${scopeSql}
    ORDER BY c.title, l.sort_order, t.sort_order, t.created_at
  `).all(userId || null, userId || null, userId || null, userId || null, ...scopeParams);
  return tasks.map((task) => ({
    ...task,
    status: taskStatusFromReview(task.review_status),
  }));
}

exports.list = (req, res) => {
  try {
    let tasks = taskQuery(req.user);
    if (req.query.status) tasks = tasks.filter((task) => task.status === req.query.status);
    const lessons = req.user.role === 'student' ? db.prepare(`SELECT l.id AS lesson_id, l.id, l.title, l.title AS lesson_title,
      c.id AS course_id, c.title AS course_title, COALESCE(lp.progress, 0) AS learning_progress,
      (SELECT status FROM lesson_learning_reports r WHERE r.student_id = ? AND r.lesson_id = l.id ORDER BY version DESC, id DESC LIMIT 1) AS report_status
      FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_progress lp ON lp.student_id = e.student_id AND lp.lesson_id = l.id
      WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'published' AND l.status != 'cancelled'
      ORDER BY c.id, l.sort_order, l.id`).all(req.user.id, req.user.id).map((l) => ({ ...l, kind: 'learning',
        status: taskStatusFromLearning(l.learning_progress, l.report_status),
        started: Boolean(require('../helpers/lessonVersions').boundVersion(db, req.user.id, l.id)),
        readiness: require('../helpers/lessonVersions').readiness(db, l.id) }))
      .filter((l) => {
        const state = require('../helpers/lessonVersions').courseState(db, req.user.id, l.course_id);
        return (!state.completed || state.lesson_ids.includes(l.lesson_id)) && (!req.query.status || l.status === req.query.status);
      }) : [];
    res.json({ tasks, lessons });
  } catch (err) {
    console.error('任务列表错误:', err);
    res.status(500).json({ error: '加载任务失败' });
  }
};

exports.detail = (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*, l.title AS lesson_title, l.course_id, c.title AS course_title,
        c.description AS course_description, c.created_by
      FROM tasks t JOIN lessons l ON l.id = t.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE t.id = ? AND c.status = 'published' AND l.status != 'cancelled' AND t.status = 'active'
    `).get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });

    const userId = req.user.role === 'student' ? req.user.id : null;
    const enrollment = userId
      ? db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = ?').get(userId, task.course_id, 'active')
      : null;
    if (userId && !enrollment) return res.status(404).json({ error: '任务不存在' });
    if (req.user.role === 'academic_mentor' && !canManageTask(req.user, task.id)) {
      return res.status(404).json({ error: '任务不存在' });
    }
    const works = userId ? db.prepare(`
      SELECT w.id, w.title, w.description, w.file_type,
        CASE WHEN w.file_path IS NOT NULL THEN 1 ELSE 0 END AS has_file,
        w.review_status, w.reject_reason,
        w.version, w.created_at, r.comment AS review_comment, r.suggestion AS review_suggestion
      FROM works w LEFT JOIN work_reviews r ON r.work_id = w.id
      WHERE w.task_id = ? AND w.student_id = ? ORDER BY w.version DESC
    `).all(task.id, userId) : [];
    const learning = userId ? db.prepare(`
      SELECT lp.progress,
        (SELECT status FROM lesson_learning_reports WHERE student_id = ? AND lesson_id = ? ORDER BY version DESC, id DESC LIMIT 1) AS report_status
      FROM (SELECT 1) seed
      LEFT JOIN lesson_progress lp ON lp.student_id = ? AND lp.lesson_id = ?
    `).get(userId, task.lesson_id, userId, task.lesson_id) : null;
    res.json({ task: { ...task, enrollment_id: enrollment?.id || null, status: taskStatus(task, userId) }, works });
  } catch (err) {
    console.error('任务详情错误:', err);
    res.status(500).json({ error: '加载任务详情失败' });
  }
};

exports.update = (req, res) => {
  try {
    if (!canManageTask(req.user, req.params.id)) {
      return res.status(403).json({ error: '无权管理该任务' });
    }
    if (!taskWritable(req.params.id)) return res.status(409).json({ error: '已归档或取消的任务只允许查看历史' });
    const fields = ['title', 'description', 'task_type', 'require_upload', 'deadline'];
    const sets = [];
    const values = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(field === 'require_upload'
          ? (req.body[field] === true || req.body[field] === '1' || req.body[field] === 1 ? 1 : 0)
          : req.body[field] || null);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: '没有需要更新的内容' });
    values.push(req.params.id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: '任务更新成功' });
  } catch (err) {
    console.error('更新任务错误:', err);
    res.status(500).json({ error: '更新任务失败' });
  }
};

exports.cancel = (req, res) => {
  try {
    if (!canManageTask(req.user, req.params.id)) {
      return res.status(403).json({ error: '无权管理该任务' });
    }
    if (!taskWritable(req.params.id)) return res.status(409).json({ error: '已归档或取消的任务只允许查看历史' });
    const task = db.prepare('SELECT id, status FROM tasks WHERE id = ?').get(req.params.id);
    if (!task || task.status === 'cancelled') return res.status(400).json({ error: '任务不存在或已取消' });
    const work = db.prepare('SELECT 1 FROM works WHERE task_id = ? LIMIT 1').get(task.id);
    if (work) return res.status(400).json({ error: '已有作品提交的任务不能取消' });
    db.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = ?").run(task.id);
    res.json({ message: '任务已取消' });
  } catch (err) {
    console.error('取消任务错误:', err);
    res.status(500).json({ error: '取消任务失败' });
  }
};

module.exports = exports;
