const db = require('../config/database');
const path = require('path');
const { isTeacher } = require('../middleware/auth');
const { buildUserTree } = require('../helpers/userTree');
const { sanitizeUser } = require('../helpers/userDto');
const { removeFilesAfterCommit, removeDirectoriesAfterCommit } = require('../helpers/fileLifecycle');
const { canViewArchive } = require('../helpers/archivePolicy');
const { loadStudentArchive } = require('./archiveController');
const orgService = require('../services/organizationService');
const lifecycle = require('../services/studentLifecycleService');
const { generateTemporaryPassword } = require('../services/tempPasswordService');
const { mentorStudentScope, mentorStudentParams, canViewStudent } = require('../policies/studentPolicy');

exports.changeStatus = (req, res) => {
  try {
    const target = db.prepare('SELECT role FROM users WHERE id=?').get(req.params.id);
    if (target && target.role !== 'student') return res.json(require('../services/accountLifecycleService').changeStatus(req.params.id, req.user.id, req.body.action, req.body.reason));
    if (!['disable', 'archive', 'restore'].includes(req.body.action)) return res.status(400).json({ error: '无效的账号操作' });
    const method = { disable: lifecycle.disableStudent, archive: lifecycle.archiveStudent, restore: lifecycle.restoreStudent }[req.body.action];
    if (typeof method !== 'function') return res.status(400).json({ error: '无效的账号操作' });
    res.json(method(req.params.id, req.user.id, req.body.reason));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : '操作失败，请稍后重试' });
  }
};

const MANAGED_ROLES = ['student', 'teacher', 'academic_mentor'];

// 统一布尔解析：兼容前端 true/1/'1'/'on'/'true' 等形态，其余一律视为 false
function toBooleanInt(value) {
  return [true, 1, '1', 'on', 'true'].includes(value) ? 1 : 0;
}

