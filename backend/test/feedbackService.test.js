const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const Database = require('better-sqlite3');

const testDbPath = path.join(os.tmpdir(), `pbl-feedback-${process.pid}-${Date.now()}.db`);
const bootstrapDb = new Database(testDbPath);
bootstrapDb.close();
bootstrapDb.close();

process.env.DB_PATH = testDbPath;

const db = require('../config/database');
const feedbackService = require('../services/feedbackService');

const admin = { id: 1, role: 'admin', real_name: '管理员' };
const student = { id: 2, role: 'student', real_name: '测试学生' };
const otherStudent = { id: 3, role: 'student', real_name: '其他学生' };

function seedUsers() {
  db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role)
    VALUES (?, ?, 'test-hash', ?, ?)
  `).run(admin.id, 'admin_test', admin.real_name, admin.role);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role)
    VALUES (?, ?, 'test-hash', ?, ?)
  `).run(student.id, 'student_test', student.real_name, student.role);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role)
    VALUES (?, ?, 'test-hash', ?, ?)
  `).run(otherStudent.id, 'student_other', otherStudent.real_name, otherStudent.role);
}

function createFeedback() {
  return feedbackService.create(student, {
    type: 'bug',
    module: 'works',
    title: '作品页面无法打开',
    description: '点击作品详情后页面没有显示预期内容。',
    allow_contact: true,
    source_path: '/works/1',
  });
}

beforeEach(() => {
  db.exec(`
    DELETE FROM feedback_attachments;
    DELETE FROM feedback_messages;
    DELETE FROM feedbacks;
    DELETE FROM users;
  `);
  seedUsers();
});

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('用户可以创建、列出并查看自己的反馈', () => {
  const created = createFeedback();
  assert.match(created.feedback_no, /^FB-\d{8}-\d{6}$/);
  assert.equal(created.user_id, student.id);
  assert.equal(created.status, 'pending');

  const list = feedbackService.listMine(student, { page: 1, pageSize: 10 });
  assert.equal(list.pagination.total, 1);
  assert.equal(list.items[0].id, created.id);

  const detail = feedbackService.detail(student, created.id);
  assert.equal(detail.feedback.title, '作品页面无法打开');
  assert.equal(detail.messages[0].message_type, 'system');
});

test('其他用户无法查看或回复不属于自己的反馈', () => {
  const created = createFeedback();
  assert.throws(
    () => feedbackService.detail(otherStudent, created.id),
    (err) => err.code === 'FEEDBACK_FORBIDDEN' && err.status === 403,
  );
  assert.throws(
    () => feedbackService.addPublicMessage(otherStudent, created.id, '尝试越权回复'),
    (err) => err.code === 'FEEDBACK_FORBIDDEN',
  );
});

test('内部备注仅管理员可见', () => {
  const created = createFeedback();
  feedbackService.addPublicMessage(admin, created.id, '我们正在处理该问题。');
  feedbackService.addInternalNote(admin, created.id, '需要检查作品详情接口。');

  const userDetail = feedbackService.detail(student, created.id);
  const adminDetail = feedbackService.detail(admin, created.id);
  assert.equal(userDetail.messages.some((item) => item.is_internal), false);
  assert.equal(adminDetail.messages.some((item) => item.is_internal), true);
});

test('管理员可以设置优先级、处理反馈，用户可以确认并重新打开', () => {
  const created = createFeedback();
  feedbackService.changePriority(admin, created.id, 'urgent');
  feedbackService.changeStatus(admin, created.id, 'processing');
  feedbackService.resolve(admin, created.id, '已修复作品详情的数据加载问题。');

  let current = feedbackService.detail(student, created.id).feedback;
  assert.equal(current.priority, 'urgent');
  assert.equal(current.status, 'resolved');
  assert.equal(current.resolution, '已修复作品详情的数据加载问题。');

  feedbackService.confirmResolved(student, created.id);
  current = feedbackService.detail(student, created.id).feedback;
  assert.equal(current.status, 'closed');

  feedbackService.reopen(student, created.id, '相同问题再次出现，请继续检查。');
  current = feedbackService.detail(student, created.id).feedback;
  assert.equal(current.status, 'processing');
});

test('管理列表支持筛选并返回统计数据', () => {
  const created = createFeedback();
  feedbackService.changePriority(admin, created.id, 'urgent');

  const list = feedbackService.listManage(admin, { status: 'pending', priority: 'urgent' });
  const stats = feedbackService.stats(admin);
  assert.equal(list.pagination.total, 1);
  assert.equal(stats.pending, 1);
  assert.equal(stats.urgent, 1);
  assert.equal(stats.total, 1);
});
