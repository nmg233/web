const db = require('../config/database');
const { toFileDto } = require('../helpers/fileDto');
const orgService = require('../services/organizationService');

// 今日项目提示（按角色定制，替代原“每日运势”）
const ROLE_PROMPTS = {
  admin: [
    { emoji: '🗂️', desc: '今天适合梳理课程与作品数据，关注待处理反馈与评审进度。', color: '#1a73e8' },
    { emoji: '🔍', desc: '检查一遍学校与用户数据，及时清理测试账号与重复记录。', color: '#0d904f' },
    { emoji: '🧭', desc: '平台稳定是教学的前提：先保障流程顺畅，再追求功能丰富。', color: '#9334e6' },
  ],
  academic_mentor: [
    { emoji: '💡', desc: '先验证你的假设，再修改方案——引导学生在实验中寻找证据。', color: '#1a73e8' },
    { emoji: '📋', desc: '及时批改待评审作品，学生对反馈的响应速度会明显提升。', color: '#f9ab00' },
    { emoji: '🎯', desc: '把大问题拆成小问题，让学生逐一攻克，比直接给答案更有效。', color: '#0d904f' },
  ],
  teacher: [
    { emoji: '📚', desc: '课前确认讲义、资料与实验器材都已就绪，线下课堂更从容。', color: '#0d904f' },
    { emoji: '👀', desc: '留意学生的课后任务完成情况，及时提醒进度落后的同学。', color: '#1a73e8' },
    { emoji: '🤝', desc: '和导师保持同步：学生的课堂表现是阶段评价的重要依据。', color: '#9334e6' },
  ],
  student: [
    { emoji: '🧪', desc: '记录失败实验的数据，它也是项目成果的一部分。', color: '#1a73e8' },
    { emoji: '✏️', desc: '完成任务前先读一遍任务书，明确要交付什么、截止到什么时候。', color: '#0d904f' },
    { emoji: '💬', desc: '遇到困难别闷头硬扛：写进反思日志，或向老师、同学求助。', color: '#f9ab00' },
    { emoji: '🔧', desc: '修改作品时对照导师的评语逐条落实，比推翻重做更高效。', color: '#9334e6' },
  ],
  media: [
    { emoji: '📸', desc: '收集课堂与作品的真实素材，好的传播来自真实的项目过程。', color: '#1a73e8' },
    { emoji: '🎬', desc: '整理素材时注意学生肖像与隐私，发布前先征得同意。', color: '#0d904f' },
  ],
};

