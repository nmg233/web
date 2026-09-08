const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'pbl_platform.db');
const forceInit = process.argv.includes('--force') || process.env.DB_FORCE_INIT === '1';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run db:init in production');
  process.exit(1);
}

if (fs.existsSync(dbPath) && !forceInit) {
  console.error('Database already exists. Run "npm run db:init -- --force" to reset it.');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const file = dbPath + suffix;
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

if (forceInit) {
  console.log('Old database files removed');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('📦 正在初始化数据库...');

// 执行建表 SQL
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
console.log('✅ 数据库表结构创建成功');

// ============================================
// 插入测试数据
// ============================================
const adminPwd = bcrypt.hashSync('admin123', 10);
const mentorPwd = bcrypt.hashSync('mentor123', 10);
const teacherPwd = bcrypt.hashSync('teacher123', 10);
const studentPwd = bcrypt.hashSync('student123', 10);

// 学校
db.prepare("INSERT INTO schools (name, region) VALUES (?, ?)").run('北航附属实验学校', '北京市海淀区');
db.prepare("INSERT INTO schools (name, region) VALUES (?, ?)").run('华水小学', '河南省郑州市');
console.log('✅ 测试学校已创建');

// 班级
db.prepare("INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)").run('四年级1班', 1, '四年级');
db.prepare("INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)").run('五年级2班', 1, '五年级');
db.prepare("INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)").run('六年级3班', 2, '六年级');
console.log('✅ 测试班级已创建');

// 用户
db.prepare("INSERT INTO users (username, password_hash, real_name, role) VALUES (?, ?, ?, 'admin')").run('adminpbl', adminPwd, '管理员');
db.prepare("INSERT INTO users (username, password_hash, real_name, role) VALUES (?, ?, ?, 'academic_mentor')").run('mentor_zhang', mentorPwd, '张导师');
db.prepare("INSERT INTO users (username, password_hash, real_name, role, school_id, class_id) VALUES (?, ?, ?, 'teacher', ?, ?)").run('teacher_li', teacherPwd, '李老师', 1, 1);
db.prepare("INSERT INTO users (username, password_hash, real_name, role, school_id, class_id) VALUES (?, ?, ?, 'student', ?, ?)").run('student_wang', studentPwd, '王小明', 1, 1);
db.prepare("INSERT INTO users (username, password_hash, real_name, role, school_id, class_id) VALUES (?, ?, ?, 'student', ?, ?)").run('student_chen', studentPwd, '陈小红', 1, 1);
db.prepare("INSERT INTO users (username, password_hash, real_name, role, school_id, class_id) VALUES (?, ?, ?, 'student', ?, ?)").run('student_liu', studentPwd, '刘小宇', 1, 2);
console.log('✅ 测试用户已创建');

// 课程
db.prepare(`INSERT INTO courses (title, theme, description, driving_question, story_line, grade_level, difficulty, total_hours, status, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  '月球基地设计师', '月球基地',
  '学生以设计师身份为宇航员设计月球生活空间，学习空间规划和航天知识。',
  '如何为宇航员设计一个能在月球上安全生活、工作和休息的基地？',
  '2040年，中国月球科研站需要扩建。你作为基地设计师，接到了任务：为新增的4名宇航员设计生活舱、实验舱和能源舱。',
  'primary', 'basic', 180, 'published', 2
);

db.prepare(`INSERT INTO courses (title, theme, description, driving_question, grade_level, difficulty, status, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
  '无人机应急救援方案', '无人机救援',
  '初中生分组设计无人机应急投送方案，学习飞行原理、路径规划和团队协作。',
  '当自然灾害导致道路中断时，如何用无人机为受灾群众送去急需物资？',
  'junior', 'advanced', 'draft', 2
);

db.prepare(`INSERT INTO courses (title, theme, description, driving_question, grade_level, difficulty, total_hours, status, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  '火星探测器着陆保护方案', '火星探测',
  '高中生深入探究火星探测器的着陆技术，完成工程设计和论证。',
  '如何设计一套可靠的火星探测器着陆保护系统，使其在极端环境下安全着陆？',
  'senior', 'challenge', 360, 'draft', 2
);
console.log('✅ 测试课程已创建');

// 课时
db.prepare("INSERT INTO lessons (course_id, title, description, sort_order, duration) VALUES (?, ?, ?, ?, ?)").run(1, '认识月球环境', '了解月球的重力、温度、辐射等环境特征', 1, 45);
db.prepare("INSERT INTO lessons (course_id, title, description, sort_order, duration) VALUES (?, ?, ?, ?, ?)").run(1, '空间规划设计', '学习如何合理规划有限空间，满足多种功能需求', 2, 45);
db.prepare("INSERT INTO lessons (course_id, title, description, sort_order, duration) VALUES (?, ?, ?, ?, ?)").run(1, 'VR建模与展示', '使用VR工具搭建月球基地模型并展示', 3, 60);
console.log('✅ 测试课时已创建');

// 任务
db.prepare("INSERT INTO tasks (lesson_id, title, description, task_type, sort_order, require_upload) VALUES (?, ?, ?, ?, ?, ?)").run(1, '月球环境调研', '用AI助手查找月球环境数据，完成环境调研表', 'inquiry', 1, 1);
db.prepare("INSERT INTO tasks (lesson_id, title, description, task_type, sort_order, require_upload) VALUES (?, ?, ?, ?, ?, ?)").run(2, '基地草图设计', '画出月球基地的平面草图，标注各功能区', 'creation', 1, 1);
db.prepare("INSERT INTO tasks (lesson_id, title, description, task_type, sort_order, require_upload) VALUES (?, ?, ?, ?, ?, ?)").run(3, 'VR场景搭建', '在VR环境中搭建你的基地，截图并录屏', 'creation', 1, 1);
console.log('✅ 测试任务已创建');

// 课程资源
db.prepare("INSERT INTO resources (course_id, resource_type, title, upload_by) VALUES (?, ?, ?, ?)").run(1, 'lesson_plan', '月球基地课程教案', 2);
db.prepare("INSERT INTO resources (course_id, resource_type, title, upload_by) VALUES (?, ?, ?, ?)").run(1, 'guide_card', 'VR操作指南卡', 2);
db.prepare("INSERT INTO resources (course_id, resource_type, title, upload_by) VALUES (?, ?, ?, ?)").run(1, 'template', '月球环境调研表模板', 2);
console.log('✅ 测试资源已创建');

// 学生报名
db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)").run(4, 1);
db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)").run(5, 1);
db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)").run(6, 1);
console.log('✅ 学生报名记录已创建');

db.close();

console.log('\n🎉 数据库初始化完成！');
console.log('\n📋 测试账号：');
console.log('  管理员: adminpbl / admin123');
console.log('  导师:   mentor_zhang / mentor123');
console.log('  教师:   teacher_li / teacher123');
console.log('  学生:   student_wang / student123');
console.log('\n启动应用: npm start 或 npm run dev');
