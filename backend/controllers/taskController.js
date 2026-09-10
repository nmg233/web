const db = require('../config/database');

function canManageTask(user, taskId) {
  if (user.role === 'admin') return true;
  return !!db.prepare(`
    SELECT 1 FROM tasks t
    JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE t.id = ? AND c.created_by = ?
  `).get(taskId, user.id);
}

function taskStatus(task, userId) {
  if (!userId) return 'pending';
  const work = db.prepare('SELECT review_status FROM works WHERE student_id = ? AND task_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1').get(userId, task.id);
  if (!work) return 'pending';
  if (work.review_status === 'approved') return 'completed';
  if (work.review_status === 'rejected') return 'in_progress';
  return 'submitted';
}

function taskStatusFromReview(reviewStatus) {
  if (!reviewStatus) return 'pending';
  if (reviewStatus === 'approved') return 'completed';
  if (reviewStatus === 'rejected') return 'in_progress';
  return 'submitted';
}

function taskQuery(user) {
  const userId = user.role === 'student' ? user.id : null;
  // 任务可见范围：学生=已报名课程；教师=本校学生相关课程；执行导师=自己管理课程；管理员=全部
  const scopeConditions = [];
  const scopeParams = [];
  if (user.role === 'student') {
    scopeConditions.push('EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ? AND e.status = ?)');
    scopeParams.push(user.id, 'active');
  } else if (user.role === 'teacher') {
    scopeConditions.push(`EXISTS (
      SELECT 1 FROM enrollments e2
      JOIN users s2 ON s2.id = e2.student_id
      WHERE e2.course_id = c.id AND e2.status = 'active' AND s2.school_id = ?
    )`);
    scopeParams.push(user.school_id || 0);
  } else if (user.role === 'academic_mentor') {
    scopeConditions.push('c.created_by = ?');
    scopeParams.push(user.id);
  }
  const scopeSql = scopeConditions.length ? ` AND ${scopeConditions.join(' AND ')}` : '';

  const tasks = db.prepare(`
    SELECT t.*, l.title AS lesson_title, l.course_id, c.title AS course_title,
      (SELECT review_status FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS review_status,
      (SELECT id FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS work_id
    FROM tasks t
    JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE c.status = 'published' AND t.status = 'active'${scopeSql}
    ORDER BY c.title, l.sort_order, t.sort_order, t.created_at
  `).all(userId || null, userId || null, ...scopeParams);
  return tasks.map((task) => ({ ...task, status: taskStatusFromReview(task.review_status) }));
}

exports.list = (req, res) => {
  try {
    let tasks = taskQuery(req.user);
    if (req.query.status) tasks = tasks.filter((task) => task.status === req.query.status);
    res.json({ tasks });
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
      WHERE t.id = ? AND c.status = 'published' AND t.status = 'active'
    `).get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });

    const userId = req.user.role === 'student' ? req.user.id : null;
    const enrollment = userId
      ? db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = ?').get(userId, task.course_id, 'active')
      : null;
    if (userId && !enrollment) return res.status(404).json({ error: '任务不存在' });
    if (req.user.role === 'teacher') {
      const related = db.prepare(`
        SELECT 1 FROM enrollments e
        JOIN users s ON s.id = e.student_id
        WHERE e.course_id = ? AND e.status = 'active' AND s.school_id = ? LIMIT 1
      `).get(task.course_id, req.user.school_id || 0);
      if (!related) return res.status(404).json({ error: '任务不存在' });
    }
    if (req.user.role === 'academic_mentor' && task.created_by !== req.user.id) {
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
