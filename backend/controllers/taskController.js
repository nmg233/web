const db = require('../config/database');

function taskStatus(task, userId) {
  if (!userId) return 'pending';
  const work = db.prepare('SELECT review_status FROM works WHERE student_id = ? AND task_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1').get(userId, task.id);
  if (!work) return 'pending';
  if (work.review_status === 'approved') return 'completed';
  if (work.review_status === 'rejected') return 'in_progress';
  return 'submitted';
}

function taskQuery(userId) {
  const tasks = db.prepare(`
    SELECT t.*, l.title AS lesson_title, l.course_id, c.title AS course_title,
      (SELECT review_status FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS review_status,
      (SELECT id FROM works WHERE task_id = t.id AND student_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) AS work_id
    FROM tasks t
    JOIN lessons l ON l.id = t.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE c.status = 'published'
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
      ))
    ORDER BY c.title, l.sort_order, t.sort_order, t.created_at
  `).all(userId || null, userId || null, userId || null, userId || null);
  return tasks.map((task) => ({ ...task, status: taskStatus(task, userId) }));
}

exports.list = (req, res) => {
  try {
    let tasks = taskQuery(req.user.role === 'student' ? req.user.id : null);
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
        c.description AS course_description
      FROM tasks t JOIN lessons l ON l.id = t.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE t.id = ? AND c.status = 'published'
    `).get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });

    const userId = req.user.role === 'student' ? req.user.id : null;
    const enrollment = userId
      ? db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = ?').get(userId, task.course_id, 'active')
      : null;
    if (userId && !enrollment) return res.status(404).json({ error: '任务不存在' });
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

module.exports = exports;
