const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { COURSE_MANAGER_ROLES } = require('../middleware/auth');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { decodeOriginalName } = require('../helpers/fileName');
const { toFileDto } = require('../helpers/fileDto');
const { removeFilesAfterCommit } = require('../helpers/fileLifecycle');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_EVENTS } = require('../constants/notification');

function removeUploadedFile(file) {
  if (file?.path) {
    try { fs.unlinkSync(file.path); } catch (err) { /* 文件可能已删除 */ }
  }
}

function canManageCourse(user, courseId) {
  if (user.role === 'admin' || user.role === 'academic_mentor') return true;
  const course = db.prepare('SELECT created_by FROM courses WHERE id = ?').get(courseId);
  return !!course && course.created_by === user.id;
}

// 课程列表
exports.list = (req, res) => {
  try {
    let sql = `
      SELECT c.*, u.real_name as creator_name,
        (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as student_count
      FROM courses c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'student') {
      // 选课由执行导师/教师/管理员统一导入：学生仅可看到自己已报名的已发布课程
      sql += ` AND c.status = 'published' AND EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
      )`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      sql += ` AND c.status = 'published' AND EXISTS (
        SELECT 1
        FROM enrollments e
        JOIN users s ON s.id = e.student_id
        WHERE e.course_id = c.id
          AND e.status = 'active'
          AND s.school_id = ?
      )`;
      params.push(req.user.school_id || 0);
    } else if (!COURSE_MANAGER_ROLES.includes(req.user.role)) {
      sql += " AND c.status = 'published'";
    }

    if (req.query.theme) { sql += ' AND c.theme = ?'; params.push(req.query.theme); }
    if (req.query.grade_level) { sql += ' AND c.grade_level = ?'; params.push(req.query.grade_level); }
    if (req.query.difficulty) { sql += ' AND c.difficulty = ?'; params.push(req.query.difficulty); }
    if (req.query.status) { sql += ' AND c.status = ?'; params.push(req.query.status); }
    if (req.query.search?.trim()) {
      const keyword = `%${req.query.search.trim()}%`;
      sql += ' AND (c.title LIKE ? OR c.theme LIKE ? OR c.description LIKE ?)';
      params.push(keyword, keyword, keyword);
    }

    sql += ' ORDER BY c.updated_at DESC';

    const courses = db.prepare(sql).all(...params).map((course) => ({ ...course, progress: 0 }));
    const themes = db.prepare('SELECT DISTINCT theme FROM courses WHERE theme IS NOT NULL').all();

    res.json({ title: '课程管理', courses, themes, filters: req.query });
  } catch (err) {
    console.error('课程列表错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 创建课程页面
exports.showCreate = (req, res) => {
  res.json({ title: '创建课程', course: {}, errors: [] });
};

// 创建课程
exports.create = (req, res) => {
  try {
    const { title, theme, description, driving_question, story_line,
            grade_level, difficulty, total_hours, materials_needed } = req.body;

    if (!title || !grade_level || !difficulty) {
      return res.status(400).json({ error: '课程名称、适用学段和难度等级为必填项' });
    }

    const result = db.prepare(
      `INSERT INTO courses (title, theme, description, driving_question, story_line,
        grade_level, difficulty, total_hours, materials_needed, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).run(title, theme || null, description || null, driving_question || null,
         story_line || null, grade_level, difficulty, total_hours || null,
         materials_needed || null, req.user.id);

    res.json({ message: '课程创建成功（草稿），补充课时后即可发布', id: result.lastInsertRowid });
  } catch (err) {
    console.error('创建课程错误:', err);
    res.status(500).json({ error: '创建失败，请稍后重试' });
  }
};

