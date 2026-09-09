const bcrypt = require('bcryptjs');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { isStaff, isTeacher } = require('../middleware/auth');
const { buildUserTree } = require('../helpers/userTree');
const { sanitizeUser } = require('../helpers/userDto');
const { toFileDto } = require('../helpers/fileDto');
const { removeFilesAfterCommit, removeDirectoriesAfterCommit } = require('../helpers/fileLifecycle');
const { generateTemporaryPassword } = require('../services/tempPasswordService');
const orgService = require('../services/organizationService');

const { resolveUsername } = require('../helpers/username');
const MANAGED_ROLES = ['student', 'teacher', 'academic_mentor'];

// 统一布尔解析：兼容前端 true/1/'1'/'on'/'true' 等形态，其余一律视为 false
function toBooleanInt(value) {
  return [true, 1, '1', 'on', 'true'].includes(value) ? 1 : 0;
}

// 删除用户前的依赖预检：返回仍有业务引用的明细（空数组=可安全删除）
function userDeletionBlockers(userId) {
  const checks = [
    // 按数据归属检查而非当前角色，避免变更角色后绕过学习档案保护。
    ...[
      ['enrollments', '课程参与记录（含已移除记录）'],
      ['lesson_progress', '课时进度'],
      ['works', '学生作品'],
      ['reflections', '反思日志'],
      ['evaluations', '学生评价'],
      ['growth_records', '学生成长记录'],
      ['glider_simulations', '实验模拟记录'],
      ['project_team_members', '微课题参与记录'],
    ].map(([table, label]) => ({
      label,
      count: db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE student_id = ?`).get(userId).c,
      hint: '请保留账号及历史档案',
    })),
    { label: '微课题组长记录', count: db.prepare('SELECT COUNT(*) c FROM project_teams WHERE leader_student_id = ?').get(userId).c, hint: '请保留账号及历史档案' },
    { label: '实践队参与记录', count: db.prepare('SELECT COUNT(*) c FROM team_members WHERE user_id = ?').get(userId).c, hint: '请保留账号及历史档案' },
    { label: '创建的课程', count: db.prepare('SELECT COUNT(*) c FROM courses WHERE created_by = ?').get(userId).c, hint: '请先转移或删除课程' },
    { label: '授课课时', count: db.prepare('SELECT COUNT(*) c FROM lessons WHERE instructor_id = ?').get(userId).c, hint: '请先调整授课教师' },
    { label: '上传的课程资源', count: db.prepare('SELECT COUNT(*) c FROM resources WHERE upload_by = ?').get(userId).c, hint: '请先转移或删除资源' },
    { label: '上传的课程回放', count: db.prepare('SELECT COUNT(*) c FROM course_replays WHERE created_by = ?').get(userId).c, hint: '请先转移或删除回放' },
    { label: '作品评审记录', count: db.prepare('SELECT COUNT(*) c FROM work_reviews WHERE reviewer_id = ?').get(userId).c, hint: '评审记录将随删除丢失' },
    { label: '成长记录', count: db.prepare('SELECT COUNT(*) c FROM growth_records WHERE recorded_by = ?').get(userId).c, hint: '成长记录将随删除丢失' },
    { label: '历史评价', count: db.prepare('SELECT COUNT(*) c FROM evaluations WHERE evaluator_id = ?').get(userId).c, hint: '评价记录将被级联删除' },
  ];
  return checks.filter((c) => c.count > 0);
}

function formatBlockers(blockers) {
  return blockers.map((b) => `${b.label} ${b.count} 条（${b.hint}）`).join('；');
}

function deleteUserWithWorks(userId) {
  const works = db.prepare('SELECT file_path FROM works WHERE student_id = ?').all(userId);
  const filePaths = works.map((w) => w.file_path).filter(Boolean);
  // 滑翔机模拟结果目录：数据库级联删除后，物理目录一并清理
  const sims = db.prepare('SELECT id FROM glider_simulations WHERE student_id = ?').all(userId);
  const simDirs = sims.map((s) => path.join(require('../middleware/upload').UPLOAD_ROOT, 'glider', String(s.id)));
  // 先事务删除用户（作品/档案/反思等经外键级联清理），提交后再删物理文件
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  removeFilesAfterCommit(filePaths, require('../middleware/upload').UPLOAD_ROOT);
  removeDirectoriesAfterCommit(simDirs, require('../middleware/upload').UPLOAD_ROOT);
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

    const studentUsername = resolveUsername(db, req.body.username, 'student');
    if (password !== undefined && password !== null && password !== '') {
      return res.status(400).json({ error: '初始密码由系统随机生成，请勿传入 password' });
    }
    const studentPassword = generateTemporaryPassword();
    const password_hash = bcrypt.hashSync(studentPassword, 10);

    // AUTH-06：创建用户默认密码统一，必须设置强制重置标志
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, 'student', ?, ?, 1)`
    ).run(studentUsername, password_hash, real_name, email || null, phone || null,
          school_id || null, class_id || null);

    res.set('Cache-Control', 'no-store');
    res.json({
      message: `学生 ${real_name} 添加成功，首次登录需修改密码`,
      id: Number(result.lastInsertRowid),
      username: studentUsername,
      real_name,
      temp_password: studentPassword,
      force_reset_password: 1,
    });
  } catch (err) {
    console.error('添加学生错误:', err);
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: '添加失败，请稍后重试' });
  }
};

