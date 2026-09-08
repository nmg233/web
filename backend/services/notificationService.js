const db = require('../config/database');
const {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LEVELS,
  NOTIFICATION_EVENTS,
} = require('../constants/notification');

class NotificationError extends Error {
  constructor(message, status = 400, code = 'NOTIFICATION_INVALID') {
    super(message);
    this.name = 'NotificationError';
    this.status = status;
    this.code = code;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeIds(ids = []) {
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function validateActionUrl(value) {
  const url = cleanText(value, 500);
  if (!url) return null;
  if (!url.startsWith('/') || url.startsWith('//')) {
    throw new NotificationError('通知跳转地址必须是站内路径');
  }
  return url;
}

function activeUserIds(ids) {
  const normalized = normalizeIds(ids);
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => '?').join(',');
  return db.prepare(`
    SELECT id FROM users
    WHERE id IN (${placeholders}) AND is_active = 1
  `).all(...normalized).map((row) => row.id);
}

function userIdsByRoles(roles = []) {
  const allowedRoles = ['admin', 'academic_mentor', 'teacher', 'student', 'media'];
  const normalized = [...new Set(roles.filter((role) => allowedRoles.includes(role)))];
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => '?').join(',');
  return db.prepare(`
    SELECT id FROM users
    WHERE role IN (${placeholders}) AND is_active = 1
  `).all(...normalized).map((row) => row.id);
}

function createForUsers(payload, recipientIds) {
  const recipients = activeUserIds(recipientIds);
  if (!recipients.length) return null;

  const eventKey = cleanText(payload.eventKey, 100);
  const title = cleanText(payload.title, 100);
  const content = cleanText(payload.content, 5000);
  const category = cleanText(payload.category, 30);
  const level = cleanText(payload.level || 'normal', 30);

  if (!eventKey) throw new NotificationError('通知事件代码不能为空');
  if (!title) throw new NotificationError('通知标题不能为空');
  if (!content) throw new NotificationError('通知正文不能为空');
  if (!NOTIFICATION_CATEGORIES.includes(category)) throw new NotificationError('无效的通知分类');
  if (!NOTIFICATION_LEVELS.includes(level)) throw new NotificationError('无效的通知级别');

  return db.transaction(() => {
    const dedupeKey = cleanText(payload.dedupeKey, 250) || null;
    const result = db.prepare(`
      INSERT INTO notifications (
        event_key, dedupe_key, title, content, summary, category, level,
        status, action_url, business_type, business_id, target_type,
        target_config, created_by, is_forced, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, 'users', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(dedupe_key) DO NOTHING
    `).run(
      eventKey,
      dedupeKey,
      title,
      content,
      cleanText(payload.summary || content, 200) || null,
      category,
      level,
      validateActionUrl(payload.actionUrl),
      cleanText(payload.businessType, 50) || null,
      Number.isInteger(Number(payload.businessId)) ? Number(payload.businessId) : null,
      JSON.stringify({ user_ids: recipients }),
      payload.createdBy || null,
      payload.isForced ? 1 : 0,
    );

    let notificationId;
    let created = result.changes > 0;
    if (created) {
      notificationId = Number(result.lastInsertRowid);
    } else {
      const existing = db.prepare('SELECT id FROM notifications WHERE dedupe_key = ?').get(dedupeKey);
      if (!existing) throw new NotificationError('通知幂等记录异常', 500, 'NOTIFICATION_DEDUPE_ERROR');
      notificationId = existing.id;
    }

    const insertRecipient = db.prepare(`
      INSERT OR IGNORE INTO user_notifications (notification_id, user_id)
      VALUES (?, ?)
    `);
    recipients.forEach((userId) => insertRecipient.run(notificationId, userId));

    return { id: notificationId, created, recipientCount: recipients.length };
  })();
}

function safeCreateForUsers(payload, recipientIds) {
  try {
    return createForUsers(payload, recipientIds);
  } catch (err) {
    console.error('创建站内通知失败:', err);
    return null;
  }
}

function buildListWhere(userId, query = {}) {
  const where = ['un.user_id = ?', 'un.is_hidden = 0'];
  const params = [userId];
  if (query.read === 'unread') where.push('un.is_read = 0');
  if (query.read === 'read') where.push('un.is_read = 1');
  if (NOTIFICATION_CATEGORIES.includes(query.category)) {
    where.push('n.category = ?');
    params.push(query.category);
  }
  if (NOTIFICATION_LEVELS.includes(query.level)) {
    where.push('n.level = ?');
    params.push(query.level);
  }
  return { whereSql: where.join(' AND '), params };
}

function listForUser(user, query = {}) {
  const { page, pageSize, offset } = normalizePagination(query);
  const { whereSql, params } = buildListWhere(user.id, query);
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE ${whereSql}
  `).get(...params).count;
  const items = db.prepare(`
    SELECT un.id AS recipient_id, un.is_read, un.read_at, un.received_at,
           n.id, n.event_key, n.title, n.content, n.summary, n.category,
           n.level, n.status, n.action_url, n.business_type, n.business_id,
           n.is_forced, n.published_at, n.withdrawn_at
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE ${whereSql}
    ORDER BY
      CASE n.level WHEN 'security' THEN 1 WHEN 'urgent' THEN 2 WHEN 'important' THEN 3 ELSE 4 END,
      un.received_at DESC, un.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return { items, pagination: { page, pageSize, total } };
}

function recent(user, rawLimit = 10) {
  const limit = Math.min(20, Math.max(1, Number.parseInt(rawLimit, 10) || 10));
  return db.prepare(`
    SELECT un.id AS recipient_id, un.is_read, un.read_at, un.received_at,
           n.id, n.title, n.summary, n.category, n.level, n.status,
           n.action_url, n.published_at
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = ? AND un.is_hidden = 0
    ORDER BY un.received_at DESC, un.id DESC
    LIMIT ?
  `).all(user.id, limit);
}

function unreadCount(user) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = ? AND un.is_read = 0 AND un.is_hidden = 0
      AND n.status = 'published'
  `).get(user.id).count;
}

function getRecipient(user, notificationId) {
  const row = db.prepare(`
    SELECT un.id AS recipient_id, un.user_id, un.is_read, un.read_at,
           un.is_hidden, un.received_at,
           n.id, n.event_key, n.title, n.content, n.summary, n.category,
           n.level, n.status, n.action_url, n.business_type, n.business_id,
           n.is_forced, n.published_at, n.withdrawn_at
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = ? AND n.id = ?
  `).get(user.id, notificationId);
  if (!row) throw new NotificationError('通知不存在', 404, 'NOTIFICATION_NOT_FOUND');
  return row;
}

function detail(user, notificationId, markAsRead = true) {
  const row = getRecipient(user, notificationId);
  if (markAsRead && !row.is_read) {
    db.prepare(`
      UPDATE user_notifications
      SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(row.recipient_id);
    row.is_read = 1;
    row.read_at = new Date().toISOString();
  }
  return row;
}

