const crypto = require('crypto');

// 新账号允许方案中的连字符及已有账号使用的下划线；登录不限制旧账号格式。
const USERNAME_MESSAGE = '登录账号需为 4–64 位字母、数字、下划线或连字符，并以字母或数字开头';

function resolveUsername(db, value, role) {
  const supplied = value !== undefined && value !== null && value !== '';
  const username = supplied && typeof value === 'string' ? value.trim() : '';
  if (supplied && !/^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(username)) {
    throw Object.assign(new Error(USERNAME_MESSAGE), { status: 400 });
  }
  if (supplied) {
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      throw Object.assign(new Error('登录账号已存在'), { status: 400 });
    }
    return username;
  }
  const prefix = role === 'teacher' ? 'T' : role === 'academic_mentor' ? 'M' : 'S';
  let generated;
  do {
    generated = `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
  } while (db.prepare('SELECT id FROM users WHERE username = ?').get(generated));
  return generated;
}

module.exports = { resolveUsername };
