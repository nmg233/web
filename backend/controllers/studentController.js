const bcrypt = require('bcryptjs');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { isStaff, isTeacher } = require('../middleware/auth');
const { buildUserTree } = require('../helpers/userTree');
const { sanitizeUser } = require('../helpers/userDto');
const { isStrongPassword } = require('../helpers/passwordPolicy');

const USERNAME_RE = /^[a-zA-Z0-9]+$/;
const MANAGED_ROLES = ['student', 'teacher', 'executive_mentor'];

function isValidUsername(username) {
  return username && username.length >= 6 && USERNAME_RE.test(username);
}

function deleteUserWithWorks(userId) {
  const works = db.prepare('SELECT file_path FROM works WHERE student_id = ?').all(userId);
  for (const work of works) {
    if (work.file_path) {
      try { fs.unlinkSync(work.file_path); } catch (e) { /* 文件可能已删除 */ }
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

// 学生列表
exports.list = (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const tree = buildUserTree({ search: req.query.search || '', includeExecutive: true });
      const schools = db.prepare('SELECT id, name FROM schools ORDER BY name').all();
      return res.json({ title: '用户管理', tree, schools, filters: req.query });
    }

    let sql = `
      SELECT u.id, u.username, u.real_name, u.email, u.phone, u.is_active,
             s.name as school_name, c.name as class_name, c.grade
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE u.role = 'student'
    `;
    const params = [];

    if (isTeacher(req.user.role)) {
      sql += ' AND u.school_id = ?';
      params.push(req.user.school_id || 0);
    }

    if (req.query.school_id) { sql += ' AND u.school_id = ?'; params.push(req.query.school_id); }
    if (req.query.class_id) { sql += ' AND u.class_id = ?'; params.push(req.query.class_id); }
    if (req.query.search) {
      sql += ' AND (u.real_name LIKE ? OR u.username LIKE ?)';
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    sql += ' ORDER BY u.created_at DESC';

    const students = db.prepare(sql).all(...params);
    const schools = isTeacher(req.user.role)
      ? db.prepare('SELECT id, name FROM schools WHERE id = ? ORDER BY name').all(req.user.school_id || 0)
      : db.prepare('SELECT id, name FROM schools ORDER BY name').all();

    res.json({ title: '学生管理', students, schools, filters: req.query });
  } catch (err) {
    console.error('学生列表错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 添加学生页面
exports.showCreate = (req, res) => {
  const schools = isTeacher(req.user.role)
    ? db.prepare('SELECT id, name FROM schools WHERE id = ? ORDER BY name').all(req.user.school_id || 0)
    : db.prepare('SELECT id, name FROM schools ORDER BY name').all();
  res.json({ title: '添加学生', schools, errors: [] });
};

// 添加学生
exports.create = (req, res) => {
  try {
    const { password, real_name, school_id, class_id, email, phone } = req.body;

    if (!real_name) {
      return res.status(400).json({ error: '姓名为必填项' });
    }

    if (isTeacher(req.user.role)) {
      const ownSchool = req.user.school_id;
      if (!ownSchool || Number(school_id) !== ownSchool) {
        return res.status(400).json({ error: '教师只能在本校添加学生' });
      }
      const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND school_id = ?').get(class_id, ownSchool);
      if (!cls) {
        return res.status(400).json({ error: '班级必须属于当前学校' });
      }
    }

    if (!school_id || !class_id) {
      return res.status(400).json({ error: '学校和班级为必填项' });
    }

    const nameExists = db.prepare('SELECT id FROM users WHERE real_name = ?').get(real_name);
    if (nameExists) {
      return res.status(400).json({ error: '该姓名已存在' });
    }

    const studentUsername = `student${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const studentPassword = password || 'pbl123456';
    // AUTH-08：若管理员显式设置了自定义密码，则必须满足统一强密码策略
    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        error: '密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类'
      });
    }
    const password_hash = bcrypt.hashSync(studentPassword, 10);

    // AUTH-06：创建用户默认密码统一，必须设置强制重置标志
    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, 'student', ?, ?, 1)`
    ).run(studentUsername, password_hash, real_name, email || null, phone || null,
          school_id || null, class_id || null);

    res.json({ message: `学生 ${real_name} 添加成功！默认密码: ${studentPassword}（首次登录需修改密码）` });
  } catch (err) {
    console.error('添加学生错误:', err);
    res.status(500).json({ error: '添加失败，请稍后重试' });
  }
};

// 批量导入页面
exports.showImport = (req, res) => {
  res.json({ title: '批量导入用户' });
};

// ============ 批量导入（支持 CSV / Excel 文件，也兼容 JSON） ============
const IMPORT_ROLES = ['student', 'teacher', 'executive_mentor'];
const ROLE_ALIAS = { '学生': 'student', '教师': 'teacher', '执行导师': 'executive_mentor' };

function normalizeRole(value) {
  const t = String(value || '').trim().toLowerCase();
  if (ROLE_ALIAS[t]) return ROLE_ALIAS[t];
  if (IMPORT_ROLES.includes(t)) return t;
  return 'student';
}

// 将表头/字段名归一化为内部字段
function normalizeImportRow(raw) {
  const get = (...aliases) => {
    for (const key of Object.keys(raw)) {
      const k = String(key).trim().toLowerCase();
      if (aliases.some((a) => k.includes(a.toLowerCase()))) {
        const v = String(raw[key] ?? '').trim();
        return v === '' || v === '-' ? '' : v;
      }
    }
    return '';
  };
  return {
    real_name: get('姓名', 'real_name', '真实姓名'),
    role: get('身份', '角色', 'role'),
    school_name: get('学校', 'school_name', '学校名称'),
    class_name: get('班级', 'class_name', '班级名称'),
    email: get('邮箱', 'email'),
    phone: get('手机号', '手机', 'phone', '联系电话'),
    profile: get('简介', '备注', 'profile')
  };
}

// 解析 CSV（支持带引号、含逗号的字段）
function parseCSVText(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('文件至少需要表头和一行数据');
  const splitLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const raw = {};
    headers.forEach((h, idx) => { raw[h] = vals[idx] ?? ''; });
    rows.push(normalizeImportRow(raw));
  }
  return rows;
}

// 解析上传文件为行数据
function parseImportFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv') {
    return parseCSVText(file.buffer.toString('utf8'));
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rawRows.map((r) => normalizeImportRow(r));
  }
  throw new Error('仅支持 .csv / .xlsx / .xls 文件');
}

// 批量导入
exports.import = (req, res) => {
  try {
    // 1. 解析来源：文件 或 JSON(data)
    let rows;
    if (req.file) {
      rows = parseImportFile(req.file);
    } else if (req.body.data) {
      const parsed = JSON.parse(req.body.data);
      rows = parsed.map((s) => normalizeImportRow(s));
    } else {
      return res.status(400).json({ error: '请上传 .csv / .xlsx 文件或提供 data' });
    }

    const password_hash = bcrypt.hashSync('pbl123456', 10);
    // AUTH-06：批量导入默认密码统一 pbl123456，强制首次登录修改密码
    const insert = db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, profile, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const nameExists = db.prepare('SELECT id FROM users WHERE real_name = ?');
    const findSchool = db.prepare('SELECT id FROM schools WHERE name = ?');
    const findClass = db.prepare('SELECT id FROM classes WHERE name = ? AND school_id = ?');

    const result = db.transaction(() => {
      let imported = 0;
      const errors = [];
      let seq = 0;
      for (const row of rows) {
        seq++;
        const real_name = row.real_name;
        if (!real_name) { errors.push(`第 ${seq} 行：缺少姓名`); continue; }
        const role = normalizeRole(row.role);
        let school_id = null, class_id = null;
        if (['student', 'teacher'].includes(role)) {
          const school = row.school_name ? findSchool.get(row.school_name) : null;
          if (!row.school_name || !school) {
            errors.push(`第 ${seq} 行「${real_name}」：学生/教师必须选择存在的学校（当前：${row.school_name || '空'}）`);
            continue;
          }
          school_id = school.id;
          const cls = row.class_name ? findClass.get(row.class_name, school.id) : null;
          if (!row.class_name || !cls) {
            errors.push(`第 ${seq} 行「${real_name}」：学校「${row.school_name}」下不存在班级「${row.class_name || '空'}」`);
            continue;
          }
          class_id = cls.id;
        }
        if (nameExists.get(real_name)) {
          errors.push(`第 ${seq} 行「${real_name}」：姓名已存在`);
          continue;
        }
        const prefix = role === 'teacher' ? 'teacher' : role === 'executive_mentor' ? 'mentor' : 'student';
        const username = `${prefix}${Date.now()}${imported}${seq}${Math.floor(Math.random() * 10000)}`;
        insert.run(username, password_hash, real_name,
                   row.email || null, row.phone || null, row.profile || null,
                   role, school_id || null, class_id || null);
        imported++;
      }
      return { imported, errors };
    })();

    res.json({
      message: result.errors.length
        ? `成功导入 ${result.imported} 名用户，${result.errors.length} 条失败`
        : `成功导入 ${result.imported} 名用户`,
      imported: result.imported,
      failed: result.errors.length,
      errors: result.errors.slice(0, 20)
    });
  } catch (err) {
    console.error('批量导入错误:', err);
    res.status(400).json({ error: '导入失败：' + (err.message || '文件解析错误') });
  }
};

exports.createSchool = (req, res) => {
  try {
    const { name, description, tags, region, contact_person, contact_phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '学校名称不能为空' });
    }
    db.prepare(
      `INSERT INTO schools (name, description, tags, region, contact_person, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), description || null, tags || null, region || null,
          contact_person || null, contact_phone || null);
    res.json({ message: '学校添加成功' });
  } catch (err) {
    console.error('添加学校错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteSchool = (req, res) => {
  try {
    const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(req.params.id);
    if (!school) {
      return res.status(400).json({ error: '学校不存在' });
    }
    db.prepare('DELETE FROM schools WHERE id = ?').run(req.params.id);
    res.json({ message: '学校已删除，关联班级已删除' });
  } catch (err) {
    console.error('删除学校错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.createClass = (req, res) => {
  try {
    const { name, school_id, grade } = req.body;
    if (!name || !name.trim() || !school_id) {
      return res.status(400).json({ error: '班级名称和所属学校不能为空' });
    }
    const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(school_id);
    if (!school) {
      return res.status(400).json({ error: '所属学校不存在' });
    }
    db.prepare('INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)')
      .run(name.trim(), school_id, grade || null);
    res.json({ message: '班级添加成功' });
  } catch (err) {
    console.error('添加班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteClass = (req, res) => {
  try {
    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(req.params.id);
    if (!cls) {
      return res.status(400).json({ error: '班级不存在' });
    }
    db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
    res.json({ message: '班级已删除' });
  } catch (err) {
    console.error('删除班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.createUser = (req, res) => {
  try {
    const { password, real_name, role, school_id, class_id, email, phone, profile } = req.body;

    if (!real_name || !MANAGED_ROLES.includes(role)) {
      return res.status(400).json({ error: '姓名和身份不能为空' });
    }

    if (['student', 'teacher'].includes(role) && (!school_id || !class_id)) {
      return res.status(400).json({ error: '学生和教师必须选择学校和班级' });
    }

    const nameExists = db.prepare('SELECT id FROM users WHERE real_name = ?').get(real_name);
    if (nameExists) {
      return res.status(400).json({ error: '该姓名已存在' });
    }

    // AUTH-08：管理员自定义密码须满足统一强密码策略
    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        error: '密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类'
      });
    }

    if (class_id) {
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls || (school_id && cls.school_id !== Number(school_id))) {
        return res.status(400).json({ error: '班级不存在或不属于所选学校' });
      }
    }

    const prefix = role === 'teacher' ? 'teacher' : role === 'executive_mentor' ? 'mentor' : 'student';
    const finalUsername = `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;

    const finalPassword = password || 'pbl123456';
    const password_hash = bcrypt.hashSync(finalPassword, 10);
    const finalSchoolId = role === 'executive_mentor' ? null : school_id;
    const finalClassId = role === 'executive_mentor' ? null : class_id;
    // AUTH-06：创建用户默认密码统一，必须设置强制重置标志
    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, profile, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(finalUsername, password_hash, real_name, email || null, phone || null,
          profile || null, role, finalSchoolId || null, finalClassId || null);

    res.json({ message: `用户 ${real_name} 添加成功` });
  } catch (err) {
    console.error('添加用户错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.getUserForEdit = (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, real_name, role, email, phone, profile, school_id, class_id, is_active FROM users WHERE id = ?'
    ).get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json(user);
  } catch (err) {
    console.error('加载编辑用户错误:', err);
    res.status(500).json({ error: '加载失败' });
  }
};