// 课程详情
exports.detail = (req, res) => {
  try {
    const { id } = req.params;

    const course = db.prepare(
      `SELECT c.*, u.real_name as creator_name
       FROM courses c LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`
    ).get(id);

    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }

    if (req.user.role === 'student') {
      const enrollment = db.prepare(
        "SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ? AND status = 'active'"
      ).get(id, req.user.id);
      if (course.status !== 'published' || !enrollment) {
        return res.status(404).json({ error: '课程不存在' });
      }
    }

    const teacherCourse = req.user.role === 'teacher' && course.status === 'published' && !!db.prepare(
      `SELECT 1 FROM enrollments e
       JOIN users s ON s.id = e.student_id
       WHERE e.course_id = ? AND e.status = 'active' AND s.school_id = ? LIMIT 1`
    ).get(id, req.user.school_id || 0);
    if (!COURSE_MANAGER_ROLES.includes(req.user.role) && !teacherCourse &&
        !(req.user.role === 'student' && course.status === 'published')) {
      return res.status(400).json({ error: '课程不存在' });
    }

    const lessons = db.prepare(`SELECT l.*, COALESCE(lp.progress, 0) AS progress,
      COALESCE(lp.last_position, 0) AS last_position, u.real_name AS instructor_name
      FROM lessons l
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = ?
      LEFT JOIN users u ON u.id = l.instructor_id
      WHERE l.course_id = ? ORDER BY l.sort_order`).all(req.user.role === 'student' ? req.user.id : null, id);
    const tasks = db.prepare(`SELECT t.*, l.title AS lesson_title FROM tasks t
      JOIN lessons l ON l.id = t.lesson_id WHERE l.course_id = ?
      ORDER BY l.sort_order, t.sort_order`).all(id);
    const progress = req.user.role === 'student'
      ? db.prepare(`SELECT COALESCE(ROUND(AVG(COALESCE(lp.progress, 0))), 0) AS progress
          FROM lessons l LEFT JOIN lesson_progress lp
            ON lp.lesson_id = l.id AND lp.student_id = ?
          WHERE l.course_id = ?`).get(req.user.id, id).progress
      : 0;
    const resources = db.prepare('SELECT * FROM resources WHERE course_id = ? ORDER BY created_at DESC').all(id).map(toFileDto);
    const isInstructorTeacher = teacherCourse;
    const enrollments = (() => {
      if (COURSE_MANAGER_ROLES.includes(req.user.role) || isInstructorTeacher) {
        return db.prepare(
          `SELECT e.*, u.real_name as student_name, u.username, s.name as school_name, c2.name as class_name,
                  u2.real_name AS enrolled_by_name
           FROM enrollments e
           JOIN users u ON e.student_id = u.id
           LEFT JOIN schools s ON u.school_id = s.id
           LEFT JOIN classes c2 ON u.class_id = c2.id
           LEFT JOIN users u2 ON e.enrolled_by = u2.id
           WHERE e.course_id = ? AND e.status = 'active'
           ORDER BY e.enrolled_at DESC`
        ).all(id);
      }
      if (req.user.role === 'student') {
        return db.prepare(
          `SELECT e.*, u.real_name as student_name, u.username, s.name as school_name, c2.name as class_name
           FROM enrollments e
           JOIN users u ON e.student_id = u.id
           LEFT JOIN schools s ON u.school_id = s.id
           LEFT JOIN classes c2 ON u.class_id = c2.id
           WHERE e.course_id = ? AND e.student_id = ? AND e.status = 'active'
           ORDER BY e.enrolled_at DESC`
        ).all(id, req.user.id);
      }
      return [];
    })();

    const teachers = COURSE_MANAGER_ROLES.includes(req.user.role)
      ? db.prepare("SELECT id, real_name, role, school_id FROM users WHERE role = 'academic_mentor' AND is_active = 1 ORDER BY real_name").all()
      : [];

    res.json({ title: course.title, course, lessons, tasks, progress, resources, enrollments, teachers });
  } catch (err) {
    console.error('课程详情错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 编辑课程页面
exports.showEdit = (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }
    if (!canManageCourse(req.user, course.id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    res.json({ title: '编辑课程', course, errors: [] });
  } catch (err) {
    console.error('加载编辑页错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 更新课程
exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    const fields = ['title','theme','description','driving_question','story_line',
                    'grade_level','difficulty','total_hours','materials_needed','status'];
    const sets = [];
    const values = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        values.push(req.body[f] || null);
      }
    });

    if (sets.length === 0) {
      return res.status(400).json({ error: '没有需要更新的内容' });
    }

    values.push(id);
    db.prepare(`UPDATE courses SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);

    res.json({ message: '课程更新成功' });
  } catch (err) {
    console.error('更新课程错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 删除课程：仅允许「草稿 + 无报名历史 + 无作品」物理删除；资源/回放文件走 FileLifecycle
exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    const course = db.prepare('SELECT id, title, status FROM courses WHERE id = ?').get(id);
    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }
    if (course.status !== 'draft') {
      return res.status(403).json({ error: '已发布/已归档课程不能删除，请先撤回为草稿' });
    }
    const enrollmentCount = db.prepare('SELECT COUNT(*) c FROM enrollments WHERE course_id = ?').get(id).c;
    if (enrollmentCount > 0) {
      return res.status(400).json({ error: `该课程已有 ${enrollmentCount} 条报名记录（含已移除），不可删除，请归档保留` });
    }
    const workCount = db.prepare(
      'SELECT COUNT(*) c FROM works WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id = ?)'
    ).get(id).c;
    if (workCount > 0) {
      return res.status(400).json({ error: '该课程存在历史作品记录，不可删除' });
    }

    const filePaths = [
      ...db.prepare('SELECT file_path FROM resources WHERE course_id = ?').all(id).map((r) => r.file_path),
      ...db.prepare('SELECT video_path FROM course_replays WHERE course_id = ?').all(id).map((r) => r.video_path),
    ].filter(Boolean);

    db.prepare('DELETE FROM courses WHERE id = ?').run(id);
    removeFilesAfterCommit(filePaths, UPLOAD_ROOT);
    res.json({ message: '课程已删除' });
  } catch (err) {
    console.error('删除课程错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 添加课时
exports.addLesson = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    const { title, description, duration, start_at, end_at, location, instructor_id } = req.body;

    if (!title) {
      return res.status(400).json({ error: '课时名称不能为空' });
    }

    // 授课人须为启用中的教师或执行导师
    if (instructor_id) {
      const instructor = db.prepare(
          "SELECT id FROM users WHERE id = ? AND role = 'academic_mentor' AND is_active = 1"
      ).get(instructor_id);
      if (!instructor) {
        return res.status(400).json({ error: '授课人不存在或不可用（仅教师/执行导师可授课）' });
      }
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM lessons WHERE course_id = ?').get(id);
    const sortOrder = (maxOrder.max_order || 0) + 1;

    const result = db.prepare(
      `INSERT INTO lessons (course_id, title, description, duration, sort_order, start_at, end_at, location, instructor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, description || null, duration || null, sortOrder,
          start_at || null, end_at || null, location || null, instructor_id || null);

    res.json({ message: '课时添加成功', id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('添加课时错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.updateLesson = (req, res) => {
  try {
    const lesson = db.prepare('SELECT id, course_id FROM lessons WHERE id = ?').get(req.params.lessonId);
    if (!lesson || !canManageCourse(req.user, lesson.course_id)) {
      return res.status(404).json({ error: '课时不存在' });
    }
    const fields = ['title', 'description', 'duration', 'start_at', 'end_at', 'location', 'instructor_id'];
    const sets = [];
    const values = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(req.body[field] || null);
      }
    }
    if (req.body.instructor_id) {
      const instructor = db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'academic_mentor' AND is_active = 1"
      ).get(req.body.instructor_id);
      if (!instructor) return res.status(400).json({ error: '授课人不存在或不可用' });
    }
    if (sets.length === 0) return res.status(400).json({ error: '没有需要更新的内容' });
    values.push(lesson.id);
    db.prepare(`UPDATE lessons SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: '课时更新成功' });
  } catch (err) {
    console.error('更新课时错误:', err);
    res.status(500).json({ error: '更新课时失败' });
  }
};

// 上传资源
exports.uploadResource = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '无权管理该课程' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const { resource_type, title } = req.body;
    const displayTitle = title || decodeOriginalName(req.file.originalname) || req.file.originalname;
    const result = db.prepare(
      'INSERT INTO resources (course_id, resource_type, title, file_path, file_size, upload_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, resource_type || 'other', displayTitle,
         req.file.path, req.file.size, req.user.id);

    res.json({ message: '资源上传成功', id: Number(result.lastInsertRowid) });
  } catch (err) {
    removeUploadedFile(req.file);
    console.error('上传资源错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 删除课程资源：先删除数据库记录，再在提交后清理物理文件
exports.deleteResource = (req, res) => {
  try {
    const resource = db.prepare(
      'SELECT id, course_id, file_path FROM resources WHERE id = ?'
    ).get(req.params.resource_id);
    if (!resource || !canManageCourse(req.user, resource.course_id)) {
      return res.status(404).json({ error: '资源不存在' });
    }

    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
    removeFilesAfterCommit([resource.file_path], UPLOAD_ROOT);
    res.json({ message: '资源已删除' });
  } catch (err) {
    console.error('删除课程资源错误:', err);
    res.status(500).json({ error: '删除资源失败' });
  }
};

// 下载课程资源
exports.downloadResource = (req, res) => {
  try {
    const resource = db.prepare(`
      SELECT r.*, c.status AS course_status
      FROM resources r
      JOIN courses c ON c.id = r.course_id
      WHERE r.id = ?
    `).get(req.params.resource_id);
    if (!resource || !resource.file_path) return res.status(404).json({ error: '附件不存在' });
    if (!COURSE_MANAGER_ROLES.includes(req.user.role)) {
      // 教师可下载已发布课程的课堂资料（线下备课需要）；学生须已报名；其余角色不可下载
      const isTeacher = req.user.role === 'teacher';
      const teacherRelated = isTeacher && !!db.prepare(
        `SELECT 1 FROM enrollments e
         JOIN users s ON s.id = e.student_id
         WHERE e.course_id = ? AND e.status = 'active' AND s.school_id = ? LIMIT 1`
      ).get(resource.course_id, req.user.school_id || 0);
      const enrolled = req.user.role === 'student' && db.prepare(
        "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'"
      ).get(req.user.id, resource.course_id);
      if (resource.course_status !== 'published' || (!teacherRelated && !enrolled)) {
        return res.status(404).json({ error: '附件不存在' });
      }
    }

    const resolvedPath = path.resolve(resource.file_path);
    const relativePath = path.relative(UPLOAD_ROOT, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '附件文件不存在' });
    }
    return res.download(resolvedPath, decodeOriginalName(resource.title) || path.basename(resolvedPath));
  } catch (err) {
    console.error('下载课程资源错误:', err);
    return res.status(500).json({ error: '下载附件失败' });
  }
};

// 添加任务
exports.addTask = (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { title, description, task_type, require_upload, deadline } = req.body;

    if (!title) {
      return res.status(400).json({ error: '任务名称不能为空' });
    }

    const lesson = db.prepare('SELECT course_id FROM lessons WHERE id = ?').get(lesson_id);
    if (!lesson) {
      return res.status(400).json({ error: '课时不存在' });
    }
    if (!canManageCourse(req.user, lesson.course_id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM tasks WHERE lesson_id = ?').get(lesson_id);

    const result = db.prepare(
      `INSERT INTO tasks (lesson_id, title, description, task_type, require_upload, sort_order, deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(lesson_id, title, description || null, task_type || 'inquiry',
         require_upload === undefined
           ? 1
           : require_upload === true || require_upload === 'on' || require_upload === 1 || require_upload === '1' ? 1 : 0,
         (maxOrder.max_order || 0) + 1, deadline || null);

    res.json({ message: '任务添加成功', id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('添加任务错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.updateProgress = (req, res) => {
  try {
    const lessonId = Number(req.body.lesson_id);
    const progress = Math.max(0, Math.min(100, Number(req.body.progress) || 0));
    const position = Math.max(0, Number(req.body.last_position) || 0);
    const enrollment = db.prepare(`
      SELECT c.id FROM courses c
      JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
      WHERE c.id = ? AND c.status = 'published'
    `).get(req.user.id, req.params.id);
    if (!enrollment) return res.status(403).json({ error: '请先选课后再学习' });
    const lesson = db.prepare('SELECT id FROM lessons WHERE id = ? AND course_id = ?').get(lessonId, req.params.id);
    if (!lesson) return res.status(400).json({ error: '课时不属于当前课程' });
    db.prepare(`INSERT INTO lesson_progress (student_id, lesson_id, progress, last_position, completed_at)
      VALUES (?, ?, ?, ?, CASE WHEN ? = 100 THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(student_id, lesson_id) DO UPDATE SET progress=excluded.progress,
      last_position=excluded.last_position, completed_at=excluded.completed_at, updated_at=CURRENT_TIMESTAMP`)
      .run(req.user.id, lessonId, progress, position, progress);
    res.json({ message: '学习进度已保存', progress });
  } catch (err) {
    console.error('保存学习进度错误:', err);
    res.status(500).json({ error: '保存学习进度失败' });
  }
};

function canAccessReplay(user, course) {
  if (COURSE_MANAGER_ROLES.includes(user.role)) return true;
  if (user.role === 'teacher') {
    return course.status === 'published' && !!db.prepare(
      `SELECT 1 FROM enrollments e
       JOIN users s ON s.id = e.student_id
       WHERE e.course_id = ? AND e.status = 'active' AND s.school_id = ? LIMIT 1`
    ).get(course.id, user.school_id || 0);
  }
  if (user.role !== 'student') return false;
  if (course.status !== 'published') return false;
  return !!db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = ?').get(user.id, course.id, 'active');
}

exports.listReplays = (req, res) => {
  try {
    const course = db.prepare('SELECT id, status FROM courses WHERE id = ?').get(req.params.id);
    if (!course || !canAccessReplay(req.user, course)) return res.status(404).json({ error: '课程回放不存在' });
    const replays = db.prepare(
      'SELECT id, course_id, title, description, duration_seconds, recording_date, sort_order, created_at FROM course_replays WHERE course_id = ? ORDER BY sort_order, recording_date, id'
    ).all(course.id);
    res.json({ replays });
  } catch (err) {
    console.error('获取课程回放错误:', err);
    res.status(500).json({ error: '获取课程回放失败' });
  }
};

exports.uploadReplay = (req, res) => {
  try {
    if (!canManageCourse(req.user, req.params.id)) {
      removeUploadedFile(req.file);
      return res.status(403).json({ error: '无权管理该课程' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择回放视频' });
    }
    const { title, description, duration_seconds, recording_date, sort_order } = req.body;
    if (!title || !title.trim()) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '请填写回放标题' });
    }
    const result = db.prepare(
      `INSERT INTO course_replays (course_id, title, description, video_path, duration_seconds, recording_date, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.params.id,
      title.trim(),
      description || null,
      req.file.path,
      Number(duration_seconds) || null,
      recording_date || null,
      Number(sort_order) || 0,
      req.user.id
    );
    res.json({ message: '课程回放上传成功', id: Number(result.lastInsertRowid) });
  } catch (err) {
    removeUploadedFile(req.file);
    console.error('上传课程回放错误:', err);
    res.status(500).json({ error: '上传课程回放失败' });
  }
};

exports.updateReplay = (req, res) => {
  try {
    const replay = db.prepare('SELECT id, course_id FROM course_replays WHERE id = ?').get(req.params.replayId);
    if (!replay || !canManageCourse(req.user, replay.course_id)) return res.status(404).json({ error: '课程回放不存在' });
    const { title, description, duration_seconds, recording_date, sort_order } = req.body;
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: '回放标题不能为空' });
    db.prepare(
      `UPDATE course_replays
       SET title = COALESCE(?, title), description = ?, duration_seconds = ?, recording_date = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      title ? String(title).trim() : null,
      description || null,
      Number(duration_seconds) || null,
      recording_date || null,
      Number(sort_order) || 0,
      replay.id
    );
    res.json({ message: '课程回放已更新' });
  } catch (err) {
    console.error('更新课程回放错误:', err);
    res.status(500).json({ error: '更新课程回放失败' });
  }
};

exports.deleteReplay = (req, res) => {
  try {
    const replay = db.prepare('SELECT id, course_id, video_path FROM course_replays WHERE id = ?').get(req.params.replayId);
    if (!replay || !canManageCourse(req.user, replay.course_id)) return res.status(404).json({ error: '课程回放不存在' });
    // 先删记录，提交后再删物理文件（失败进清理队列）
    db.prepare('DELETE FROM course_replays WHERE id = ?').run(replay.id);
    removeFilesAfterCommit([replay.video_path], UPLOAD_ROOT);
    res.json({ message: '课程回放已删除' });
  } catch (err) {
    console.error('删除课程回放错误:', err);
    res.status(500).json({ error: '删除课程回放失败' });
  }
};

// 回放流式地址签名：HMAC-SHA256(secret, `${replayId}:${uid}:${exp}`)，10 分钟有效
function signReplay(replayId, uid, exp, secret) {
  return crypto.createHmac('sha256', secret).update(`${replayId}:${uid}:${exp}`).digest('hex');
}

// 生成短期签名播放地址（前端 <video> 直挂，无法携带 Authorization 头）
exports.streamUrl = (req, res) => {
  try {
    const replay = db.prepare(
      `SELECT r.id, r.course_id, c.status AS course_status
       FROM course_replays r JOIN courses c ON c.id = r.course_id
       WHERE r.id = ?`
    ).get(req.params.replayId);
    if (!replay || !canAccessReplay(req.user, { id: replay.course_id, status: replay.course_status })) {
      return res.status(404).json({ error: '课程回放不存在' });
    }
    const exp = Math.floor(Date.now() / 1000) + 600;
    const sig = signReplay(replay.id, req.user.id, exp, req.app.get('jwt_secret'));
    res.json({ url: `/api/courses/replays/${replay.id}/stream?exp=${exp}&uid=${req.user.id}&sig=${sig}`, expires_in: 600 });
  } catch (err) {
    console.error('生成回放播放地址错误:', err);
    res.status(500).json({ error: '生成播放地址失败' });
  }
};

exports.streamReplay = (req, res) => {
  try {
    const replay = db.prepare(
      `SELECT r.*, c.status AS course_status, c.id AS course_id
       FROM course_replays r JOIN courses c ON c.id = r.course_id
       WHERE r.id = ?`
    ).get(req.params.replayId);
    if (!replay) {
      return res.status(404).json({ error: '课程回放不存在' });
    }

    // 无 Bearer 时走签名校验：exp 未过期 + sig 匹配 + 按签名 uid 实时查库，RBAC 仍以数据库为准
    let user = req.user;
    if (!user) {
      const { exp, uid, sig } = req.query;
      if (!exp || !uid || !sig) return res.status(401).json({ error: '未登录' });
      const expMs = Number(exp) * 1000;
      if (!Number.isFinite(expMs) || Date.now() > expMs) return res.status(401).json({ error: '播放链接已过期，请重新进入课程详情' });
      const expected = signReplay(replay.id, uid, exp, req.app.get('jwt_secret'));
      if (sig !== expected) return res.status(401).json({ error: '播放链接无效' });
      const urow = db.prepare('SELECT id, role, school_id FROM users WHERE id = ? AND is_active = 1').get(uid);
      if (!urow) return res.status(401).json({ error: '账号不可用' });
      user = urow;
    }

    if (!canAccessReplay(user, { id: replay.course_id, status: replay.course_status })) {
      return res.status(404).json({ error: '课程回放不存在' });
    }
    const resolvedPath = path.resolve(replay.video_path);
    const relativePath = path.relative(UPLOAD_ROOT, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '回放文件不存在' });
    }
    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('播放课程回放错误:', err);
    res.status(500).json({ error: '播放课程回放失败' });
  }
};

// 选课导入权限：仅执行导师和管理员为课程管理者
function canEnrollCourse(user, courseId) {
  return COURSE_MANAGER_ROLES.includes(user.role) && canManageCourse(user, courseId);
}

// 学生由执行导师/教师/管理员统一导入（一经选课不可退课；学生不自助选课）
exports.enroll = (req, res) => {
  try {
    const { id } = req.params;
    const course = db.prepare('SELECT id, title, status FROM courses WHERE id = ?').get(id);
    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }
    if (course.status === 'archived') {
      return res.status(400).json({ error: '已归档课程不能导入学生' });
    }
    if (!canEnrollCourse(req.user, id)) {
      return res.status(403).json({ error: '仅执行导师或管理员可导入学生' });
    }

    const { student_ids } = req.body;
    const ids = Array.isArray(student_ids) ? student_ids : [student_ids];
    if (ids.length === 0) {
      return res.status(400).json({ error: '请选择学生' });
    }

    // 预取全部学生：无效/禁用 ID 逐条跳过；教师跨校学生整体拒绝（保证原子性）
    const placeholders = ids.map(() => '?').join(',');
    const students = db.prepare(
      `SELECT id, real_name, school_id FROM users
       WHERE id IN (${placeholders}) AND role = 'student' AND is_active = 1`
    ).all(...ids);
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const added = [];
    const skipped = [];
    const insert = db.prepare(`
      INSERT INTO enrollments (student_id, course_id, enrolled_by)
      VALUES (?, ?, ?)
      ON CONFLICT(student_id, course_id) DO UPDATE SET
        status = 'active',
        enrolled_by = excluded.enrolled_by,
        enrolled_at = CURRENT_TIMESTAMP,
        completed_at = NULL,
        removed_at = NULL,
        removed_by = NULL,
        remove_reason = NULL
    `);

    db.transaction(() => {
      for (const raw of ids) {
        const num = Number(raw);
        if (!Number.isInteger(num) || num <= 0) {
          skipped.push({ name: String(raw), reason: '无效的学生ID' });
          continue;
        }
        const student = studentMap.get(num);
        if (!student) {
          skipped.push({ name: String(raw), reason: '学生不存在或已禁用' });
          continue;
        }
        insert.run(num, Number(id), req.user.id);
        added.push(student.real_name);
      }
    })();

    const skippedText = skipped.length
      ? `，跳过 ${skipped.length} 名（${skipped.slice(0, 5).map((s) => `${s.name}:${s.reason}`).join('；')}${skipped.length > 5 ? '…' : ''}）`
      : '';
    res.json({
      message: `已导入 ${added.length} 名学生${skippedText}`,
      added: added.length,
      skipped,
    });
  } catch (err) {
    console.error('报名错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 导入候选学生：已启用且未在该课程（有效报名）的学生；教师强制本校
exports.enrollCandidates = (req, res) => {
  try {
    const { id } = req.params;
    const course = db.prepare('SELECT id, status FROM courses WHERE id = ?').get(id);
    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }
    if (course.status === 'archived') {
      return res.status(400).json({ error: '已归档课程不能导入学生' });
    }
    if (!canEnrollCourse(req.user, id)) {
      return res.status(403).json({ error: '仅执行导师或管理员可导入学生' });
    }

    const conditions = [
      "u.role = 'student'",
      'u.is_active = 1',
      `NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.course_id = ${Number(id)} AND e.status = 'active')`,
    ];
    const params = [];
    if (req.query.school_id) { conditions.push('u.school_id = ?'); params.push(req.query.school_id); }
    if (req.query.class_id) { conditions.push('u.class_id = ?'); params.push(req.query.class_id); }
    if (req.query.search) {
      conditions.push('(u.real_name LIKE ? OR u.username LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    const students = db.prepare(`
      SELECT u.id, u.real_name, u.username, s.name AS school_name, c2.name AS class_name, c2.grade
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN classes c2 ON u.class_id = c2.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.real_name
      LIMIT 200
    `).all(...params);

    res.json({
      students,
      lockedSchoolId: null,
    });
  } catch (err) {
    console.error('加载导入候选学生错误:', err);
    res.status(500).json({ error: '加载失败' });
  }
};

// 管理员异常修正：移除报名（软删除 + 审计）。日常任何角色均不可退课。
exports.removeEnrollment = (req, res) => {
  try {
    const { courseId, enrollmentId } = req.params;
    const enrollment = db.prepare(`
      SELECT e.*, c.title AS course_title, u.real_name AS student_name
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = e.student_id
      WHERE e.id = ? AND e.course_id = ?
    `).get(enrollmentId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: '报名记录不存在' });
    }
    if (enrollment.status === 'removed') {
      return res.status(400).json({ error: '该报名已被移除' });
    }

    const reason = (req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: '请填写移除原因（将记录在审计中）' });
    }

    // 已产生业务数据（作品/评价/反思）的报名不可移除
    const blockers = [
      { label: '作品', count: db.prepare('SELECT COUNT(*) c FROM works WHERE enrollment_id = ?').get(enrollment.id).c },
      { label: '评价', count: db.prepare('SELECT COUNT(*) c FROM evaluations WHERE enrollment_id = ?').get(enrollment.id).c },
      { label: '反思日志', count: db.prepare('SELECT COUNT(*) c FROM reflections WHERE enrollment_id = ?').get(enrollment.id).c },
    ].filter((b) => b.count > 0);
    if (blockers.length > 0) {
      return res.status(400).json({
        error: `该报名已产生${blockers.map((b) => `${b.label} ${b.count} 条`).join('、')}，不可移除`,
      });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE enrollments
        SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removed_by = ?, remove_reason = ?
        WHERE id = ?
      `).run(req.user.id, reason.slice(0, 500), enrollment.id);
      db.prepare(
        "INSERT INTO growth_records (student_id, event_type, description, recorded_by) VALUES (?, 'system', ?, ?)"
      ).run(enrollment.student_id, `已移除课程《${enrollment.course_title}》报名（原因：${reason.slice(0, 200)}）`, req.user.id);
    })();

    notificationService.safeCreateForUsers({
      eventKey: NOTIFICATION_EVENTS.ENROLLMENT_REMOVED,
      dedupeKey: `course.enrollment_removed:${enrollment.id}`,
      title: '报名已移除',
      summary: `《${enrollment.course_title}》`,
      content: `您在课程《${enrollment.course_title}》的报名已被管理员移除。原因：${reason.slice(0, 200)}`,
      category: 'course',
      level: 'important',
      actionUrl: null,
      businessType: 'enrollment',
      businessId: enrollment.id,
      createdBy: req.user.id,
    }, [enrollment.student_id]);

    res.json({ message: `已移除 ${enrollment.student_name} 的报名（审计已记录）` });
  } catch (err) {
    console.error('移除报名错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};
