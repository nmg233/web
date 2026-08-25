const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { COURSE_MANAGER_ROLES } = require('../middleware/auth');
const { UPLOAD_ROOT } = require('../middleware/upload');

function canManageCourse(user, courseId) {
  if (user.role === 'admin') return true;
  const course = db.prepare('SELECT created_by FROM courses WHERE id = ?').get(courseId);
  return !!course && course.created_by === user.id;
}

// 课程列表
exports.list = (req, res) => {
  try {
    let sql = `
      SELECT c.*, u.real_name as creator_name,
        (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count
      FROM courses c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!COURSE_MANAGER_ROLES.includes(req.user.role)) {
      sql += " AND c.status = 'published'";
    }

    if (req.query.theme) { sql += ' AND c.theme = ?'; params.push(req.query.theme); }
    if (req.query.grade_level) { sql += ' AND c.grade_level = ?'; params.push(req.query.grade_level); }
    if (req.query.difficulty) { sql += ' AND c.difficulty = ?'; params.push(req.query.difficulty); }
    if (req.query.status) { sql += ' AND c.status = ?'; params.push(req.query.status); }

    sql += ' ORDER BY c.updated_at DESC';

    const courses = db.prepare(sql).all(...params).map((course) => {
      if (req.user.role !== 'student') return { ...course, progress: 0 };
      const progress = db.prepare(`SELECT COALESCE(ROUND(AVG(COALESCE(lp.progress, 0))), 0) AS progress
        FROM lessons l LEFT JOIN lesson_progress lp
          ON lp.lesson_id = l.id AND lp.student_id = ?
        WHERE l.course_id = ?`).get(req.user.id, course.id).progress;
      return { ...course, progress };
    });
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
      return res.json({
        title: '创建课程', course: req.body,
        errors: ['课程名称、适用学段和难度等级为必填项']
      });
    }

    const result = db.prepare(
      `INSERT INTO courses (title, theme, description, driving_question, story_line,
        grade_level, difficulty, total_hours, materials_needed, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, theme || null, description || null, driving_question || null,
         story_line || null, grade_level, difficulty, total_hours || null,
         materials_needed || null, req.user.id);

    res.json({ message: '课程创建成功！现在可以添加课时和上传资源', id: result.lastInsertRowid });
  } catch (err) {
    console.error('创建课程错误:', err);
    res.json({ title: '创建课程', course: req.body, errors: ['创建失败，请稍后重试'] });
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

    if (!COURSE_MANAGER_ROLES.includes(req.user.role) && course.status !== 'published') {
      return res.status(400).json({ error: '课程不存在' });
    }

    const lessons = db.prepare(`SELECT l.*, COALESCE(lp.progress, 0) AS progress,
      COALESCE(lp.last_position, 0) AS last_position
      FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = ?
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
    const resources = db.prepare('SELECT * FROM resources WHERE course_id = ? ORDER BY created_at DESC').all(id);
    const enrollments = db.prepare(
      `SELECT e.*, u.real_name as student_name, u.username, s.name as school_name, c2.name as class_name
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN classes c2 ON u.class_id = c2.id
       WHERE e.course_id = ?
       ORDER BY e.enrolled_at DESC`
    ).all(id);

    res.json({ title: course.title, course, lessons, tasks, progress, resources, enrollments });
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
    db.prepare(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    res.json({ message: '课程更新成功' });
  } catch (err) {
    console.error('更新课程错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 删除课程
exports.delete = (req, res) => {
  try {
    if (!canManageCourse(req.user, req.params.id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
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
    const { title, description, duration } = req.body;

    if (!title) {
      return res.status(400).json({ error: '课时名称不能为空' });
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM lessons WHERE course_id = ?').get(id);
    const sortOrder = (maxOrder.max_order || 0) + 1;

    db.prepare(
      'INSERT INTO lessons (course_id, title, description, duration, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(id, title, description || null, duration || null, sortOrder);

    res.json({ message: '课时添加成功' });
  } catch (err) {
    console.error('添加课时错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 上传资源
exports.uploadResource = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* 文件可能已删除 */ }
      }
      return res.status(400).json({ error: '无权管理该课程' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const { resource_type, title } = req.body;
    db.prepare(
      'INSERT INTO resources (course_id, resource_type, title, file_path, file_size, upload_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, resource_type || 'other', title || req.file.originalname,
         req.file.path, req.file.size, req.user.id);

    res.json({ message: '资源上传成功' });
  } catch (err) {
    console.error('上传资源错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
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
    if (!COURSE_MANAGER_ROLES.includes(req.user.role) && resource.course_status !== 'published') {
      return res.status(404).json({ error: '附件不存在' });
    }

    const resolvedPath = path.resolve(resource.file_path);
    const relativePath = path.relative(UPLOAD_ROOT, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '附件文件不存在' });
    }
    return res.download(resolvedPath, resource.title || path.basename(resolvedPath));
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

    db.prepare(
      `INSERT INTO tasks (lesson_id, title, description, task_type, require_upload, sort_order, deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(lesson_id, title, description || null, task_type || 'inquiry',
         require_upload === undefined
           ? 1
           : require_upload === true || require_upload === 'on' || require_upload === 1 || require_upload === '1' ? 1 : 0,
         (maxOrder.max_order || 0) + 1, deadline || null);

    res.json({ message: '任务添加成功' });
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
      JOIN enrollments e ON e.course_id = c.id AND e.student_id = ?
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

// 学生报名课程
exports.enroll = (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageCourse(req.user, id)) {
      return res.status(400).json({ error: '无权管理该课程' });
    }
    const { student_ids } = req.body;

    if (!student_ids || student_ids.length === 0) {
      return res.status(400).json({ error: '请选择学生' });
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(id);
    if (!course) {
      return res.status(400).json({ error: '课程不存在' });
    }

    const ids = Array.isArray(student_ids) ? student_ids : [student_ids];
    let added = 0;
    const stmt = db.prepare('INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)');
    for (const sid of ids) {
      const student = db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'student'"
      ).get(sid);
      if (!student) continue;
      const result = stmt.run(sid, id);
      if (result.changes > 0) added++;
    }

    res.json({ message: `已添加 ${added} 名学生到课程` });
  } catch (err) {
    console.error('报名错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 学生自主选课 API（限3门，返回JSON）
exports.studentEnroll = (req, res) => {
  try {
    const studentId = req.user.id;
    const { course_id } = req.body;

    if (!course_id) {
      return res.json({ success: false, message: '请选择课程' });
    }

    const enroll = db.transaction((studentId, courseId) => {
      const myCount = db.prepare(
        'SELECT COUNT(*) as count FROM enrollments WHERE student_id = ?'
      ).get(studentId);

      if (myCount.count >= 3) {
        return { success: false, message: '最多选择3门课程，请先退选其他课程' };
      }

      const course = db.prepare(
        "SELECT id, title FROM courses WHERE id = ? AND status = 'published'"
      ).get(courseId);

      if (!course) {
        return { success: false, message: '课程不存在或未发布' };
      }

      const result = db.prepare(
        'INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)'
      ).run(studentId, courseId);

      if (result.changes === 0) {
        return { success: false, message: '已经选择过该课程' };
      }

      return { success: true, message: '成功选择课程《' + course.title + '》' };
    });

    res.json(enroll(studentId, course_id));
  } catch (err) {
    console.error('学生选课错误:', err);
    res.json({ success: false, message: '选课失败，请稍后重试' });
  }
};