exports.updateUser = (req, res) => {
  try {
    const { real_name, role, school_id, class_id, email, phone, profile, password, is_active } = req.body;
    const userId = req.params.id;

    if (!real_name || !MANAGED_ROLES.includes(role)) {
      return res.status(400).json({ error: '姓名和身份不能为空' });
    }

    if (['student', 'teacher'].includes(role) && (!school_id || !class_id)) {
      return res.status(400).json({ error: '学生和教师必须选择学校和班级' });
    }

    if (class_id) {
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls || (school_id && cls.school_id !== Number(school_id))) {
        return res.status(400).json({ error: '班级不存在或不属于所选学校' });
      }
    }

    const nameExists = db.prepare('SELECT id FROM users WHERE real_name = ? AND id <> ?').get(real_name, userId);
    if (nameExists) {
      return res.status(400).json({ error: '该姓名已存在' });
    }

    // AUTH-08：管理员重置/修改用户密码须满足统一强密码策略
    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        error: '密码至少 8 位，且需包含大写字母、小写字母、数字、特殊字符中的至少 3 类'
      });
    }

    const finalSchoolId = role === 'executive_mentor' ? null : school_id;
    const finalClassId = role === 'executive_mentor' ? null : class_id;
    const active = is_active === 'on' || is_active === '1' ? 1 : 0;

    if (password) {
      const password_hash = bcrypt.hashSync(password, 10);
      // AUTH-03：管理员直接改密后，撤销该用户所有 Refresh Token
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, userId);
    }

    db.prepare(
      `UPDATE users
       SET real_name = ?, role = ?, school_id = ?, class_id = ?, email = ?, phone = ?, profile = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(real_name, role, finalSchoolId || null, finalClassId || null,
          email || null, phone || null, profile || null, active, userId);

    res.json({ message: '用户信息已更新' });
  } catch (err) {
    console.error('更新用户错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteUser = (req, res) => {
  try {
    const user = db.prepare('SELECT id, real_name, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(400).json({ error: '用户不存在' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: '不能删除管理员账号' });
    }
    const courseCount = db.prepare('SELECT COUNT(*) as c FROM courses WHERE created_by = ?').get(user.id).c;
    if (courseCount > 0) {
      return res.status(400).json({ error: `该用户已创建 ${courseCount} 门课程，请先转移或删除课程后再删除` });
    }
    deleteUserWithWorks(req.params.id);
    res.json({ message: `用户 ${user.real_name} 已删除` });
  } catch (err) {
    console.error('删除用户错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.batchDeleteUsers = (req, res) => {
  try {
    // 兼容前端传 { ids } 与旧格式 { user_ids }
    const rawIds = req.body.ids ?? req.body.user_ids;
    const rawList = Array.isArray(rawIds) ? rawIds.join(',') : String(rawIds || '');
    const ids = rawList
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id !== req.user.id);

    if (ids.length === 0) {
      return res.status(400).json({ error: '请选择要删除的用户' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const blockedRows = db.prepare(
      `SELECT u.id, u.real_name FROM users u
       WHERE u.id IN (${placeholders}) AND (u.role = 'admin' OR EXISTS (
         SELECT 1 FROM courses c WHERE c.created_by = u.id
       ))`
    ).all(...ids);
    const blockedIds = new Set(blockedRows.map((row) => row.id));
    const safeIds = ids.filter((id) => !blockedIds.has(id));

    for (const id of safeIds) {
      deleteUserWithWorks(id);
    }

    const msg = `已删除 ${safeIds.length} 名用户`;
    res.json({ message: blockedRows.length ? `${msg}；${blockedRows.length} 名为管理员或已创建课程，未删除` : msg });
  } catch (err) {
    console.error('批量删除用户错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 管理员：获取分配用选项（学校/负责教师/负责导师）
exports.getAssignOptions = (req, res) => {
  try {
    const schools = db.prepare('SELECT id, name FROM schools ORDER BY name').all();
    const teachers = db.prepare("SELECT id, real_name, school_id FROM users WHERE role = 'teacher' ORDER BY real_name").all();
    const mentors = db.prepare(
      "SELECT id, real_name FROM users WHERE role IN ('executive_mentor','academic_mentor') ORDER BY real_name"
    ).all();
    res.json({ schools, teachers, mentors });
  } catch (err) {
    console.error('获取分配选项错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 管理员：为学生分配学校/班级/负责教师/负责导师
exports.assignStudent = (req, res) => {
  try {
    const { school_id, class_id, teacher_id, mentor_id } = req.body;
    const student = db.prepare('SELECT id, real_name FROM users WHERE id = ?').get(req.params.id);
    if (!student) {
      return res.status(400).json({ error: '用户不存在' });
    }

    if (school_id) {
      const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(school_id);
      if (!school) return res.status(400).json({ error: '所选学校不存在' });
    }
    if (class_id) {
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls) return res.status(400).json({ error: '所选班级不存在' });
      if (school_id && cls.school_id !== Number(school_id)) {
        return res.status(400).json({ error: '所选班级不属于所选学校' });
      }
    }
    if (teacher_id) {
      const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacher_id);
      if (!teacher) return res.status(400).json({ error: '所选负责教师不存在' });
    }
    if (mentor_id) {
      const mentor = db.prepare(
        "SELECT id FROM users WHERE id = ? AND role IN ('executive_mentor','academic_mentor')"
      ).get(mentor_id);
      if (!mentor) return res.status(400).json({ error: '所选负责导师不存在' });
    }

    db.prepare(
      `UPDATE users
       SET school_id = ?, class_id = ?, teacher_id = ?, mentor_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(school_id || null, class_id || null, teacher_id || null, mentor_id || null, req.params.id);

    res.json({ message: `已更新 ${student.real_name} 的分配信息` });
  } catch (err) {
    console.error('分配学生错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.showEditStudent = (req, res) => {
  try {
    const student = db.prepare(
      `SELECT u.*, s.name as school_name, c.name as class_name, c.grade
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN classes c ON u.class_id = c.id
       WHERE u.id = ? AND u.role = 'student'`
    ).get(req.params.id);

    if (!student) {
      return res.status(400).json({ error: '学生不存在' });
    }

    if (isTeacher(req.user.role) && student.school_id !== req.user.school_id) {
      return res.status(400).json({ error: '无权编辑其他学校学生' });
    }

    const schoolId = student.school_id;
    // AUTH-01：返回前用 DTO 脱敏，剔除 password_hash 等敏感字段
    const safeStudent = sanitizeUser(student);

    const schools = isTeacher(req.user.role)
      ? db.prepare('SELECT id, name FROM schools WHERE id = ?').all(req.user.school_id || 0)
      : db.prepare('SELECT id, name FROM schools ORDER BY name').all();
    const classes = db.prepare('SELECT id, name, grade FROM classes WHERE school_id = ? ORDER BY grade, name')
      .all(schoolId);

    res.json({ title: '编辑学生', student: safeStudent, schools, classes, errors: [] });

    res.json({ title: '编辑学生', student, schools, classes, errors: [] });
  } catch (err) {
    console.error('加载编辑学生错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.updateStudent = (req, res) => {
  try {
    const { school_id, class_id } = req.body;
    const student = db.prepare(
      "SELECT id, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(req.params.id);

    if (!student) {
      return res.status(400).json({ error: '学生不存在' });
    }

    if (isTeacher(req.user.role)) {
      if (Number(school_id) !== req.user.school_id) {
        return res.status(400).json({ error: '教师只能编辑本校学生' });
      }
    }

    const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND school_id = ?')
      .get(class_id, school_id);
    if (!cls) {
      return res.status(400).json({ error: '班级不存在或不属于所选学校' });
    }

    db.prepare('UPDATE users SET school_id = ?, class_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(school_id, class_id, req.params.id);
    res.json({ message: '学生信息已更新' });
  } catch (err) {
    console.error('更新学生错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteStudent = (req, res) => {
  try {
    const student = db.prepare(
      "SELECT id, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(req.params.id);
    if (!student) {
      return res.status(400).json({ error: '学生不存在' });
    }
    if (isTeacher(req.user.role) && student.school_id !== req.user.school_id) {
      return res.status(400).json({ error: '无权删除其他学校学生' });
    }
    deleteUserWithWorks(req.params.id);
    res.json({ message: '学生已删除' });
  } catch (err) {
    console.error('删除学生错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 学生详情
exports.detail = (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (user.role === 'student' && Number(id) !== user.id) {
      return res.status(400).json({ error: '无权查看该学生档案' });
    }

    if (!isStaff(user.role) && user.role !== 'student') {
      return res.status(400).json({ error: '无权查看学生档案' });
    }

    const student = db.prepare(
      `SELECT u.*, s.name as school_name, c.name as class_name, c.grade,
              t.real_name as teacher_name, m.real_name as mentor_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN classes c ON u.class_id = c.id
       LEFT JOIN users t ON u.teacher_id = t.id
       LEFT JOIN users m ON u.mentor_id = m.id
       WHERE u.id = ?`
    ).get(id);

    if (!student) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (isTeacher(user.role) && student.school_id !== user.school_id) {
      return res.status(400).json({ error: '无权查看其他学校学生' });
    }

    // AUTH-01：返回前用 DTO 脱敏，剔除 password_hash 等敏感字段
    const safeStudent = sanitizeUser(student);

    const courses = db.prepare(
      `SELECT c.title, c.theme, e.enrolled_at, e.completed_at
       FROM enrollments e JOIN courses c ON e.course_id = c.id
       WHERE e.student_id = ? ORDER BY e.enrolled_at DESC`
    ).all(id);

    const works = db.prepare(
      `SELECT w.*, c.title as course_title, t.title as task_title
       FROM works w
       LEFT JOIN enrollments e ON w.enrollment_id = e.id
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN tasks t ON w.task_id = t.id
       WHERE w.student_id = ? ORDER BY w.created_at DESC`
    ).all(id);

    const reflections = db.prepare(
      `SELECT r.*, l.title as lesson_title, c2.title as course_title
       FROM reflections r
       LEFT JOIN lessons l ON r.lesson_id = l.id
       LEFT JOIN enrollments e ON r.enrollment_id = e.id
       LEFT JOIN courses c2 ON e.course_id = c2.id
       WHERE r.student_id = ? ORDER BY r.created_at DESC`
    ).all(id);

    const evaluations = db.prepare(
      `SELECT ev.*, u2.real_name as evaluator_name
       FROM evaluations ev JOIN users u2 ON ev.evaluator_id = u2.id
       WHERE ev.student_id = ? ORDER BY ev.created_at DESC`
    ).all(id);

    res.json({
      title: `${safeStudent.real_name} - 成长档案`,
      student: safeStudent, courses, works, reflections, evaluations
    });
  } catch (err) {
    console.error('学生详情错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 获取学校的班级（AJAX）
exports.getClasses = (req, res) => {
  try {
    if (req.user && isTeacher(req.user.role) && Number(req.params.schoolId) !== req.user.school_id) {
      return res.status(403).json({ error: '无权访问该学校班级' });
    }
    const classes = db.prepare(
      'SELECT id, name, grade FROM classes WHERE school_id = ? ORDER BY grade, name'
    ).all(req.params.schoolId);
    res.json({ classes });
  } catch (err) {
    console.error('获取班级错误:', err);
    res.status(500).json({ error: '获取失败' });
  }
};
