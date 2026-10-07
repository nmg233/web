const db = require('../config/database');
function fail(message, status=400) { throw Object.assign(new Error(message), {status}); }
function changeStatus(userId, actorId, action, reason) {
  if (!['disable','restore'].includes(action)) fail('教师/导师仅支持停用或恢复');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) fail('请填写 1–500 字的操作原因');
  return db.transaction(() => {
    const actor=db.prepare('SELECT role,is_active FROM users WHERE id=?').get(actorId);
    if (!actor || actor.role !== 'admin' || !actor.is_active) fail('仅管理员可管理账号状态',403);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (!user || !['teacher','academic_mentor'].includes(user.role)) fail('教师或导师不存在',404);
    if (action==='disable' && !user.is_active) fail('账号已停用');
    if (action==='restore' && user.is_active && !user.archived_at) fail('账号已启用');
    db.prepare('UPDATE users SET is_active=?,archived_at=NULL,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(action==='restore'?1:0,userId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id=?').run(userId);
    db.prepare('INSERT INTO account_status_events(user_id,actor_id,action,reason) VALUES(?,?,?,?)').run(userId,actorId,action,reason.trim());
    return {message:action==='restore'?'账号已恢复，请重新登录':'账号已停用，旧会话已撤销'};
  })();
}
module.exports={changeStatus};
