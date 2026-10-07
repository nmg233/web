const db = require('../config/database');
const { resolveUsername } = require('../helpers/username');
const { generateTemporaryPassword } = require('./tempPasswordService');
const { hashPassword } = require('./passwordHashService');
const MANAGED_ROLES = ['student', 'teacher', 'academic_mentor'];
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function assertCreator(user) {
  const actor=db.prepare('SELECT role,is_active,archived_at,force_reset_password,auth_version FROM users WHERE id=?').get(user.id);
  if (!actor || actor.role!=='admin' || !actor.is_active || actor.archived_at || actor.force_reset_password || actor.auth_version!==(user.auth_version || 0)) fail('管理员会话已变化，请重新登录后创建账号',403);
}
function normalizeRole(value) {
  const t = String(value || '').trim().toLowerCase();
  const aliases = { '学生': 'student', '教师': 'teacher', '学术导师': 'academic_mentor', '执行导师': 'academic_mentor', '导师': 'academic_mentor', mentor: 'academic_mentor' };
  if (!t) return 'student'; // 旧模板兼容，但非空未知身份必须拒绝。
  if (aliases[t]) return aliases[t];
  if (MANAGED_ROLES.includes(t)) return t;
  fail(`不支持的身份：${t}；请选择学生、教师或执行导师`);
}
function organization(row, role) {
  if (role === 'academic_mentor') return { school_id: null, class_id: null, school_name: '', class_name: '' };
  let schools;
  if (row.school_id) schools = db.prepare('SELECT * FROM schools WHERE id = ?').all(row.school_id);
  else if (row.school_code) schools = db.prepare('SELECT * FROM schools WHERE account_code = ?').all(row.school_code.toUpperCase());
  else schools = db.prepare('SELECT * FROM schools WHERE name = ?').all(row.school_name || '');
  if (!schools.length) fail('学生/教师必须选择存在的学校');
  if (schools.length !== 1) fail('学校名称重名，请使用学校 ID 或唯一学校代码');
  const school = schools[0];
  let classes;
  if (row.class_id) classes = db.prepare('SELECT * FROM classes WHERE id = ? AND school_id = ?').all(row.class_id, school.id);
  else if (row.grade) classes = db.prepare('SELECT * FROM classes WHERE name = ? AND school_id = ? AND grade = ?').all(row.class_name || '', school.id, row.grade);
  else classes = db.prepare('SELECT * FROM classes WHERE name = ? AND school_id = ?').all(row.class_name || '', school.id);
  if (!classes.length) fail('班级不存在或不属于所选学校，请核对学校、班级及年级');
  if (classes.length !== 1) fail('班级名称重名，请填写年级或班级 ID');
  return { school_id: school.id, class_id: classes[0].id, school_name: school.name, class_name: classes[0].name };
}
async function createAccount(row, hooks = {}) {
  const role = normalizeRole(row.role);
  if (row.password !== undefined && row.password !== null && row.password !== '') fail('初始密码统一生成，请勿传入 password');
  const real_name = typeof row.real_name === 'string' ? row.real_name.trim() : '';
  const temp_password = generateTemporaryPassword(real_name);
  organization(row, role);
  // 哈希不在 API 主线程或数据库事务内执行。
  const password_hash = await hashPassword(temp_password);
  return db.transaction(() => {
    hooks.beforeCommit?.();
    const currentOrg = organization(row, role); // 等待期间组织可能变化，写入前重新验证。
    const username = resolveUsername(db, row.username, role, real_name, currentOrg.school_id);
    const result = db.prepare(`INSERT INTO users(username,password_hash,real_name,email,phone,profile,role,school_id,class_id,force_reset_password)
      VALUES(?,?,?,?,?,?,?,?,?,1)`).run(username,password_hash,real_name,row.email || null,row.phone || null,row.profile || null,role,currentOrg.school_id,currentOrg.class_id);
    const account = { id: Number(result.lastInsertRowid), username, real_name, role, ...currentOrg, temp_password, force_reset_password: 1, auth_version: 0 };
    hooks.onCreated?.(account);
    return account;
  })();
}
module.exports = { createAccount, normalizeRole, organization, assertCreator };
