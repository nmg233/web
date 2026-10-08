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
  const key = payload.dedupeKey || require('crypto').randomUUID();
  // 业务事务中的入队失败必须向上传递，使业务一起回滚，不能产生没有通知事件的成功记录。
  try {
    db.prepare(`INSERT OR IGNORE INTO notification_outbox (event_key, payload_json, recipients_json) VALUES (?, ?, ?)`)
      .run(key, JSON.stringify({ ...payload, dedupeKey: key }), JSON.stringify(recipientIds));
  } catch (err) {
    if (db.inTransaction) throw err;
    console.error('通知事件无法持久化:', err);
    return null;
  }
  try {
    const row = db.prepare('SELECT * FROM notification_outbox WHERE event_key = ?').get(key);
    if (row.delivered_at || row.quarantined_at) return null;
    return deliverOutbox(row);
  } catch (err) {
    failOutbox(key,err);
    console.error('创建站内通知失败:', err);
    return null;
  }
}

function failOutbox(key,err) {
  const attempts=(db.prepare('SELECT attempts FROM notification_outbox WHERE event_key=?').get(key)?.attempts || 0)+1;
  db.prepare(`UPDATE notification_outbox SET attempts=?,last_error=?,next_retry_at=datetime('now',?),
    quarantined_at=CASE WHEN ?>=8 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE event_key=?`)
    .run(attempts,String(err.message).slice(0,500),`+${Math.min(3600,15*2**Math.min(attempts-1,8))} seconds`,attempts,key);
}

function deliverOutbox(row) {
  const payload=JSON.parse(row.payload_json),recipients=JSON.parse(row.recipients_json);
  const result=createForUsers({...payload,dedupeKey:row.event_key},recipients);
  db.prepare('UPDATE notification_outbox SET delivered_at=CURRENT_TIMESTAMP,last_error=NULL,next_retry_at=NULL,quarantined_at=NULL WHERE event_key=?').run(row.event_key);
  return result;
}

function retryOutbox() {
  const rows=db.prepare(`SELECT * FROM notification_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL
    AND (next_retry_at IS NULL OR next_retry_at<=CURRENT_TIMESTAMP) ORDER BY COALESCE(next_retry_at,created_at),event_key LIMIT 100`).all();
  for(const row of rows) {
    try {deliverOutbox(row);} catch(err) {failOutbox(row.event_key,err);console.error('通知事件重试失败:',row.event_key,String(err.message));}
  }
}

function outbox(user) {
  if(user.role!=='admin') throw new NotificationError('仅管理员可以管理投递队列',403);
  const stats=db.prepare(`SELECT COUNT(*) AS pending,SUM(quarantined_at IS NOT NULL) AS quarantined,MIN(created_at) AS oldest_at FROM notification_outbox WHERE delivered_at IS NULL`).get();
  const items=db.prepare('SELECT event_key,attempts,last_error,created_at,next_retry_at,quarantined_at FROM notification_outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT 100').all();
  return {stats,items};
}

function replayOutbox(user,key) {
  if(user.role!=='admin') throw new NotificationError('仅管理员可以重放通知',403);
  if(typeof key!=='string' || !key.trim() || key.length>300) throw new NotificationError('请提供有效的事件标识',400);
  const row=db.prepare('SELECT * FROM notification_outbox WHERE event_key=?').get(key);
  if(!row) throw new NotificationError('事件不存在',404);
  if(row.delivered_at) return {message:'事件已经投递，无需重放'};
  db.prepare('UPDATE notification_outbox SET quarantined_at=NULL,next_retry_at=NULL,attempts=0 WHERE event_key=?').run(key);
  try {deliverOutbox(row);return {message:'事件已重放'};} catch(err) {failOutbox(key,err);throw new NotificationError('事件仍无法投递，已保留错误与重试记录',409);}
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
  retryOutbox,
  outbox,
  replayOutbox,
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
