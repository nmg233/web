const { pinyin } = require('pinyin-pro');
const { namePinyin } = require('./namePinyin');

// 新账号允许方案中的连字符及已有账号使用的下划线；登录不限制旧账号格式。
const USERNAME_MESSAGE = '登录账号需为 4–160 位字母、数字、下划线或连字符，并以字母或数字开头';

function ensureSchoolCode(db, schoolId) {
  const school = db.prepare('SELECT name, account_code FROM schools WHERE id = ?').get(schoolId);
  if (!school) throw Object.assign(new Error('学校不存在'), { status: 400 });
  if (school.account_code) {
    db.prepare('INSERT OR IGNORE INTO account_school_codes(school_id,code) VALUES(?,?)').run(schoolId,school.account_code);
    return school.account_code;
  }
  const base = pinyin(school.name, { pattern: 'first', toneType: 'none', type: 'array' })
    .join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!base) throw Object.assign(new Error('学校名称无法生成缩写，请先设置学校代码'), { status: 400 });
  if (base.length > 64) throw Object.assign(new Error('学校缩写超过 64 位，请核对学校名称；不会自动截断'), { status: 400 });
  let code = base, suffix = 1;
  while (code === 'BUAA' || db.prepare('SELECT id FROM schools WHERE account_code = ?').get(code) || db.prepare('SELECT school_id FROM account_school_codes WHERE code=?').get(code)) code = `${base}${++suffix}`;
  db.prepare('INSERT INTO account_school_codes(school_id,code) VALUES(?,?)').run(schoolId,code);
  db.prepare('UPDATE schools SET account_code = ? WHERE id = ?').run(code, schoolId);
  return code;
}

function resolveUsername(db, value, role, realName, schoolId) {
  const supplied = value !== undefined && value !== null && value !== '';
  const username = supplied && typeof value === 'string' ? value.trim() : '';
  if (supplied && !/^[A-Za-z0-9][A-Za-z0-9_-]{3,159}$/.test(username)) {
    throw Object.assign(new Error(USERNAME_MESSAGE), { status: 400 });
  }
  if (supplied) {
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      throw Object.assign(new Error('登录账号已存在'), { status: 400 });
    }
    if (realName) {
      const platform = ['academic_mentor', 'admin'].includes(role);
      if (!platform) ensureSchoolCode(db, schoolId);
      db.prepare(`INSERT INTO account_sequences(scope,role,last_value) VALUES(?,?,1)
        ON CONFLICT(scope,role) DO UPDATE SET last_value=last_value+1`).run(platform ? 'platform:BUAA' : `school:${schoolId}`, role);
    }
    return username;
  }
  return db.transaction(() => {
    const platform = ['academic_mentor', 'admin'].includes(role);
    const prefix = platform ? 'BUAA' : ensureSchoolCode(db, schoolId);
    const scope = platform ? 'platform:BUAA' : `school:${schoolId}`;
    const englishRole = role === 'academic_mentor' ? 'mentor' : role;
    const fullName = namePinyin(realName);
    let generated;
    do {
      const next = db.prepare(`INSERT INTO account_sequences(scope, role, last_value) VALUES (?, ?, 1)
        ON CONFLICT(scope,role) DO UPDATE SET last_value = last_value + 1 RETURNING last_value`).get(scope, role).last_value;
      generated = `${prefix}_${englishRole}_${fullName}_${next}`;
    } while (db.prepare('SELECT id FROM users WHERE username = ?').get(generated));
    if (generated.length > 160) throw Object.assign(new Error('生成账号超过 160 位，请缩短学校代码或姓名'), { status: 400 });
    return generated;
  })();
}

module.exports = { resolveUsername, ensureSchoolCode };