// 批量导入页面
exports.showImport = (req, res) => {
  res.json({ title: '批量导入用户' });
};

// ============ 批量导入（支持 CSV / Excel 文件，也兼容 JSON） ============
const IMPORT_ROLES = ['student', 'teacher', 'academic_mentor'];
const ROLE_ALIAS = { '学生': 'student', '教师': 'teacher', '学术导师': 'academic_mentor' };

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
    username: get('登录账号', '账号', 'username', 'login_id'),
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

    // 每个成功导入的用户使用独立随机临时密码；仅当次响应返回明文。
    const insert = db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, profile, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const findSchool = db.prepare('SELECT id FROM schools WHERE name = ?');
    const findClass = db.prepare('SELECT id FROM classes WHERE name = ? AND school_id = ?');

    const result = db.transaction(() => {
      let imported = 0;
      const errors = [];
      const accounts = [];
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
        let username;
        try {
          username = resolveUsername(db, row.username, role);
        } catch (err) {
          if (err.status !== 400) throw err;
          errors.push(`第 ${seq} 行「${real_name}」：${err.message}`);
          continue;
        }
        const temp_password = generateTemporaryPassword();
        const password_hash = bcrypt.hashSync(temp_password, 10);
        insert.run(username, password_hash, real_name,
                   row.email || null, row.phone || null, row.profile || null,
                   role, school_id || null, class_id || null);
        imported++;
        accounts.push({ username, real_name, role, school_name: row.school_name, class_name: row.class_name, temp_password });
      }
      return { imported, errors, accounts };
    })();

    res.set('Cache-Control', 'no-store');
    res.json({
      message: result.errors.length
        ? `成功导入 ${result.imported} 名用户，${result.errors.length} 条失败`
        : `成功导入 ${result.imported} 名用户`,
      imported: result.imported,
      failed: result.errors.length,
      accounts: result.accounts,
      errors: result.errors.slice(0, 20)
    });
  } catch (err) {
    console.error('批量导入错误:', err);
    res.status(400).json({ error: '导入失败：' + (err.message || '文件解析错误') });
  }
};

