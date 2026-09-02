const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { isStrongPassword } = require('../helpers/passwordPolicy');

const PUBLIC_ROLES = ['student'];
const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_IN, 10) || 7; // 刷新令牌有效期（天）
// AUTH-09 补偿措施：Access Token 有效期缩短至 15 分钟（可通过 JWT_ACCESS_EXPIRES_IN 配置）
const ACCESS_TOKEN_EXPIRES_MIN = parseInt(process.env.JWT_ACCESS_EXPIRES_IN, 10) || 15;

function generateToken(user, secret) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      role: user.role,
      school_id: user.school_id,
      class_id: user.class_id,
      force_reset_password: user.force_reset_password || 0
    },
    secret,
    { expiresIn: `${ACCESS_TOKEN_EXPIRES_MIN}m` }
  );
}

// AUTH-03：撤销用户所有 Refresh Token（改密 / 重置密码后调用）
function revokeAllRefreshTokens(userId) {
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

// 刷新令牌：随机串 + SHA-256 哈希入库（只存哈希，不存明文）
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, hashToken(raw), expiresAt);
  return raw;
}

// 清理已过期的刷新令牌，防止表无限增长
function cleanupExpiredRefreshTokens() {
  db.prepare('DELETE FROM refresh_tokens WHERE expires_at < datetime(\'now\')').run();
}
// 生成临时密码：6 位小写字母+数字（如 abc123），使用密码学安全随机数 crypto.randomInt
function generateTemporaryPassword() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'; // 36 个字符（10 数字 + 26 小写字母）
  let pwd = '';
  for (let i = 0; i < 6; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)];
  }
  return pwd;
}

// 自助修改密码限流：每用户每分钟最多 5 次尝试（内存实现，单实例适用）
const CHANGE_PWD_MAX_ATTEMPTS = 5;
const CHANGE_PWD_WINDOW_MS = 60 * 1000;
const changePwdAttempts = new Map(); // userId -> number[]（最近尝试时间戳）

function isChangePwdRateLimited(userId) {
  const now = Date.now();
  const list = (changePwdAttempts.get(userId) || []).filter((t) => now - t < CHANGE_PWD_WINDOW_MS);
  if (list.length >= CHANGE_PWD_MAX_ATTEMPTS) {
    changePwdAttempts.set(userId, list);
    return true;
  }
  list.push(now);
  changePwdAttempts.set(userId, list);
  return false;
}
// 获取学校列表（注册用）
exports.getSchools = (req, res) => {
  try {
    const schools = db.prepare('SELECT id, name FROM schools ORDER BY name').all();
    res.json({ schools });
  } catch (err) {
    console.error('获取学校列表错误:', err);
    res.status(500).json({ error: '获取学校列表失败' });
  }
};

// 获取班级列表
exports.getClasses = (req, res) => {
  try {
    const { school_id } = req.query;
    let classes = [];
    if (school_id) {
      classes = db.prepare('SELECT id, name, grade FROM classes WHERE school_id = ? ORDER BY grade, name').all(school_id);
    }
    res.json({ classes });
  } catch (err) {
    console.error('获取班级列表错误:', err);
    res.status(500).json({ error: '获取班级列表失败' });
  }
};

