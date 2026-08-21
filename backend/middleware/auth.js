const jwt = require('jsonwebtoken');
const db = require('../config/database');

const STAFF_ROLES = ['admin', 'executive_mentor', 'academic_mentor', 'teacher'];
const COURSE_MANAGER_ROLES = ['admin', 'executive_mentor', 'academic_mentor'];

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

function isTeacher(role) {
  return role === 'teacher';
}

// JWT 认证中间件 - 验证 token 并将用户信息挂到 req.user
// AUTH-02：JWT 验证通过后必须查询数据库，校验：
//   1) 用户仍存在且 is_active = 1（未被禁用/删除）
//   2) 当前角色与 Token 中声明一致（角色变更则拒绝）
//   3) 所属学校/租户与 Token 中声明一致（多租户隔离）
// 任一校验失败 → 401，前端应清除本地凭证。
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录', message: '请先登录' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, req.app.get('jwt_secret'));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期', message: '请重新登录' });
    }
    return res.status(401).json({ error: '无效的认证信息', message: '请重新登录' });
  }

  // 查询数据库做实时状态校验（Fail-Closed：数据库异常必须 500，绝不放行）
  let row;
  try {
    row = db.prepare(
      'SELECT id, is_active, role, school_id, force_reset_password FROM users WHERE id = ?'
    ).get(decoded.id);
  } catch (err) {
    console.error('认证中间件数据库查询错误:', err);
    return res.status(500).json({ error: '服务器内部错误', message: '请稍后重试' });
  }

  if (!row || row.is_active !== 1) {
    return res.status(401).json({ error: '账号已被禁用或删除', message: '请重新登录' });
  }
  if (row.role !== decoded.role) {
    return res.status(401).json({ error: '账号权限已变更，请重新登录', message: '请重新登录' });
  }
  // 学校/租户隔离校验：school_id 与 Token 声明不一致则拒绝
  if ((row.school_id ?? null) !== (decoded.school_id ?? null)) {
    return res.status(401).json({ error: '账号所属学校已变更，请重新登录', message: '请重新登录' });
  }

  // 以数据库实时值覆盖 token 中的 force_reset_password，避免 token 中的过期标志误导守卫
  req.user = { ...decoded, force_reset_password: row.force_reset_password || 0 };
  next();
}

// 角色检查中间件
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录', message: '请先登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '无权限', message: '您没有权限执行此操作' });
    }
    next();
  };
}

// 强制修改密码守卫：管理员重置密码后、用户改密成功前，阻止访问业务接口
// AUTH-05：Fail-Closed —— 数据库查询异常必须返回 500，严禁 catch 后放行 next()。
function requirePasswordChanged(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录', message: '请先登录' });
  }
  let row;
  try {
    row = db.prepare('SELECT force_reset_password FROM users WHERE id = ?').get(req.user.id);
  } catch (err) {
    console.error('检查强制改密状态错误:', err);
    return res.status(500).json({ error: '服务器内部错误', message: '请稍后重试' });
  }

  // 用户不存在（例如已被删除但 token 仍有效）→ 403，不放行
  if (!row || row.force_reset_password === 1) {
    return res.status(403).json({ error: '请先修改初始密码', code: 'FORCE_RESET' });
  }
  next();
}

// 禁止管理员提交反思日志
function requireNotAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return res.status(403).json({ error: '无权限', message: '管理员不提交反思日志' });
  }
  next();
}

// 只允许学生和导师提交反思日志（排除管理员和教师）
function requireReflectionSubmittable(req, res, next) {
  if (req.user && ['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限', message: '教师和管理员不提交反思日志' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  requirePasswordChanged,
  requireNotAdmin,
  requireReflectionSubmittable,
  isStaff,
  isTeacher,
  STAFF_ROLES,
  COURSE_MANAGER_ROLES
};
