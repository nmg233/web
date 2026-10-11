// ============================================
// 统一密码策略（AUTH-08）
// 全平台统一：长度 >= 8，且至少包含 大写字母 / 小写字母 / 数字 / 特殊字符 中的 3 类。
// 适用于：自助设置/修改密码（公开注册关闭）。新建及管理员重置的初始密码由 tempPasswordService 单独生成。
// ============================================

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_CATEGORIES_REQUIRED = 3;

const PASSWORD_POLICY_MESSAGE =
  '密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类';

/**
 * 判断密码是否满足统一强密码策略。
 */
function isStrongPassword(pwd) {
  if (!pwd || pwd.length < PASSWORD_MIN_LENGTH) return false;
  const categories = [
    /[A-Z]/.test(pwd),
    /[a-z]/.test(pwd),
    /\d/.test(pwd),
    /[^A-Za-z0-9]/.test(pwd)
  ];
  return categories.filter(Boolean).length >= PASSWORD_CATEGORIES_REQUIRED;
}

/**
 * 校验密码；不满足时返回错误信息字符串，满足时返回 null。
 */
function validatePassword(pwd) {
  return isStrongPassword(pwd) ? null : PASSWORD_POLICY_MESSAGE;
}

module.exports = {
  isStrongPassword,
  validatePassword,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_CATEGORIES_REQUIRED
};
