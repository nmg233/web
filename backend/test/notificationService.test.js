const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const Database = require('better-sqlite3');

const testDbPath = path.join(os.tmpdir(), `pbl-notification-${process.pid}-${Date.now()}.db`);
const bootstrapDb = new Database(testDbPath);
bootstrapDb.close();

process.env.DB_PATH = testDbPath;

const db = require('../config/database');
const notificationService = require('../services/notificationService');

const admin = { id: 1, role: 'admin', real_name: '管理员' };
const student = { id: 2, role: 'student', real_name: '测试学生' };
const otherStudent = { id: 3, role: 'student', real_name: '其他学生' };

function seedUsers() {
  const insert = db.prepare(`
    INSERT INTO users (id, username, password_hash, real_name, role)
    VALUES (?, ?, 'test-hash', ?, ?)
  `);
  insert.run(admin.id, 'admin_test', admin.real_name, admin.role);
  insert.run(student.id, 'student_test', student.real_name, student.role);
  insert.run(otherStudent.id, 'student_other', otherStudent.real_name, otherStudent.role);
}

function createNotification(overrides = {}, recipients = [student.id]) {
  return notificationService.createForUsers({
    eventKey: 'test.notification',
    dedupeKey: 'test.notification:1',
    title: '测试通知',
    summary: '用于验证通知服务',
    content: '这是一条用于自动化测试的站内通知。',
    category: 'system',
    level: 'normal',
    actionUrl: '/dashboard',
    createdBy: admin.id,
    ...overrides,
  }, recipients);
}

beforeEach(() => {
  db.exec(`
    DELETE FROM user_notifications;
    DELETE FROM notifications;
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

test('通知按收件人隔离并支持筛选和分页', () => {
  createNotification({}, [student.id]);
  createNotification({
    dedupeKey: 'test.notification:2',
    title: '重要作品通知',
    category: 'work',
    level: 'important',
  }, [otherStudent.id]);

  const studentList = notificationService.listForUser(student, { page: 1, pageSize: 10 });
  const otherList = notificationService.listForUser(otherStudent, { category: 'work' });
  assert.equal(studentList.pagination.total, 1);
  assert.equal(studentList.items[0].title, '测试通知');
  assert.equal(otherList.pagination.total, 1);
  assert.equal(otherList.items[0].level, 'important');
});

test('相同幂等键只创建一条通知并补齐收件人', () => {
  const first = createNotification({}, [student.id]);
  const second = createNotification({}, [student.id, otherStudent.id]);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.id, second.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_notifications').get().count, 2);
});

test('支持单条与批量更新已读状态', () => {
  const first = createNotification();
  const second = createNotification({ dedupeKey: 'test.notification:2', title: '第二条通知' });
  assert.equal(notificationService.unreadCount(student), 2);

  notificationService.markRead(student, first.id);
  assert.equal(notificationService.unreadCount(student), 1);
  notificationService.markUnread(student, first.id);
  assert.equal(notificationService.unreadCount(student), 2);

  const changed = notificationService.markAllRead(student);
  assert.equal(changed.changed, 2);
  assert.equal(notificationService.unreadCount(student), 0);

  const detail = notificationService.detail(student, second.id);
  assert.equal(detail.is_read, 1);
});

test('详情会自动已读，隐藏后不再出现在列表', () => {
  const created = createNotification();
  const detail = notificationService.detail(student, created.id);
  assert.equal(detail.is_read, 1);

  notificationService.hide(student, created.id);
  assert.equal(notificationService.listForUser(student).pagination.total, 0);
});

test('非收件人无法读取或修改通知', () => {
  const created = createNotification();
  assert.throws(
    () => notificationService.detail(otherStudent, created.id),
    (err) => err.code === 'NOTIFICATION_NOT_FOUND' && err.status === 404,
  );
  assert.throws(
    () => notificationService.markRead(otherStudent, created.id),
    (err) => err.code === 'NOTIFICATION_NOT_FOUND',
  );
});

test('已撤回通知不计入未读数量', () => {
  const created = createNotification();
  db.prepare("UPDATE notifications SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(created.id);
  assert.equal(notificationService.unreadCount(student), 0);
});
