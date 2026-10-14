const db = require('../config/database');

// 学生端「使用指南」弹窗状态只属于当前账号：按 student_id 记录永久关闭。
// 关闭记录不随设备或浏览器缓存变化，也不影响任何学习数据。
function status(req, res) {
  const row = db.prepare('SELECT dismissed_at FROM student_guide_dismissals WHERE student_id = ?').get(req.user.id);
  res.json({ dismissed: !!row, dismissedAt: row ? row.dismissed_at : null });
}

function dismiss(req, res) {
  const body = req.body;
  if (body && Object.keys(body).length) {
    return res.status(400).json({ error: '关闭弹窗只需提交空请求体。', code: 'INVALID_BODY' });
  }
  // 首次关闭时间保持不变；重复点击不刷新时间戳。
  db.prepare('INSERT INTO student_guide_dismissals(student_id) VALUES(?) ON CONFLICT(student_id) DO NOTHING').run(req.user.id);
  const row = db.prepare('SELECT dismissed_at FROM student_guide_dismissals WHERE student_id = ?').get(req.user.id);
  res.json({ dismissed: true, dismissedAt: row.dismissed_at });
}

module.exports = { status, dismiss };