// 删除用户前的依赖预检：返回仍有业务引用的明细（空数组=可安全删除）
function userDeletionBlockers(userId) {
  const checks = [
    { label: '教职工状态操作记录', count: db.prepare('SELECT COUNT(*) c FROM account_status_events WHERE user_id=? OR actor_id=?').get(userId,userId).c, hint: '请保留账号及状态历史' },
    { label: '账号状态操作记录', count: db.prepare('SELECT COUNT(*) c FROM student_status_events WHERE student_id = ? OR actor_id = ?').get(userId, userId).c, hint: '请保留账号及状态历史' },
    // 按数据归属检查而非当前角色，避免变更角色后绕过学习档案保护。
    ...[
      ['enrollments', '课程参与记录（含已移除记录）'],
      ['lesson_progress', '课时进度'],
      ['lesson_review_completions', '课堂回顾记录'],
      ['student_card_progress', '知识卡片进度'],
      ['card_exercise_attempts', '练习作答记录'],
      ['lesson_learning_reports', '学习报告'],
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
    { label: '负责学生的教师关系', count: db.prepare('SELECT COUNT(*) c FROM users WHERE teacher_id = ?').get(userId).c, hint: '请先移交负责学生' },
    { label: '负责学生的导师关系', count: db.prepare('SELECT COUNT(*) c FROM users WHERE mentor_id = ?').get(userId).c, hint: '请先移交负责学生' },
    { label: '学习报告评审记录', count: db.prepare('SELECT COUNT(*) c FROM lesson_learning_reports WHERE reviewer_id = ?').get(userId).c, hint: '请保留评审人身份' },
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
      SELECT u.id, u.username, u.real_name, u.email, u.phone, u.is_active, u.archived_at,
             s.name as school_name, c.name as class_name, c.grade
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE u.role = 'student'
    `;
    const params = [];

    if (isTeacher(req.user.role)) {
      sql += ' AND u.teacher_id = ?';
      params.push(req.user.id);
    }

    if (req.query.school_id) { sql += ' AND u.school_id = ?'; params.push(req.query.school_id); }
    if (req.user.role === 'academic_mentor') {
      sql += ` AND ${mentorStudentScope()}`;
      params.push(...mentorStudentParams(req.user.id));
    }
    if (req.query.class_id) { sql += ' AND u.class_id = ?'; params.push(req.query.class_id); }
    if (req.query.search) {
      sql += ' AND (u.real_name LIKE ? OR u.username LIKE ?)';
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    sql += ' ORDER BY u.created_at DESC';

    const students = db.prepare(sql).all(...params);
    const schools = isTeacher(req.user.role)
      ? db.prepare(`SELECT DISTINCT s.id, s.name FROM schools s
          JOIN users u ON u.school_id = s.id
          WHERE u.role = 'student' AND u.teacher_id = ? ORDER BY s.name`).all(req.user.id)
      : db.prepare(`SELECT DISTINCT s.id, s.name FROM schools s
          JOIN users u ON u.school_id = s.id
          WHERE u.role = 'student' AND ${mentorStudentScope()} ORDER BY s.name`)
        .all(...mentorStudentParams(req.user.id));

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
exports.create = async (req, res) => {
  try {
    const result = await createAccount({ ...req.body, role: 'student' }, { beforeCommit:()=>assertCreator(req.user) });
    const { auth_version, ...account } = result;
    res.set('Cache-Control', 'no-store');
    res.json({ message: '学生账号已创建，首次登录需修改密码', ...account });
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : '创建失败，请稍后重试' }); }
};

// 批量导入页面
exports.showImport = (req, res) => {
  res.json({ title: '批量导入用户' });
};

// 持久化后台批次：正常客户端使用 async=1，旧客户端仍可等待结果。
const accountImports = require('../services/accountImportService');
const { createAccount, assertCreator } = require('../services/accountCreationService');

exports.import = async (req, res) => {
  try {
    const batch = await accountImports.start(req.user.id, {
      file: req.file ? { name: req.file.originalname, buffer: req.file.buffer } : undefined,
      data: req.body.data,
    }, req.body.request_key, req.body.confirm_new_batch === 'true' || req.body.confirm_new_batch === true,req.user.auth_version || 0);
    res.set('Cache-Control', 'no-store');
    if (req.query.async === '1') return res.status(202).json(batch);
    await accountImports.wait(batch.id);
    res.json(accountImports.view(batch.id, req.user.id, true));
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : '导入失败，请稍后重试' }); }
};
exports.importBatches = (req, res) => res.json(accountImports.list(req.user.id,req.query.page));
exports.importBatch = (req, res) => {
  try { res.set('Cache-Control', 'no-store'); res.json(accountImports.view(req.params.batchId, req.user.id)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
};
exports.importCredentials = (req, res) => {
  try { res.set('Cache-Control', 'no-store'); res.json(accountImports.view(req.params.batchId, req.user.id, true)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
};
exports.resumeImport = (req, res) => {
  try { res.json(accountImports.resume(req.params.batchId, req.user.id,req.user.auth_version || 0)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
};
exports.acknowledgeImport = (req, res) => {
  try { accountImports.acknowledge(req.params.batchId, req.user.id); res.json({ message: '已确认账号交付' }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
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
    res.status(err.status || 500).json({ error: err.status ? err.message : '操作失败，请稍后重试' });
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

exports.createUser = async (req, res) => {
  try {
    if (!req.body.real_name || !MANAGED_ROLES.includes(req.body.role)) return res.status(400).json({ error: '姓名和身份不能为空或身份无效' });
    const result = await createAccount(req.body,{beforeCommit:()=>assertCreator(req.user)});
    const { auth_version, ...account } = result;
    res.set('Cache-Control', 'no-store');
    res.json({ message: '用户账号已创建，首次登录需修改密码', ...account });
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : '创建失败，请稍后重试' }); }
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

    const existing = db.prepare('SELECT role, is_active, archived_at FROM users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ error: '用户不存在' });
    if (existing.role === 'admin') return res.status(400).json({ error: '不能通过此接口修改管理员账号' });
    if (existing.role === 'student' && (
      (is_active !== undefined && toBooleanInt(is_active) !== existing.is_active) ||
      ((existing.archived_at || existing.is_active !== 1) && role !== 'student')
    )) return res.status(400).json({ error: '请先通过学生状态管理功能恢复或停用账号' });

    if (MANAGED_ROLES.includes(role) && role !== existing.role) {
      const blockers = userDeletionBlockers(userId);
      if (blockers.length) return res.status(409).json({
        error: '账号已有业务历史或职责关联，请保留原身份；需要新身份时另建账号',
        blockers: blockers.map(({ label, count }) => ({ label, count })),
      });
    }

    if (typeof real_name !== 'string' || !real_name.trim() || !MANAGED_ROLES.includes(role)) {
      return res.status(400).json({ error: '姓名和身份不能为空' });
    }
    // 编辑后也必须能按新姓名执行重置，拒绝只有空格或不能生成拼音的姓名。
    try { generateTemporaryPassword(real_name.trim()); }
    catch (err) { return res.status(400).json({ error:err.message }); }

    if (['student', 'teacher'].includes(role) && (!school_id || !class_id)) {
      return res.status(400).json({ error: '学生和教师必须选择学校和班级' });
    }

    if (class_id) {
      const cls = db.prepare('SELECT id, school_id FROM classes WHERE id = ?').get(class_id);
      if (!cls || (school_id && cls.school_id !== Number(school_id))) {
        return res.status(400).json({ error: '班级不存在或不属于所选学校' });
      }
    }

    // 密码重置统一走专用接口，避免编辑资料绕过初始密码及首次改密规则。
    if (password !== undefined && password !== null && password !== '') {
      return res.status(400).json({ error: '请使用专用重置密码功能，密码为姓名拼音@123' });
    }

    const finalSchoolId = role === 'academic_mentor' ? null : school_id;
    const finalClassId = role === 'academic_mentor' ? null : class_id;
    const active = is_active === undefined ? existing.is_active : toBooleanInt(is_active);

    db.transaction(() => {
      db.prepare(
        `UPDATE users
         SET real_name = ?, role = ?, school_id = ?, class_id = ?, email = ?, phone = ?, profile = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(real_name.trim(), role, finalSchoolId || null, finalClassId || null,
            email || null, phone || null, profile || null, active, userId);

      if (role !== existing.role || active !== existing.is_active) {
        db.prepare('UPDATE users SET auth_version = auth_version + 1 WHERE id = ?').run(userId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
      }
      if (active !== existing.is_active && existing.role !== 'student') {
        const reason = typeof req.body.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : '管理员编辑资料调整账号状态';
        db.prepare('INSERT INTO account_status_events(user_id,actor_id,action,reason) VALUES(?,?,?,?)').run(userId,req.user.id,active ? 'restore' : 'disable',reason);
      }
    })();

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
    const teachers = db.prepare("SELECT id, real_name, school_id FROM users WHERE role = 'teacher' AND is_active=1 AND archived_at IS NULL ORDER BY real_name").all();
    const mentors = db.prepare(
      "SELECT id, real_name FROM users WHERE role = 'academic_mentor' AND is_active=1 AND archived_at IS NULL ORDER BY real_name"
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
        "SELECT id, school_id FROM users WHERE id = ? AND role = 'teacher' AND is_active=1 AND archived_at IS NULL"
      ).get(teacher_id);
      if (!teacher) return res.status(400).json({ error: '所选负责教师不存在或已停用' });
      if (targetSchoolId && teacher.school_id !== targetSchoolId) {
        return res.status(400).json({ error: '负责教师必须与学生同校' });
      }
    }
    if (mentor_id) {
      const mentor = db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'academic_mentor' AND is_active=1 AND archived_at IS NULL"
      ).get(mentor_id);
      if (!mentor) return res.status(400).json({ error: '所选负责导师不存在或已停用' });
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
      if (viewer.role === 'academic_mentor' && !canViewStudent(viewer, target)) {
        return res.status(403).json({ error: '只能查看自己课程相关学生' });
      }
      // 学生目标：档案访问范围统一由 archivePolicy 判定（决策 D-1）
      if (!canViewArchive(viewer, target)) {
        return res.status(403).json({ error: '学生不存在或无权访问' });
      }
    } else {
      // 账号管理与其他教职工资料仅管理员可查看；导师/教师只读授权学生。
      if (viewer.role !== 'admin') {
        return res.status(403).json({ error: '无权查看该用户' });
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
          `SELECT c.id, c.title, c.status FROM courses c
           WHERE c.created_by = ? OR EXISTS (
             SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.instructor_id = ?
           ) ORDER BY c.updated_at DESC`
        ).all(target.id, target.id);
      }
      return res.json({
        title: `${safeTarget.real_name} - 用户详情`,
        user: safeTarget,
        taughtCourses,
        managedCourses,
        statusEvents: db.prepare(`SELECT e.action,e.reason,e.created_at,u.username AS actor_username
          FROM account_status_events e JOIN users u ON u.id=e.actor_id WHERE e.user_id=? ORDER BY e.id DESC`).all(id),
      });
    }

    // 学生目标：档案数据统一由 loadStudentArchive 组装（作品/评价/反思按角色过滤，决策 D-1/D-2）
    const archive = loadStudentArchive(id, viewer);
    if (!archive) {
      return res.status(403).json({ error: '学生不存在或无权访问' });
    }
    res.json({
      title: `${safeTarget.real_name} - 成长档案`,
      ...archive,
      ...(viewer.role === 'admin' ? { statusEvents: db.prepare(`SELECT e.action, e.reason, e.created_at, u.username AS actor_username
        FROM student_status_events e JOIN users u ON u.id = e.actor_id
        WHERE e.student_id = ? ORDER BY e.id DESC`).all(id) } : {}),
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
