// ============================================
// 用户信息 DTO（AUTH-01）
// 所有返回给前端的用户对象必须经过 sanitizeUser，
// 明确排除 password_hash / password / salt 等敏感字段。
// ============================================

// 允许返回给前端的字段白名单（防止未来 SELECT u.* 时误泄漏敏感列）
const PUBLIC_FIELDS = new Set([
  'id', 'username', 'real_name', 'email', 'phone', 'profile', 'avatar_url',
  'role', 'school_id', 'class_id', 'is_active', 'force_reset_password',
  'teacher_id', 'mentor_id',
  'created_at', 'updated_at',
  // 联表别名
  'school_name', 'class_name', 'grade', 'teacher_name', 'mentor_name'
]);

// 明确禁止出现在任何用户响应中的敏感字段
const SENSITIVE_FIELDS = new Set(['password_hash', 'password', 'salt', 'token', 'refresh_token']);

/**
 * 净化单个用户对象：仅保留白名单字段。
 * 支持普通对象（含 SQLite 查询结果）。
 */
function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  const out = {};
  for (const key of Object.keys(user)) {
    if (SENSITIVE_FIELDS.has(key)) continue; // 敏感字段一律剔除
    if (PUBLIC_FIELDS.has(key)) out[key] = user[key];
  }
  return out;
}

/**
 * 净化用户数组（批量）。
 */
function sanitizeUsers(users) {
  if (!Array.isArray(users)) return users;
  return users.map(sanitizeUser);
}

module.exports = { sanitizeUser, sanitizeUsers, PUBLIC_FIELDS, SENSITIVE_FIELDS };
