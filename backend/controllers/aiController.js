const db = require('../config/database');
const { COURSE_MANAGER_ROLES } = require('../middleware/auth');

// 获取 AI 助教可用的课程列表
exports.getCourses = (req, res) => {
  try {
    const user = req.user;
    // 教师端 AI 助手已下线（教师不参与课程建设，无课程上下文）
    if (user.role === 'teacher') {
      return res.status(403).json({ error: 'AI 助手暂不对教师开放' });
    }
    let courses = [];

    if (user.role === 'student') {
      courses = db.prepare(`
        SELECT c.id, c.title, c.description, c.driving_question, c.grade_level, c.difficulty
        FROM enrollments e JOIN courses c ON e.course_id = c.id
        WHERE e.student_id = ?
      `).all(user.id);
    } else if (['academic_mentor', 'teacher', 'admin'].includes(user.role)) {
      courses = db.prepare(`
        SELECT id, title, description, driving_question, grade_level, difficulty
        FROM courses WHERE created_by = ? AND status != 'archived'
      `).all(user.id);
    }

    res.json({ title: 'AI 学习助手', courses });
  } catch (err) {
    console.error('AI助手页错误:', err);
    res.json({ title: 'AI 学习助手', courses: [] });
  }
};

// AI 回答（基于课程知识库的规则匹配 + 通用回复）
exports.ask = (req, res) => {
  try {
    // 教师端 AI 助手已下线
    if (req.user.role === 'teacher') {
      return res.status(403).json({ error: 'AI 助手暂不对教师开放' });
    }
    const { question, course_id } = req.body;

    if (!question || question.trim().length === 0) {
      return res.json({ answer: '请提出你的问题，我会尽力帮你解答。' });
    }

    // 获取课程上下文
    let courseContext = '';
    if (course_id) {
      const user = req.user;
      let course = null;

      if (user.role === 'student') {
        course = db.prepare(`
          SELECT c.title, c.description, c.driving_question, c.story_line
          FROM courses c
          JOIN enrollments e ON e.course_id = c.id
          WHERE c.id = ? AND e.student_id = ? AND c.status = 'published'
        `).get(course_id, user.id);
      } else if (COURSE_MANAGER_ROLES.includes(user.role) || user.role === 'teacher') {
        course = db.prepare(`
          SELECT title, description, driving_question, story_line
          FROM courses
          WHERE id = ? AND created_by = ?
        `).get(course_id, user.id);
      }

      if (course) {
        courseContext = `当前课程《${course.title}》：${course.description || ''}。驱动问题：${course.driving_question || ''}`;
      }
    }

    // 基于关键词的规则匹配回复
    const answer = generateAnswer(question, courseContext);
    res.json({ answer });
  } catch (err) {
    console.error('AI回答错误:', err);
    res.json({ answer: '抱歉，AI 助教暂时遇到了问题。请稍后再试。' });
  }
};

function generateAnswer(question, context) {
  const q = question.toLowerCase();

  // PBL 相关
  if (q.includes('pbl') || q.includes('项目式') || q.includes('怎么做') || q.includes('如何开始')) {
    return `在 PBL（项目式学习）中，关键是先理解驱动问题（Driving Question），然后分步探究。${context ? '\n\n' + context : ''}\n\n建议你：
1. 先仔细阅读课程任务书
2. 把大问题拆成小问题，逐一攻克
3. 遇到困难时记录在反思日志中
4. 多和组员讨论，碰撞新思路`;
  }

  // 月球基地
  if (q.includes('月球') || q.includes('基地') || q.includes('太空') || q.includes('宇航员')) {
    return `关于月球基地设计，你需要考虑几个关键因素：
🌡️ **温度**：月球白天约127°C，夜晚约-173°C，基地需要强大的温控系统
🛡️ **辐射**：没有大气层保护，宇宙辐射和微陨石是主要威胁
💨 **真空环境**：基地必须完全密封，维持适合人类生存的气压和氧气
💧 **资源**：水冰可能存在于月球极地陨石坑中，可以开采利用
🏗️ **建造材料**：可以探索使用月壤（regolith）3D打印建筑材料

建议你从"居住舱""实验舱""能源舱"三个功能区分别思考！`;
  }

  // 无人机
  if (q.includes('无人机') || q.includes('飞行') || q.includes('救援')) {
    return `无人机应急救援方案的核心要素：
✈️ **飞行能力**：载重、续航时间、抗风能力
🗺️ **路径规划**：如何避开障碍物，找到最短安全路线
📦 **物资投送**：降落伞投放？定点着陆？需要根据物资类型选择
🌧️ **环境适应**：雨天、大风、夜间飞行能力
🤝 **团队协作**：多架无人机如何分工配合？

你可以先用纸笔画出飞行路线和投放方案，再逐步细化！`;
  }

  // 火星探测
  if (q.includes('火星') || q.includes('着陆') || q.includes('探测器')) {
    return `火星探测器着陆是一个经典的工程挑战问题：
🪂 **进入大气层**：速度约20000km/h → 需要在几分钟内减速到0
🔥 **热防护**：大气摩擦产生极高温度，需要隔热盾
🪂 **降落伞减速**：超音速条件下展开降落伞是关键技术难点
🚀 **反推火箭**：最后阶段用反推火箭实现软着陆
🛞 **地形选择**：着陆点必须平坦、无大石块

这就是"恐怖7分钟"——从进入大气层到着陆，过程中探测器必须自主完成所有操作！`;
  }

  // VR/虚拟现实
  if (q.includes('vr') || q.includes('虚拟现实') || q.includes('3d')) {
    return `VR（虚拟现实）技术在 PBL 课程中的应用：
🔍 **沉浸观察**：用VR进入月球/火星场景，获得直观的空间感受
🎨 **3D创作**：在VR环境中搭建你的设计方案
📐 **空间理解**：比平面图纸更直观地理解尺寸和比例
📸 **成果展示**：VR截图和录屏可以作为项目作品的一部分

如果你在VR操作中遇到困难，可以参考课程"VR操作指南卡"中的步骤说明！`;
  }

  // 反思相关
  if (q.includes('反思') || q.includes('总结') || q.includes('收获')) {
    return `写好反思日志的关键是诚实面对自己的学习过程。你可以从这几个角度思考：
① **遇到的困难**：具体是什么问题？卡在了哪一步？
② **解决方案**：你是怎么尝试的？向谁求助了？查了什么资料？
③ **改进方向**：如果再给你一次机会，你会怎么做？
④ **新问题**：这个过程让你产生了什么新的好奇心？

记住：反思不是写"正确答案"，而是记录真实的思考过程！`;
  }

  // 默认回复
  const tips = [
    '你可以问我关于PBL课程的任何问题',
    '试试问："月球基地设计要注意什么？"',
    '试试问："怎么写好反思日志？"',
    '试试问："无人机救援方案该怎么做？"',
    '试试问："VR在课程中有什么用？"',
  ];

  return `你好！我是 AI 学习助手 🤖\n\n${context ? context + '\n\n' : ''}关于你的问题"${question}"，我建议从以下几个方面思考：\n\n1. 回顾课程中的驱动问题，这是项目的核心目标\n2. 把大问题分解成小步骤，一步步解决\n3. 和同学讨论，不同的视角可能带来新灵感\n4. 在反思日志中记录你的思考过程\n\n💡 ${tips[Math.floor(Math.random() * tips.length)]}`;
}