function markRead(user, notificationId) {
  const row = getRecipient(user, notificationId);
  db.prepare(`
    UPDATE user_notifications
    SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE id = ?
  `).run(row.recipient_id);
  return { id: row.id, is_read: 1 };
}

function markUnread(user, notificationId) {
  const row = getRecipient(user, notificationId);
  db.prepare('UPDATE user_notifications SET is_read = 0, read_at = NULL WHERE id = ?')
    .run(row.recipient_id);
  return { id: row.id, is_read: 0 };
}

function markAllRead(user) {
  const result = db.prepare(`
    UPDATE user_notifications
    SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ? AND is_hidden = 0 AND is_read = 0
  `).run(user.id);
  return { changed: result.changes };
}

function hide(user, notificationId) {
  const row = getRecipient(user, notificationId);
  db.prepare('UPDATE user_notifications SET is_hidden = 1 WHERE id = ?').run(row.recipient_id);
  return { id: row.id, is_hidden: 1 };
}

function hideRead(user) {
  const result = db.prepare(`
    UPDATE user_notifications
    SET is_hidden = 1
    WHERE user_id = ? AND is_read = 1 AND is_hidden = 0
  `).run(user.id);
  return { changed: result.changes };
}

module.exports = {
  NotificationError,
  NOTIFICATION_EVENTS,
  createForUsers,
  safeCreateForUsers,
  userIdsByRoles,
  listForUser,
  recent,
  unreadCount,
  detail,
  markRead,
  markUnread,
  markAllRead,
  hide,
  hideRead,
};