exports.createSchool = (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '学校名称不能为空' });
    }
    orgService.createSchool(req.body);
    res.json({ message: '学校添加成功' });
  } catch (err) {
    console.error('添加学校错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteSchool = (req, res) => {
  try {
    if (!orgService.deleteSchool(req.params.id)) {
      return res.status(400).json({ error: '学校不存在' });
    }
    res.json({ message: '学校已删除，关联班级已删除' });
  } catch (err) {
    console.error('删除学校错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.createClass = (req, res) => {
  try {
    const { name, school_id } = req.body;
    if (!name || !name.trim() || !school_id) {
      return res.status(400).json({ error: '班级名称和所属学校不能为空' });
    }
    if (!orgService.createClass(req.body)) {
      return res.status(400).json({ error: '所属学校不存在' });
    }
    res.json({ message: '班级添加成功' });
  } catch (err) {
    console.error('添加班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteClass = (req, res) => {
  try {
    if (!orgService.deleteClass(req.params.id)) {
      return res.status(400).json({ error: '班级不存在' });
    }
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

    if (password !== undefined && password !== null && password !== '') {
      return res.status(400).json({ error: '初始密码由系统随机生成，请勿传入 password' });
    }

    if (class_id) {
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls || (school_id && cls.school_id !== Number(school_id))) {
        return res.status(400).json({ error: '班级不存在或不属于所选学校' });
      }
    }

    const finalUsername = resolveUsername(db, req.body.username, role);

    const finalPassword = generateTemporaryPassword();
    const password_hash = bcrypt.hashSync(finalPassword, 10);
    const finalSchoolId = role === 'academic_mentor' ? null : school_id;
    const finalClassId = role === 'academic_mentor' ? null : class_id;
    // AUTH-06：创建用户默认密码统一，必须设置强制重置标志
    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, email, phone, profile, role, school_id, class_id, force_reset_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(finalUsername, password_hash, real_name, email || null, phone || null,
          profile || null, role, finalSchoolId || null, finalClassId || null);

    res.set('Cache-Control', 'no-store');
    res.json({ message: `用户 ${real_name} 添加成功`, username: finalUsername, real_name, temp_password: finalPassword, force_reset_password: 1 });
  } catch (err) {
    console.error('添加用户错误:', err);
    if (err.status === 400) return res.status(400).json({ error: err.message });
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

    // 密码重置统一走专用接口，避免编辑资料绕过随机密码及首次改密规则。
    if (password !== undefined && password !== null && password !== '') {
      return res.status(400).json({ error: '请使用重置密码功能，系统将生成随机临时密码' });
    }

    const finalSchoolId = role === 'academic_mentor' ? null : school_id;
    const finalClassId = role === 'academic_mentor' ? null : class_id;
    const active = toBooleanInt(is_active);

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
    const blockers = userDeletionBlockers(user.id);
    if (blockers.length > 0) {
      return res.status(400).json({ error: `该用户仍有关联数据，无法删除：${formatBlockers(blockers)}` });
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

    const deleted = [];
    const blockedMsgs = [];
    for (const id of ids) {
      const user = db.prepare('SELECT id, real_name, role FROM users WHERE id = ?').get(id);
      if (!user) continue;
      if (user.role === 'admin') {
        blockedMsgs.push(`${user.real_name}（管理员不可删除）`);
        continue;
      }
      const blockers = userDeletionBlockers(id);
      if (blockers.length > 0) {
        blockedMsgs.push(`${user.real_name}（${blockers.map((b) => `${b.label} ${b.count} 条`).join('、')}）`);
        continue;
      }
      deleteUserWithWorks(id);
      deleted.push(user.real_name);
    }

    const msg = `已删除 ${deleted.length} 名用户`;
    res.json({
      message: blockedMsgs.length ? `${msg}；${blockedMsgs.length} 名存在关联数据，未删除` : msg,
      deleted,
      blocked: blockedMsgs,
    });
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
      "SELECT id, real_name FROM users WHERE role = 'academic_mentor' ORDER BY real_name"
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
    const student = db.prepare(
      "SELECT id, real_name, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(req.params.id);
    if (!student) {
      return res.status(400).json({ error: '学生不存在' });
    }

    // 目标学校以「请求 school_id」或「学生当前学校」为准，保证约束一致
    const targetSchoolId = school_id ? Number(school_id) : student.school_id;
    if (school_id) {
      const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(school_id);
      if (!school) return res.status(400).json({ error: '所选学校不存在' });
    }
    if (class_id) {
      // class 非空时 school 必须非空且归属一致，避免「有班级无学校」的不一致组合
      if (!targetSchoolId) return res.status(400).json({ error: '选择班级前请先选择学校' });
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls) return res.status(400).json({ error: '所选班级不存在' });
      if (cls.school_id !== targetSchoolId) {
        return res.status(400).json({ error: '所选班级不属于所选学校' });
      }
    }
    if (teacher_id) {
      const teacher = db.prepare(
        "SELECT id, school_id FROM users WHERE id = ? AND role = 'teacher'"
      ).get(teacher_id);
      if (!teacher) return res.status(400).json({ error: '所选负责教师不存在' });
      if (targetSchoolId && teacher.school_id !== targetSchoolId) {
        return res.status(400).json({ error: '负责教师必须与学生同校' });
      }
    }
    if (mentor_id) {
      const mentor = db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'academic_mentor'"
      ).get(mentor_id);
      if (!mentor) return res.status(400).json({ error: '所选负责导师不存在' });
    }

    db.prepare(
      `UPDATE users
       SET school_id = ?, class_id = ?, teacher_id = ?, mentor_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(targetSchoolId, class_id || null, teacher_id || null, mentor_id || null, req.params.id);

    res.json({ message: `已更新 ${student.real_name} 的分配信息` });
  } catch (err) {
    console.error('分配学生错误:', err);
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
      // 原学校与新学校都必须属于教师本校，防止教师把外校学生“迁入”本校
      if (student.school_id !== req.user.school_id) {
        return res.status(400).json({ error: '无权编辑其他学校学生' });
      }
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
    const blockers = userDeletionBlockers(student.id);
    if (blockers.length > 0) {
      return res.status(400).json({ error: `该学生仍有关联数据，无法删除：${formatBlockers(blockers)}` });
    }
    deleteUserWithWorks(student.id);
    res.json({ message: '学生已删除' });
  } catch (err) {
    console.error('删除学生错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 用户详情：学生=成长档案；教师/执行导师/管理员=角色资料与关联课程
exports.detail = (req, res) => {
  try {
    const { id } = req.params;
    const viewer = req.user;

    const target = db.prepare(
      `SELECT u.*, s.name as school_name, c.name as class_name, c.grade,
              t.real_name as teacher_name, m.real_name as mentor_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN classes c ON u.class_id = c.id
       LEFT JOIN users t ON u.teacher_id = t.id
       LEFT JOIN users m ON u.mentor_id = m.id
       WHERE u.id = ?`
    ).get(id);

    if (!target) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (target.role === 'student') {
      // 学生目标：本人或教职工可查看（教师限本校）
      if (viewer.role === 'student' && Number(id) !== viewer.id) {
        return res.status(400).json({ error: '无权查看该学生档案' });
      }
      if (!isStaff(viewer.role) && viewer.role !== 'student') {
        return res.status(400).json({ error: '无权查看学生档案' });
      }
      if (isTeacher(viewer.role) && target.school_id !== viewer.school_id) {
        return res.status(400).json({ error: '无权查看其他学校学生' });
      }
    } else {
      // 非学生目标（教师/执行导师/管理员）：仅教职工可查看
      if (!isStaff(viewer.role)) {
        return res.status(400).json({ error: '无权查看该用户' });
      }
      if (isTeacher(viewer.role) && target.role !== 'academic_mentor' && target.school_id !== viewer.school_id) {
        return res.status(400).json({ error: '无权查看其他学校用户' });
      }
    }

    // AUTH-01：返回前用 DTO 脱敏，剔除 password_hash 等敏感字段
    const safeTarget = sanitizeUser(target);

    // 非学生目标：按角色返回关联课程
    if (target.role !== 'student') {
      let taughtCourses = [];
      let managedCourses = [];
      if (target.role === 'teacher') {
        taughtCourses = db.prepare(`
          SELECT c.id, c.title, c.status
          FROM courses c
          JOIN lessons l ON l.course_id = c.id AND l.instructor_id = ?
          GROUP BY c.id ORDER BY c.title
        `).all(target.id);
      } else if (target.role === 'academic_mentor') {
        managedCourses = db.prepare(
          'SELECT id, title, status FROM courses WHERE created_by = ? ORDER BY updated_at DESC'
        ).all(target.id);
      }
      return res.json({
        title: `${safeTarget.real_name} - 用户详情`,
        user: safeTarget,
        taughtCourses,
        managedCourses,
      });
    }

    const courses = db.prepare(
      `SELECT c.title, c.theme, e.enrolled_at, e.completed_at
       FROM enrollments e JOIN courses c ON e.course_id = c.id
       WHERE e.student_id = ? AND e.status = 'active' ORDER BY e.enrolled_at DESC`
    ).all(id);

    const works = db.prepare(
      `SELECT w.*, c.title as course_title, t.title as task_title
       FROM works w
       LEFT JOIN enrollments e ON w.enrollment_id = e.id
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN tasks t ON w.task_id = t.id
       WHERE w.student_id = ? ORDER BY w.created_at DESC`
    ).all(id).map(toFileDto);

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
      title: `${safeTarget.real_name} - 成长档案`,
      student: safeTarget, courses, works, reflections, evaluations
    });
  } catch (err) {
    console.error('用户详情错误:', err);
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
