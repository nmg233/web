const db = require('../config/database');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function changeStatus(studentId, actorId, action, reason) {
  if (!['disable', 'archive', 'restore'].includes(action)) fail('无效的账号操作');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    fail('请填写 1–500 字的操作原因');
  }
  return db.transaction(() => {
    const actor = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(actorId);
    if (!actor || actor.role !== 'admin' || actor.is_active !== 1) fail('仅管理员可以管理学生状态', 403);
    const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
    if (!student) fail('学生不存在', 404);
    if (action === 'disable' && (student.archived_at || student.is_active !== 1)) fail('仅正常学生账号可以停用');
    if (action === 'archive' && student.archived_at) fail('该学生已经归档');
    if (action === 'restore' && !student.archived_at && student.is_active === 1) fail('该学生账号已正常启用');
    db.prepare(`UPDATE users SET is_active = ?, archived_at = ${action === 'archive' ? 'CURRENT_TIMESTAMP' : 'NULL'},
      auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(action === 'restore' ? 1 : 0, studentId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(studentId);
    db.prepare('INSERT INTO student_status_events (student_id, actor_id, action, reason) VALUES (?, ?, ?, ?)')
      .run(studentId, actorId, action, reason.trim());
    return { message: { disable: '学生账号已停用', archive: '学生账号已归档', restore: '学生账号已恢复，请重新登录' }[action] };
  })();
}

module.exports = {
  disableStudent: (id, actor, reason) => changeStatus(id, actor, 'disable', reason),
  archiveStudent: (id, actor, reason) => changeStatus(id, actor, 'archive', reason),
  restoreStudent: (id, actor, reason) => changeStatus(id, actor, 'restore', reason),
};