// 处理登录 → 返回 JWT
exports.login = (req, res) => {
  try {
    const realName = String(req.body.real_name || '').trim();
    const password = req.body.password;
    if (!realName || !password) {
      return res.status(400).json({ error: '请输入姓名和密码' });
    }

    const users = db.prepare(
      'SELECT id, username, password_hash, real_name, role, school_id, class_id, force_reset_password FROM users WHERE real_name = ? AND is_active = 1'
    ).all(realName);

    if (users.length === 0) {
      return res.status(401).json({ error: '姓名或密码错误' });
    }
    if (users.length > 1) {
      return res.status(401).json({ error: '存在重名用户，请联系管理员' });
    }

    const user = users[0];
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: '姓名或密码错误' });
    }

    const token = generateToken(user, req.app.get('jwt_secret'));
    cleanupExpiredRefreshTokens();
    const refresh_token = issueRefreshToken(user.id);

    res.json({
      message: `欢迎回来，${user.real_name}！`,
      token,
      refresh_token,
      forceResetPassword: !!user.force_reset_password,
      user: {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        role: user.role,
        school_id: user.school_id,
        class_id: user.class_id,
        force_reset_password: user.force_reset_password || 0
      }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
};

// 处理注册
exports.register = (req, res) => {
  try {
    // 注册总开关：默认关闭，需显式设置 ALLOW_REGISTRATION=true 才开放学生自助注册
    if (process.env.ALLOW_REGISTRATION !== 'true') {
      return res.status(403).json({ error: '注册暂未开放', message: '请联系管理员开通账号' });
    }

    const { password, password_confirm, email, role, phone, school_id, class_id } = req.body;
    const real_name = String(req.body.real_name || '').trim();

    if (!PUBLIC_ROLES.includes(role)) {
      return res.status(400).json({ error: '公开注册仅支持学生账号' });
    }

    if (!real_name) {
      return res.status(400).json({ error: '请填写真实姓名' });
    }

    // AUTH-08：统一密码策略（>=8 位，且包含大写/小写/数字/特殊字符中的至少 3 类）
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: '密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类'
      });
    }
    if (password !== password_confirm) {
      return res.status(400).json({ error: '两次密码输入不一致' });
    }

    if (!phone || !/^\d{11}$/.test(phone)) {
      return res.status(400).json({ error: '请输入正确的11位手机号' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请输入正确的邮箱地址' });
    }

    if (role === 'student' && (!school_id || !class_id)) {
      return res.status(400).json({ error: '学生必须选择学校和班级' });
    }

    if (class_id) {
      const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND school_id = ?').get(class_id, school_id);
      if (!cls) {
        return res.status(400).json({ error: '所选班级不属于当前学校' });
      }
    }

    const existing = db.prepare('SELECT id FROM users WHERE real_name = ?').get(real_name);
    if (existing) {
      return res.status(400).json({ error: '该姓名已被使用，请换一个' });
    }

    const username = `user${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const password_hash = bcrypt.hashSync(password, 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, role, school_id, class_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(username, password_hash, real_name, email || null, phone, role, school_id || null, class_id || null);

    res.json({ message: '注册成功，请登录' });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
};

// 获取当前用户信息
exports.me = (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, real_name, email, phone, role, school_id, class_id, avatar_url, is_active, force_reset_password FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取学校和班级名称
    let school_name = null, class_name = null;
    if (user.school_id) {
      const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(user.school_id);
      if (school) school_name = school.name;
    }
    if (user.class_id) {
      const cls = db.prepare('SELECT name, grade FROM classes WHERE id = ?').get(user.class_id);
      if (cls) class_name = cls.name;
    }

    res.json({ user: { ...user, school_name, class_name } });
  } catch (err) {
    console.error('获取用户信息错误:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
};

// 无感刷新：用 refresh_token 换取新的 access token + 新的 refresh_token
exports.refresh = (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: '缺少 refresh_token' });
    }

    const record = db.prepare(`
      SELECT rt.id AS rt_id, rt.expires_at, u.id, u.username, u.real_name, u.role,
             u.school_id, u.class_id, u.is_active, u.force_reset_password
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = ?
    `).get(hashToken(refresh_token));

    if (!record || record.is_active !== 1) {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.rt_id);
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }

    // 刷新令牌一次性使用：撤销旧令牌，签发新的一对
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.rt_id);
    const token = generateToken(record, req.app.get('jwt_secret'));
    const newRefresh = issueRefreshToken(record.id);

    res.json({
      message: '刷新成功',
      token,
      refresh_token: newRefresh,
      user: {
        id: record.id,
        username: record.username,
        real_name: record.real_name,
        role: record.role,
        school_id: record.school_id,
        class_id: record.class_id,
        force_reset_password: record.force_reset_password || 0
      }
    });
  } catch (err) {
    console.error('刷新令牌错误:', err);
    res.status(500).json({ error: '刷新失败，请稍后重试' });
  }
};

// 退出登录：撤销对应的刷新令牌
exports.logout = (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(refresh_token));
    }
    res.json({ message: '已退出登录' });
  } catch (err) {
    console.error('退出登录错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 管理员重置用户密码（仅 admin 调用；临时密码通过响应返回给管理员线下转告，严禁写日志）
exports.adminResetPassword = (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: '缺少目标用户' });
    }
    const target = db.prepare('SELECT id, real_name, role FROM users WHERE id = ?').get(user_id);
    if (!target) {
      return res.status(400).json({ error: '用户不存在' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: '不能重置管理员自己的密码' });
    }

    const tempPassword = generateTemporaryPassword();
    const password_hash = bcrypt.hashSync(tempPassword, 10);
    db.prepare(
      'UPDATE users SET password_hash = ?, force_reset_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(password_hash, user_id);

    // AUTH-03：重置密码后撤销该用户所有 Refresh Token，防止旧令牌换取新 Access Token
    revokeAllRefreshTokens(user_id);

    // 注意：此处不得 console.log 临时密码
    res.json({
      message: `已重置 ${target.real_name} 的密码，请将临时密码线下告知用户`,
      temp_password: tempPassword,
      force_reset_password: 1
    });
  } catch (err) {
    console.error('管理员重置密码错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 用户自助修改密码（需登录；校验旧密码 + 强密码策略 + 每分钟限 5 次）
exports.changePassword = (req, res) => {
  try {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: '请填写原密码和新密码' });
    }
    if (isChangePwdRateLimited(userId)) {
      return res.status(429).json({ error: '尝试次数过多，请 1 分钟后再试' });
    }
    if (!isStrongPassword(new_password)) {
      return res.status(400).json({
        error: '新密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类'
      });
    }
    if (old_password === new_password) {
      return res.status(400).json({ error: '新密码不能与原密码相同' });
    }

    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId);
    if (!user || !bcrypt.compareSync(old_password, user.password_hash)) {
      return res.status(400).json({ error: '原密码不正确' });
    }

    const password_hash = bcrypt.hashSync(new_password, 10);
    db.prepare(
      'UPDATE users SET password_hash = ?, force_reset_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(password_hash, userId);

    // AUTH-03：修改密码后撤销该用户所有 Refresh Token，已泄漏的旧 Refresh Token 立即失效
    revokeAllRefreshTokens(userId);

    changePwdAttempts.delete(userId); // 成功后清空该用户尝试计数
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};
