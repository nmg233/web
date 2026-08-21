const db = require('../config/database');
const { isStaff, isTeacher } = require('../middleware/auth');
const { buildUserTree } = require('../helpers/userTree');
const { sanitizeUser } = require('../helpers/userDto');

function loadStudentArchive(studentId) {
  const student = db.prepare(
    `SELECT u.*, s.name as school_name, c2.name as class_name, c2.grade
     FROM users u
     LEFT JOIN schools s ON u.school_id = s.id
     LEFT JOIN classes c2 ON u.class_id = c2.id
     WHERE u.id = ? AND u.role = 'student'`
  ).get(studentId);

  if (!student) return null;

  // AUTH-01：脱敏，剔除 password_hash 等敏感字段
  const safeStudent = sanitizeUser(student);

  const courses = db.prepare(
    `SELECT c.title, c.theme, c.grade_level, c.difficulty,
            e.enrolled_at, e.completed_at
     FROM enrollments e JOIN courses c ON e.course_id = c.id
     WHERE e.student_id = ? ORDER BY e.enrolled_at DESC`
  ).all(studentId);

  const works = db.prepare('SELECT * FROM works WHERE student_id = ? ORDER BY created_at DESC').all(studentId);

  const reflections = db.prepare(
    `SELECT r.*, l.title as lesson_title
     FROM reflections r
     LEFT JOIN lessons l ON r.lesson_id = l.id
     WHERE r.student_id = ? ORDER BY r.created_at DESC`
  ).all(studentId);

  const evaluations = db.prepare(
    `SELECT ev.*, u2.real_name as evaluator_name
     FROM evaluations ev JOIN users u2 ON ev.evaluator_id = u2.id
     WHERE ev.student_id = ? ORDER BY ev.created_at DESC`
  ).all(studentId);

  const ability = db.prepare(`SELECT ROUND(AVG(problem_discovery),1) problem_discovery, ROUND(AVG(solution_design),1) solution_design, ROUND(AVG(hands_on),1) hands_on, ROUND(AVG(data_analysis),1) data_analysis, ROUND(AVG(presentation),1) presentation FROM work_reviews r JOIN works w ON w.id=r.work_id WHERE w.student_id=?`).get(studentId);
  const growthRecords = db.prepare(`SELECT g.*, u.real_name recorder_name FROM growth_records g LEFT JOIN users u ON u.id=g.recorded_by WHERE g.student_id=? ORDER BY g.created_at DESC`).all(studentId);
  if (!growthRecords.length) {
    works.forEach((work) => growthRecords.push({ event_type: 'system', description: `提交作品《${work.title}》`, created_at: work.created_at }));
    growthRecords.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  return { student: safeStudent, courses, works, reflections, evaluations, ability, growthRecords };
}

// 档案导出页面
exports.showExport = (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(400).json({ error: '无权访问成长档案' });
    }

    const user = req.user;
    const tree = buildUserTree({
      search: req.query.search || '',
      schoolId: isTeacher(user.role) ? user.school_id : null
    });

    const courses = db.prepare('SELECT id, title FROM courses ORDER BY title').all();

    res.json({ title: '成长档案导出', tree, courses, filters: req.query });
  } catch (err) {
    console.error('导出页错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 生成档案
exports.generate = (req, res) => {
  try {
    const user = req.user;
    let studentId;

    if (user.role === 'student') {
      studentId = user.id;
    } else if (isStaff(user.role)) {
      studentId = req.query.student_id || user.id;
    } else {
      return res.status(400).json({ error: '无权查看成长档案' });
    }

    const archive = loadStudentArchive(studentId);

    if (!archive) {
      return res.status(400).json({ error: '学生不存在' });
    }

    if (isTeacher(user.role) && archive.student.school_id !== user.school_id) {
      return res.status(400).json({ error: '无权查看其他学校学生档案' });
    }

    res.json({
      student: archive.student,
      courses: archive.courses,
      works: archive.works,
      reflections: archive.reflections,
      evaluations: archive.evaluations,
      ability: archive.ability,
      growthRecords: archive.growthRecords,
      generatedAt: new Date().toLocaleString('zh-CN')
    });
  } catch (err) {
    console.error('生成档案错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.addGrowthRecord = (req, res) => {
  try {
    const description = (req.body.description || '').trim();
    const student = db.prepare("SELECT id, school_id FROM users WHERE id=? AND role='student'").get(req.body.student_id);
    if (!student || !description) return res.status(400).json({ error: '请选择学生并填写记录内容' });
    if (isTeacher(req.user.role) && student.school_id !== req.user.school_id) return res.status(403).json({ error: '无权记录该学生' });
    db.prepare("INSERT INTO growth_records (student_id,event_type,description,recorded_by) VALUES (?,'teacher',?,?)").run(student.id, description, req.user.id);
    res.json({ message: '成长记录已添加' });
  } catch (err) { res.status(500).json({ error: '添加成长记录失败' }); }
};

exports.generateBatch = (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(400).json({ error: '无权访问成长档案' });
    }

    const { school_id, class_id, search } = req.query;
    const user = req.user;
    if (isTeacher(user.role)) {
      let allowed = false;
      if (class_id) {
        const cls = db.prepare('SELECT school_id FROM classes WHERE id = ?').get(class_id);
        allowed = !!cls && cls.school_id === user.school_id;
      } else if (school_id) {
        allowed = Number(school_id) === user.school_id;
      }
      if (!allowed) {
        return res.status(400).json({ error: '教师只能导出本校学生档案' });
      }
    }
    if (!school_id && !class_id) {
      return res.status(400).json({ error: '请选择学校或班级' });
    }

    const params = [];
    let sql = "SELECT id FROM users WHERE role = 'student'";
    if (class_id) {
      sql += ' AND class_id = ?';
      params.push(class_id);
    } else {
      sql += ' AND school_id = ?';
      params.push(school_id);
    }
    if (search) {
      sql += ' AND (real_name LIKE ? OR username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY real_name';

    const studentRows = db.prepare(sql).all(...params);
    const archives = studentRows.map((row) => loadStudentArchive(row.id)).filter(Boolean);

    let scopeName = '批量成长档案';
    if (class_id) {
      const cls = db.prepare(`
        SELECT c.name as class_name, s.name as school_name
        FROM classes c
        JOIN schools s ON s.id = c.school_id
        WHERE c.id = ?
      `).get(class_id);
      scopeName = cls ? `${cls.school_name} - ${cls.class_name}` : '所选班级';
    } else if (school_id) {
      const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(school_id);
      scopeName = school ? school.name : '所选学校';
    }

    res.json({
      scopeName,
      archives,
      generatedAt: new Date().toLocaleString('zh-CN')
    });
  } catch (err) {
    console.error('批量生成档案错误:', err);
    res.status(500).json({ error: '批量导出失败' });
  }
};

// 反思日志页面
exports.showReflection = (req, res) => {
  try {
    if (['admin', 'teacher'].includes(req.user.role)) {
      return res.status(400).json({ error: '教师不提交反思日志' });
    }

    const userId = req.user.id;
    let enrollments = [];
    let isMentor = false;

    if (isStaff(req.user.role)) {
      isMentor = true;
      let sql = `
        SELECT e.id as enrollment_id, c.id as course_id, c.title as course_title,
               u.real_name as student_name, u.id as student_id
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        JOIN users u ON e.student_id = u.id
      `;
      const params = [];
      if (isTeacher(req.user.role)) {
        sql += ' WHERE u.school_id = ?';
        params.push(req.user.school_id || 0);
      }
      sql += ' ORDER BY u.real_name';
      enrollments = db.prepare(sql).all(...params);
    } else {
      enrollments = db.prepare(
        `SELECT e.id as enrollment_id, c.id as course_id, c.title as course_title
         FROM enrollments e JOIN courses c ON e.course_id = c.id
         WHERE e.student_id = ?`
      ).all(userId);
    }

    res.json({ title: '填写反思日志', enrollments, isMentor });
  } catch (err) {
    console.error('加载反思页错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 提交反思日志（每人每日限量1篇）
exports.submitReflection = (req, res) => {
  try {
    if (['admin', 'teacher'].includes(req.user.role)) {
      return res.status(400).json({ error: '教师不提交反思日志' });
    }

    const { enrollment_id, lesson_id, difficulty, solution, improvement, new_question, student_id } = req.body;
    const user = req.user;
    const staff = isStaff(user.role);

    if (staff && !student_id) {
      return res.status(400).json({ error: '请选择学生' });
    }

    const actualStudentId = staff ? student_id : user.id;
    const student = db.prepare(
      "SELECT id, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(actualStudentId);

    if (!student) {
      return res.status(400).json({ error: '所选学生不存在' });
    }

    if (isTeacher(user.role) && student.school_id !== user.school_id) {
      return res.status(400).json({ error: '教师只能为本校学生提交反思日志' });
    }

    let enrollmentCourseId = null;
    if (enrollment_id) {
      const enrollment = db.prepare(
        'SELECT id, course_id FROM enrollments WHERE id = ? AND student_id = ?'
      ).get(enrollment_id, actualStudentId);
      if (!enrollment) {
        return res.status(400).json({ error: '所选课程报名记录不属于该学生' });
      }
      enrollmentCourseId = enrollment.course_id;
    }

    if (lesson_id) {
      const lesson = db.prepare('SELECT id, course_id FROM lessons WHERE id = ?').get(lesson_id);
      if (!lesson || (enrollmentCourseId && lesson.course_id !== enrollmentCourseId)) {
        return res.status(400).json({ error: '所选课时不属于当前课程' });
      }
    }

    const submit = db.transaction((studentId) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCount = db.prepare(
        'SELECT COUNT(*) as count FROM reflections WHERE student_id = ? AND date(created_at) = ?'
      ).get(studentId, todayStr);

      if (todayCount.count >= 1) {
        return false;
      }

      db.prepare(
        `INSERT INTO reflections (student_id, enrollment_id, lesson_id, difficulty, solution, improvement, new_question)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(studentId, enrollment_id || null, lesson_id || null,
            difficulty || null, solution || null, improvement || null, new_question || null);
      return true;
    });

    if (!submit(actualStudentId)) {
      return res.status(400).json({ error: '今日已提交过反思日志，每人每日限提交1篇。明天再来吧！' });
    }

    res.json({ message: '反思日志提交成功！' });
  } catch (err) {
    console.error('提交反思错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 提交评价
exports.submitEvaluation = (req, res) => {
  try {
    const { student_id, enrollment_id, eval_type, score, comment } = req.body;

    if (!isStaff(req.user.role)) {
      return res.status(400).json({ error: '无权提交评价' });
    }

    const student = db.prepare(
      "SELECT id, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(student_id);

    if (!student) {
      return res.status(400).json({ error: '学生不存在' });
    }

    if (isTeacher(req.user.role) && student.school_id !== req.user.school_id) {
      return res.status(400).json({ error: '教师只能评价本校学生' });
    }

    if (enrollment_id) {
      const enrollment = db.prepare(
        'SELECT id FROM enrollments WHERE id = ? AND student_id = ?'
      ).get(enrollment_id, student_id);
      if (!enrollment) {
        return res.status(400).json({ error: '课程报名记录不属于该学生' });
      }
    }

    const allowedEvalTypes = ['process', 'outcome', 'peer', 'self'];
    const finalEvalType = allowedEvalTypes.includes(eval_type) ? eval_type : 'process';

    if (score && (!Number.isInteger(Number(score)) || Number(score) < 1 || Number(score) > 100)) {
      return res.status(400).json({ error: '评分需为1-100的整数' });
    }

    db.prepare(
      `INSERT INTO evaluations (evaluator_id, student_id, enrollment_id, eval_type, score, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, student_id, enrollment_id || null,
          finalEvalType, score || null, comment || null);

    res.json({ message: '评价提交成功！' });
  } catch (err) {
    console.error('提交评价错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};