// 每日项目提示算法（基于日期+用户ID，同一天同一用户抽到同一条）
function getDailyPrompt(userId, role) {
  const set = ROLE_PROMPTS[role] || ROLE_PROMPTS.student;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = hashCode(today + '-' + userId);
  return set[Math.abs(seed) % set.length];
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
  const prompt = getDailyPrompt(user.id, user.role);
  const today = new Date().toLocaleDateString('zh-CN', {
    year:'numeric', month:'long', day:'numeric', weekday:'long'
  });

  let viewData = { title: '工作台', prompt, today, user };

  try {
    // 平台统计仅管理员/学术导师可见（学生/教师/新媒体首页展示个人相关数据）
    if (['admin', 'academic_mentor'].includes(user.role)) {
      viewData.stats = {
        schoolCount: db.prepare('SELECT COUNT(*) AS c FROM schools').get().c,
        userCount: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
        courseCount: db.prepare('SELECT COUNT(*) AS c FROM courses').get().c,
        workCount: db.prepare('SELECT COUNT(*) AS c FROM works').get().c,
      };
    }

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
      // 导师/管理员：自己创建的课程；教师：自己授课的课程
      const myCourses = user.role === 'teacher'
        ? db.prepare(`
            SELECT c.*,
              (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as student_count,
              (SELECT COUNT(*) FROM works w JOIN enrollments e ON w.enrollment_id = e.id WHERE e.course_id = c.id) as work_count
            FROM courses c
            WHERE c.status != 'archived' AND EXISTS (
              SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.instructor_id = ?
            )
            ORDER BY c.updated_at DESC
          `).all(user.id)
        : db.prepare(`
            SELECT c.*,
              (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as student_count,
              (SELECT COUNT(*) FROM works w JOIN enrollments e ON w.enrollment_id = e.id WHERE e.course_id = c.id) as work_count
            FROM courses c
            WHERE c.created_by = ? AND c.status != 'archived'
            ORDER BY c.updated_at DESC
          `).all(user.id);

      // 所有课程不再下发（前端未消费，避免冗余数据）；如需可按 status/created_by 查询

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
      viewData.recentWorks = recentWorks.map(toFileDto);
    }

    // === 学生端：显示参与的课程、进度、反思入口 ===
    if (user.role === 'student') {
      // 参与的课程（仅有效报名且已发布的课程；选课由执行导师/教师/管理员统一导入）
      const myCourses = db.prepare(`
        SELECT c.*, e.id as enrollment_id, e.enrolled_at,
          (SELECT COUNT(*) FROM works w2 WHERE w2.student_id = ? AND w2.enrollment_id = e.id) as my_work_count,
          (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'published'
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

      // 下一节课：已报名课程中最近的上课场次
      const nextLesson = db.prepare(`
        SELECT l.start_at, l.end_at, l.location, l.title AS lesson_title,
               c.id AS course_id, c.title AS course_title, u.real_name AS instructor_name
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id AND c.status = 'published'
        JOIN lessons l ON l.course_id = c.id
        LEFT JOIN users u ON u.id = l.instructor_id
        WHERE e.student_id = ? AND e.status = 'active'
          AND l.start_at IS NOT NULL AND datetime(l.start_at) >= datetime('now', 'localtime', '-1 hour')
        ORDER BY datetime(l.start_at) ASC LIMIT 1
      `).get(user.id);

      // 待办任务（要求提交附件且未提交或被退回）
      const pendingTasks = db.prepare(`
        SELECT t.id, t.title, c.title AS course_title
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id AND c.status = 'published'
        JOIN lessons l ON l.course_id = c.id
        JOIN tasks t ON t.lesson_id = l.id AND t.require_upload = 1
        WHERE e.student_id = ? AND e.status = 'active'
          AND (NOT EXISTS (SELECT 1 FROM works w WHERE w.student_id = e.student_id AND w.task_id = t.id)
               OR (SELECT w.review_status FROM works w
                   WHERE w.student_id = e.student_id AND w.task_id = t.id
                   ORDER BY w.version DESC, w.created_at DESC, w.id DESC LIMIT 1) = 'rejected')
        ORDER BY t.created_at DESC
      `).all(user.id);

      // 需修改的作品（被打回且尚未重新提交）
      const revisions = db.prepare(`
        SELECT w.id, w.title, w.review_status, c.title AS course_title
        FROM works w
        LEFT JOIN enrollments e ON w.enrollment_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE w.student_id = ? AND w.review_status = 'rejected'
          AND NOT EXISTS (SELECT 1 FROM works newer
                          WHERE newer.parent_work_id = COALESCE(w.parent_work_id, w.id)
                            AND newer.version > w.version)
        ORDER BY w.updated_at DESC
      `).all(user.id);

      viewData.myCourses = myCourses;
      viewData.canSubmitReflection = canSubmitReflection;
      viewData.todayReflectionCount = todayReflection.count;
      viewData.nextLesson = nextLesson || null;
      viewData.pendingTasks = pendingTasks;
      viewData.revisions = revisions;
    }

    res.json(viewData);
  } catch (err) {
    console.error('仪表盘错误:', err);
    res.json({ title: '工作台', prompt, today, user, error: '加载数据失败' });
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
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '学校名称不能为空' });
    }
    const { id } = orgService.createSchool(req.body);
    res.json({ message: '学校添加成功', id });
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
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '班级名称不能为空' });
    }
    const cls = orgService.createClass({ ...req.body, school_id: req.params.id });
    if (!cls) {
      return res.status(400).json({ error: '学校不存在' });
    }
    res.json({ message: '班级添加成功', id: cls.id });
  } catch (err) {
    console.error('添加班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.deleteClass = (req, res) => {
  try {
    if (!orgService.deleteClass(req.params.classId)) {
      return res.status(400).json({ error: '班级不存在' });
    }
    res.json({ message: '班级已删除' });
  } catch (err) {
    console.error('删除班级错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};
