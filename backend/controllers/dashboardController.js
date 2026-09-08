const db = require('../config/database');

// 每日运势数据
const FORTUNES = [
  { level:'大吉', emoji:'🌟', desc:'今天灵感爆棚，适合开启新项目或攻克难题！', color:'#ff6b35' },
  { level:'中吉', emoji:'✨', desc:'状态不错，按部就班推进会有意外收获。', color:'#f9ab00' },
  { level:'小吉', emoji:'🍀', desc:'保持好奇心，一个小发现可能带来大改变。', color:'#0d904f' },
  { level:'吉',   emoji:'💪', desc:'稳扎稳打的一天，专注当下就是最好的策略。', color:'#1a73e8' },
  { level:'末吉', emoji:'🌤️', desc:'可能需要多些耐心，好事多磨，别着急。', color:'#5f6368' },
  { level:'凶',   emoji:'🌧️', desc:'今天适合反思和复盘，调整方向比埋头苦干更重要。', color:'#9334e6' },
  { level:'大凶', emoji:'⚡', desc:'挑战日！但别忘了，最难的关卡往往经验值最高。', color:'#d93025' },
];

// 每日运势算法（基于日期+用户ID，同一天同一用户抽到同一运势）
function getDailyFortune(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = hashCode(today + '-' + userId);
  return FORTUNES[Math.abs(seed) % FORTUNES.length];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

exports.index = (req, res) => {
  const user = req.user;
  const fortune = getDailyFortune(user.id);
  const today = new Date().toLocaleDateString('zh-CN', {
    year:'numeric', month:'long', day:'numeric', weekday:'long'
  });

  let viewData = { title: '工作台', fortune, today, user };

  try {
    if (user.role === 'admin') {
      viewData.schools = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) as class_count,
          (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id) as user_count
        FROM schools s
        ORDER BY s.name
      `).all();
      viewData.feedbackStats = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('closed', 'rejected') THEN 1 ELSE 0 END) AS urgent
        FROM feedbacks
      `).get();
    }

    // === 教师/导师端：显示负责的课程和学生进度 ===
    if (['academic_mentor', 'teacher', 'admin'].includes(user.role)) {
      // 导师创建的课程
      const myCourses = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count,
          (SELECT COUNT(*) FROM works w JOIN enrollments e ON w.enrollment_id = e.id WHERE e.course_id = c.id) as work_count
        FROM courses c
        WHERE c.created_by = ? AND c.status != 'archived'
        ORDER BY c.updated_at DESC
      `).all(user.id);

      // 所有课程（admin看全部）
      const allCourses = user.role === 'admin' ? db.prepare(`
        SELECT c.*, u.real_name as creator_name,
          (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count,
          (SELECT COUNT(*) FROM works w JOIN enrollments e ON w.enrollment_id = e.id WHERE e.course_id = c.id) as work_count
        FROM courses c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.status != 'archived'
        ORDER BY c.updated_at DESC
      `).all() : [];

      // 最近学生动态
      const recentWorks = user.role === 'admin' ? db.prepare(`
        SELECT w.*, u.real_name as student_name, c.title as course_title
        FROM works w
        JOIN users u ON w.student_id = u.id
        LEFT JOIN enrollments e ON w.enrollment_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        ORDER BY w.created_at DESC LIMIT 10
      `).all() : user.role === 'teacher' ? db.prepare(`
        SELECT w.*, u.real_name as student_name, c.title as course_title
        FROM works w
        JOIN users u ON w.student_id = u.id
        LEFT JOIN enrollments e ON w.enrollment_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE u.school_id = ?
        ORDER BY w.created_at DESC LIMIT 10
      `).all(user.school_id || 0) : db.prepare(`
        SELECT w.*, u.real_name as student_name, c.title as course_title
        FROM works w
        JOIN users u ON w.student_id = u.id
        JOIN enrollments e ON w.enrollment_id = e.id
        JOIN courses c ON e.course_id = c.id
        WHERE c.created_by = ?
        ORDER BY w.created_at DESC LIMIT 10
      `).all(user.id);

      viewData.myCourses = myCourses;
      viewData.allCourses = allCourses;
      viewData.recentWorks = recentWorks;
    }

    // === 学生端：显示参与的课程、进度、反思入口 ===
    if (user.role === 'student') {
      // 参与的课程
      const myCourses = db.prepare(`
        SELECT c.*, e.id as enrollment_id, e.enrolled_at,
          (SELECT COUNT(*) FROM works w2 WHERE w2.student_id = ? AND w2.enrollment_id = e.id) as my_work_count,
          (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.student_id = ?
        ORDER BY e.enrolled_at DESC
      `).all(user.id, user.id);

      // 每门课的最新作品
      for (const course of myCourses) {
        course.recentWorks = db.prepare(`
          SELECT * FROM works WHERE student_id = ? AND enrollment_id = ? ORDER BY created_at DESC LIMIT 3
        `).all(user.id, course.enrollment_id);
      }

      // 今日是否已提交反思日志
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayReflection = db.prepare(`
        SELECT COUNT(*) as count FROM reflections
        WHERE student_id = ? AND date(created_at) = ?
      `).get(user.id, todayStr);
      const canSubmitReflection = todayReflection.count === 0;

      viewData.myCourses = myCourses;
      viewData.canSubmitReflection = canSubmitReflection;
      viewData.todayReflectionCount = todayReflection.count;
    }

    res.json(viewData);
  } catch (err) {
    console.error('仪表盘错误:', err);
    res.json({ title: '工作台', fortune, today, user, error: '加载数据失败' });
  }
};

exports.showAddSchool = (req, res) => {
  try {
    const schools = db.prepare('SELECT id, name FROM schools ORDER BY name').all();
    res.json({ title: '添加加盟学校', school: {}, schools, errors: [] });
  } catch (err) {
    console.error('加载学校列表错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.addSchool = (req, res) => {
  try {
    const { name, description, tags, region, contact_person, contact_phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '学校名称不能为空' });
    }
    const result = db.prepare(
      `INSERT INTO schools (name, description, tags, region, contact_person, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), description || null, tags || null, region || null,
          contact_person || null, contact_phone || null);
    res.json({ message: '学校添加成功', id: Number(result.lastInsertRowid) });
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
    res.json({ message: '学校已删除' });
  } catch (err) {
    console.error('删除学校错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.showSchool = (req, res) => {
  try {
    const school = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) as class_count,
        (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id) as user_count
      FROM schools s
      WHERE s.id = ?
    `).get(req.params.id);

    if (!school) {
      return res.status(400).json({ error: '学校不存在' });
    }

    const classes = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id) as student_count
      FROM classes c
      WHERE c.school_id = ?
      ORDER BY c.grade, c.name
    `).all(req.params.id);

    res.json({ title: `${school.name} - 学校详情`, school, classes });
  } catch (err) {
    console.error('加载学校详情错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.addClass = (req, res) => {
  try {
    const { name, grade } = req.body;
    const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(req.params.id);
    if (!school) {
      return res.status(400).json({ error: '学校不存在' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '班级名称不能为空' });
    }
    const result = db.prepare('INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)')
      .run(name.trim(), req.params.id, grade || null);
    res.json({ message: '班级添加成功', id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('添加班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteClass = (req, res) => {
  try {
    const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND school_id = ?')
      .get(req.params.classId, req.params.id);
    if (!cls) {
      return res.status(400).json({ error: '班级不存在' });
    }
    db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.classId);
    res.json({ message: '班级已删除' });
  } catch (err) {
    console.error('删除班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};
