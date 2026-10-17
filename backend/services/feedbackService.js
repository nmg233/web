const routing=require('./feedbackRouting');
const db = require('../config/database');
const {
  FEEDBACK_TYPES,
  FEEDBACK_MODULES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  STATUS_TRANSITIONS,
  FEEDBACK_LABELS,
} = require('../constants/feedback');
const notificationService = require('./notificationService');
const { decodeOriginalName } = require('../helpers/fileName');
const requests = require('../helpers/requestResults');

const { NOTIFICATION_EVENTS } = notificationService;

class FeedbackError extends Error {
  constructor(message, status = 400, code = 'FEEDBACK_INVALID') {
    super(message);
    this.name = 'FeedbackError';
    this.status = status;
    this.code = code;
  }
}

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function requireAdmin(user) {
  if (!user || user.role !== 'admin') {
    throw new FeedbackError('仅管理员可以执行该操作', 403, 'FEEDBACK_ADMIN_REQUIRED');
  }
}

function getFeedbackRow(id) {
  const feedback = db.prepare(`
    SELECT f.*, u.real_name AS user_name, u.role AS user_role,
           u.email AS user_email, u.phone AS user_phone
    FROM feedbacks f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.id = ?
  `).get(id);
  if (!feedback) {
    throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND');
  }
  return routing.refresh(feedback);
}

function canAccess(user, feedback) {
  return routing.canRead(user,feedback);
}

function assertAccess(user, feedback) {
  if (!canAccess(user, feedback)) {
    throw new FeedbackError('无权查看该反馈', 403, 'FEEDBACK_FORBIDDEN');
  }
}

function addSystemMessage(feedbackId, senderId, content) {
  const result = db.prepare(`
    INSERT INTO feedback_messages (feedback_id, sender_id, message_type, content, is_internal)
    VALUES (?, ?, 'system', ?, 0)
  `).run(feedbackId, senderId || null, content);
  return Number(result.lastInsertRowid);
}

function notifyFeedbackOwner(feedback, payload) {
  return routing.notify(feedback,{
    category: 'feedback',
    businessType: 'feedback',
    businessId: feedback.id,
    actionUrl: `/feedback/${feedback.id}`,
    ...payload,
  }, 'owner');
}

function notifyFeedbackAdmins(feedback, payload) {
  return routing.notify(feedback,{
    category: 'feedback',
    businessType: 'feedback',
    businessId: feedback.id,
    actionUrl: `/feedback/${feedback.id}`,
    ...payload,
  }, 'staff');
}

function formatFeedbackNo(id) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `FB-${date}-${String(id).padStart(6, '0')}`;
}

function normalizePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function create(user, data, files = []) {
  if(['mentorId','schoolId','assignee_id','reception_level'].some(k=>Object.hasOwn(data,k)))throw new FeedbackError('受理人由服务器核验，不接受客户端指定');
  const context=routing.context(user,data);
  const identity = requests.identity(user, 'feedback', data, files);
  const prior = requests.existing(db, identity);
  if (prior) {
    require('../middleware/feedbackUpload').removeFiles(files);
    return getFeedbackRow(prior.id);
  }
  const type = cleanText(data.type, 30);
  const moduleName = cleanText(data.module, 30) || null;
  const title = cleanText(data.title, 100);
  const description = cleanText(data.description, 5000);

  if (!FEEDBACK_TYPES.includes(type)) {
    throw new FeedbackError('请选择有效的反馈类型');
  }
  if (moduleName && !FEEDBACK_MODULES.includes(moduleName)) {
    throw new FeedbackError('请选择有效的关联模块');
  }
  if (title.length < 5) {
    throw new FeedbackError('反馈标题至少需要5个字');
  }
  if (description.length < 10) {
    throw new FeedbackError('反馈描述至少需要10个字');
  }

  const feedback = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO feedbacks (
        user_id, type, module, title, description, contact,
        allow_contact, source_path, client_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      type,
      moduleName,
      title,
      description,
      cleanText(data.contact, 200) || null,
      data.allow_contact === false || data.allow_contact === 'false' || data.allow_contact === '0' ? 0 : 1,
      cleanText(data.source_path, 500) || null,
      cleanText(data.client_info, 500) || null,
    );

    const feedbackId = Number(result.lastInsertRowid);
    const feedbackNo = formatFeedbackNo(feedbackId);
    db.prepare('UPDATE feedbacks SET feedback_no=?,course_id=?,school_id=?,reception_level=? WHERE id=?').run(feedbackNo,context.course_id,context.school_id,context.reception_level,feedbackId);

    const insertAttachment = db.prepare(`
      INSERT INTO feedback_attachments (
        feedback_id, original_name, stored_name, file_path, mime_type, file_size
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    files.forEach((file) => {
      insertAttachment.run(
        feedbackId,
        decodeOriginalName(file.originalname),
        file.filename,
        file.path,
        file.mimetype,
        file.size,
      );
    });

    addSystemMessage(feedbackId, user.id, '反馈已提交');
    requests.save(db, identity, { id: feedbackId });
    const record = getFeedbackRow(feedbackId);
  notifyFeedbackAdmins(record, {
    eventKey: NOTIFICATION_EVENTS.FEEDBACK_SUBMITTED,
    dedupeKey: `record.submitted:${record.id}`,
    title: '收到新的用户反馈',
    summary: `${record.feedback_no} · ${record.title}`,
    content: `用户“${record.user_name || '未知用户'}”提交了反馈：${record.title}`,
    level: 'important',
    createdBy: user.id,
  });
    return record;
  })();

  return feedback;
}

function listMine(user, query = {}) {
  const { page, pageSize, offset } = normalizePagination(query);
  const where = ['f.user_id = ?'];
  const params = [user.id];

  if (FEEDBACK_STATUSES.includes(query.status)) {
    where.push('f.status = ?');
    params.push(query.status);
  }
  if (FEEDBACK_TYPES.includes(query.type)) {
    where.push('f.type = ?');
    params.push(query.type);
  }

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM feedbacks f WHERE ${whereSql}`).get(...params).count;
  const items = db.prepare(`
    SELECT f.*,
      (SELECT content FROM feedback_messages m
       WHERE m.feedback_id = f.id AND m.is_internal = 0
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS latest_message
    FROM feedbacks f
    WHERE ${whereSql}
    ORDER BY f.updated_at DESC, f.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, pagination: { page, pageSize, total } };
}

function listManage(user, query = {}) {
  if(!['admin','academic_mentor'].includes(user.role))throw new FeedbackError('无权处理反馈',403);
  routing.refreshPending();
  const { page, pageSize, offset } = normalizePagination(query);
  const where = [routing.readSql(user)];
  if(user.role==='academic_mentor')where.push('f.course_id IS NOT NULL AND f.user_id!='+Number(user.id));
  const params = [];

  if (FEEDBACK_STATUSES.includes(query.status)) {
    where.push('f.status = ?');
    params.push(query.status);
  }
  if (FEEDBACK_TYPES.includes(query.type)) {
    where.push('f.type = ?');
    params.push(query.type);
  }
  if (FEEDBACK_PRIORITIES.includes(query.priority)) {
    where.push('f.priority = ?');
    params.push(query.priority);
  }
  if (FEEDBACK_MODULES.includes(query.module)) {
    where.push('f.module = ?');
    params.push(query.module);
  }
  const search = cleanText(query.search, 100);
  if (search) {
    where.push('(f.feedback_no LIKE ? OR f.title LIKE ? OR u.real_name LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  const whereSql = where.join(' AND ');
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM feedbacks f LEFT JOIN users u ON u.id = f.user_id
    WHERE ${whereSql}
  `).get(...params).count;
  const items = db.prepare(`
    SELECT f.*, u.real_name AS user_name, u.role AS user_role
    FROM feedbacks f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE ${whereSql}
    ORDER BY
      CASE f.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      f.updated_at DESC, f.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, pagination: { page, pageSize, total } };
}

function detail(user, id) {
  const feedback = getFeedbackRow(id);
  assertAccess(user, feedback);

  const messages = db.prepare(`
    SELECT m.id, m.feedback_id, m.sender_id, m.message_type, m.content,
           m.is_internal, m.created_at, u.real_name AS sender_name, u.role AS sender_role
    FROM feedback_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.feedback_id = ? ${routing.isStaff(user,feedback) ? '' : 'AND m.is_internal = 0'}
    ORDER BY m.created_at, m.id
  `).all(feedback.id);
  const attachments = db.prepare(`
    SELECT id, feedback_id, message_id, original_name, mime_type, file_size, created_at
    FROM feedback_attachments
    WHERE feedback_id = ? ${routing.isStaff(user,feedback)?'':"AND (message_id IS NULL OR EXISTS(SELECT 1 FROM feedback_messages fm WHERE fm.id=message_id AND fm.is_internal=0))"}
    ORDER BY created_at, id
  `).all(feedback.id);

  const staff=routing.isStaff(user,feedback);
  const safe={...feedback,can_handle:staff&&(user.role==='admin'||feedback.reception_level==='mentor'&&feedback.assignee_id===user.id),can_note:staff,can_claim:staff&&user.role==='academic_mentor'&&feedback.reception_level==='mentor'&&!feedback.assignee_id,
    handler_label:feedback.reception_level==='admin'?'平台管理员':feedback.assignee_id?(db.prepare('SELECT real_name FROM users WHERE id=?').get(feedback.assignee_id)?.real_name||'课程导师'):'课程导师共同受理'};
  if(!staff||user.role!=='admin'){delete safe.user_email;delete safe.user_phone;if(!feedback.allow_contact)delete safe.contact;}
  return { feedback:safe, messages, attachments,mentors:staff?routing.mentors(feedback):[],history:staff?db.prepare('SELECT e.*,u.real_name actor_name FROM feedback_reception_events e LEFT JOIN users u ON u.id=e.actor_id WHERE feedback_id=? ORDER BY e.id').all(id):[] };
}

function addPublicMessage(user, id, rawContent) {
  const feedback = getFeedbackRow(id);
  assertAccess(user, feedback);
  if(user.id!==feedback.user_id)routing.assertHandler(user,feedback);
  if (user.role !== 'admin' && ['closed', 'rejected'].includes(feedback.status)) {
    throw new FeedbackError('该反馈已结束，请先申请重新处理');
  }
  const content = cleanText(rawContent, 2000);
  if (!content) throw new FeedbackError('回复内容不能为空');

  const result = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO feedback_messages (feedback_id, sender_id, message_type, content, is_internal)
      VALUES (?, ?, 'reply', ?, 0)
    `).run(feedback.id, user.id, content);
    db.prepare("UPDATE feedbacks SET updated_at=CURRENT_TIMESTAMP,status=CASE WHEN status='waiting_user' AND user_id=? THEN 'processing' ELSE status END WHERE id=?").run(user.id,feedback.id);
    return inserted;
  })();
  const messageId = Number(result.lastInsertRowid);
  const notification = {
    eventKey: routing.isStaff(user,feedback)
      ? NOTIFICATION_EVENTS.FEEDBACK_REPLIED
      : NOTIFICATION_EVENTS.FEEDBACK_USER_REPLIED,
    dedupeKey: `feedback.message:${messageId}`,
    title: routing.isStaff(user,feedback) ? '你的反馈有新回复' : '用户回复了反馈',
    summary: `${feedback.feedback_no} · ${feedback.title}`,
    content,
    level: 'normal',
    createdBy: user.id,
  };
  if (routing.isStaff(user,feedback)) notifyFeedbackOwner(feedback, notification);
  else notifyFeedbackAdmins(feedback, notification);
  return { id: messageId };
}

function addInternalNote(user, id, rawContent) {
  const feedback = getFeedbackRow(id);
  routing.assertHandler(user,feedback,true);
  const content = cleanText(rawContent, 2000);
  if (!content) throw new FeedbackError('内部备注不能为空');

  const result = db.prepare(`
    INSERT INTO feedback_messages (feedback_id, sender_id, message_type, content, is_internal)
    VALUES (?, ?, 'note', ?, 1)
  `).run(feedback.id, user.id, content);
  return { id: Number(result.lastInsertRowid) };
}

function changeStatus(user, id, nextStatus) {
  const feedback = getFeedbackRow(id);
  routing.assertHandler(user,feedback);
  if (!FEEDBACK_STATUSES.includes(nextStatus)) {
    throw new FeedbackError('无效的反馈状态');
  }
  if (nextStatus === 'resolved') {
    throw new FeedbackError('标记为已处理时必须填写处理结果');
  }
  if (feedback.status === nextStatus) return feedback;
  if (!STATUS_TRANSITIONS[feedback.status]?.includes(nextStatus)) {
    throw new FeedbackError(`不能从“${FEEDBACK_LABELS.statuses[feedback.status]}”变更为“${FEEDBACK_LABELS.statuses[nextStatus]}”`);
  }

  const messageId = db.transaction(() => {
    db.prepare(`
      UPDATE feedbacks
      SET status = ?, updated_at = CURRENT_TIMESTAMP,
          resolved_at = CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
          closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ?
    `).run(nextStatus, nextStatus, nextStatus, feedback.id);
    return addSystemMessage(
      feedback.id,
      user.id,
      `状态由“${FEEDBACK_LABELS.statuses[feedback.status]}”变更为“${FEEDBACK_LABELS.statuses[nextStatus]}”`,
    );
  })();
  const updated = getFeedbackRow(feedback.id);
  notifyFeedbackOwner(updated, {
    eventKey: NOTIFICATION_EVENTS.FEEDBACK_STATUS_CHANGED,
    dedupeKey: `feedback.status:${messageId}`,
    title: '反馈状态已更新',
    summary: `${updated.feedback_no} · ${updated.title}`,
    content: `反馈状态已更新为“${FEEDBACK_LABELS.statuses[nextStatus]}”。`,
    level: ['rejected', 'closed'].includes(nextStatus) ? 'important' : 'normal',
    createdBy: user.id,
  });
  return updated;
}

function changePriority(user, id, nextPriority) {
  const feedback = getFeedbackRow(id);
  routing.assertHandler(user,feedback);
  if (!FEEDBACK_PRIORITIES.includes(nextPriority)) {
    throw new FeedbackError('无效的反馈优先级');
  }
  if (feedback.priority === nextPriority) return feedback;

  db.transaction(() => {
    db.prepare('UPDATE feedbacks SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(nextPriority, feedback.id);
    addSystemMessage(
      feedback.id,
      user.id,
      `优先级由“${FEEDBACK_LABELS.priorities[feedback.priority]}”变更为“${FEEDBACK_LABELS.priorities[nextPriority]}”`,
    );
  })();
  return getFeedbackRow(feedback.id);
}

function resolve(user, id, rawResolution) {
  const feedback = getFeedbackRow(id);
  routing.assertHandler(user,feedback);
  const resolution = cleanText(rawResolution, 5000);
  if (!resolution) throw new FeedbackError('请填写处理结果');
  if (feedback.status !== 'resolved' && !STATUS_TRANSITIONS[feedback.status]?.includes('resolved')) {
    throw new FeedbackError('当前状态不能直接标记为已处理');
  }

  const replyId = db.transaction(() => {
    db.prepare(`
      UPDATE feedbacks
      SET resolution = ?, status = 'resolved', resolved_at = CURRENT_TIMESTAMP,
          closed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resolution, feedback.id);
    const reply = db.prepare(`
      INSERT INTO feedback_messages (feedback_id, sender_id, message_type, content, is_internal)
      VALUES (?, ?, 'reply', ?, 0)
    `).run(feedback.id, user.id, `处理结果：${resolution}`);
    if (feedback.status !== 'resolved') {
      addSystemMessage(feedback.id, user.id, '反馈已处理，等待用户确认');
    }
    return Number(reply.lastInsertRowid);
  })();
  const updated = getFeedbackRow(feedback.id);
  notifyFeedbackOwner(updated, {
    eventKey: NOTIFICATION_EVENTS.FEEDBACK_REPLIED,
    dedupeKey: `feedback.resolved:${replyId}`,
    title: '你的反馈已处理',
    summary: `${updated.feedback_no} · ${updated.title}`,
    content: resolution,
    level: 'important',
    createdBy: user.id,
  });
  return updated;
}

function confirmResolved(user, id) {
  const feedback = getFeedbackRow(id);
  if (feedback.user_id !== user.id) {
    throw new FeedbackError('只有反馈提交人可以确认解决', 403, 'FEEDBACK_FORBIDDEN');
  }
  if (feedback.status !== 'resolved') {
    throw new FeedbackError('只有已处理的反馈可以确认解决');
  }

  const messageId = db.transaction(() => {
    db.prepare(`
      UPDATE feedbacks
      SET status = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(feedback.id);
    return addSystemMessage(feedback.id, user.id, '用户已确认问题解决');
  })();
  const updated = getFeedbackRow(feedback.id);
  notifyFeedbackAdmins(updated, {
    eventKey: NOTIFICATION_EVENTS.FEEDBACK_CLOSED,
    dedupeKey: `feedback.closed:${messageId}`,
    title: '用户已确认反馈解决',
    summary: `${updated.feedback_no} · ${updated.title}`,
    content: '用户已确认问题解决，本次反馈已关闭。',
    level: 'normal',
    createdBy: user.id,
  });
  return updated;
}

function reopen(user, id, rawReason) {
  const feedback = getFeedbackRow(id);
  assertAccess(user, feedback);
  if(user.id!==feedback.user_id)routing.assertHandler(user,feedback);
  if (!['resolved', 'closed', 'rejected'].includes(feedback.status)) {
    throw new FeedbackError('当前反馈无需重新打开');
  }
  const reason = cleanText(rawReason, 2000);
  if (!reason) throw new FeedbackError('请说明重新打开的原因');

  const replyId = db.transaction(() => {
    db.prepare(`
      UPDATE feedbacks
      SET status = 'processing', closed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(feedback.id);
    const reply = db.prepare(`
      INSERT INTO feedback_messages (feedback_id, sender_id, message_type, content, is_internal)
      VALUES (?, ?, 'reply', ?, 0)
    `).run(feedback.id, user.id, `请求重新处理：${reason}`);
    addSystemMessage(feedback.id, user.id, '反馈已重新打开');
    return Number(reply.lastInsertRowid);
  })();
  const updated = getFeedbackRow(feedback.id);
  notifyFeedbackAdmins(updated, {
    eventKey: NOTIFICATION_EVENTS.FEEDBACK_REOPENED,
    dedupeKey: `feedback.reopened:${replyId}`,
    title: '用户重新打开了反馈',
    summary: `${updated.feedback_no} · ${updated.title}`,
    content: reason,
    level: 'important',
    createdBy: user.id,
  });
  return updated;
}

function stats(user) {
  requireAdmin(user);
  const statusRows = db.prepare('SELECT status, COUNT(*) AS count FROM feedbacks GROUP BY status').all();
  const result = Object.fromEntries(FEEDBACK_STATUSES.map((status) => [status, 0]));
  statusRows.forEach((row) => { result[row.status] = row.count; });
  result.urgent = db.prepare("SELECT COUNT(*) AS count FROM feedbacks WHERE priority = 'urgent' AND status NOT IN ('closed','rejected')").get().count;
  result.total = db.prepare('SELECT COUNT(*) AS count FROM feedbacks').get().count;
  return result;
}

function attachment(user, id) {
  const row = db.prepare(`
    SELECT a.*, f.user_id, f.course_id, f.reception_level, f.assignee_id, f.revision
    FROM feedback_attachments a
    JOIN feedbacks f ON f.id = a.feedback_id
    WHERE a.id = ?
  `).get(id);
  if (!row) throw new FeedbackError('附件不存在', 404, 'FEEDBACK_ATTACHMENT_NOT_FOUND');
  const feedback=getFeedbackRow(row.feedback_id);assertAccess(user,feedback);
  if(row.message_id&&!routing.isStaff(user,feedback)&&db.prepare('SELECT is_internal FROM feedback_messages WHERE id=?').get(row.message_id)?.is_internal)throw new FeedbackError('附件不可访问',404);
  return row;
}

function options() {
  return {
    types: FEEDBACK_TYPES,
    modules: FEEDBACK_MODULES,
    priorities: FEEDBACK_PRIORITIES,
    statuses: FEEDBACK_STATUSES,
    labels: FEEDBACK_LABELS,
  };
}

const atomic = (operation) => (...args) => db.transaction(() => operation(...args)).immediate();

module.exports = {
  FeedbackError,
  create: atomic(create),
  listMine,
  listManage,
  detail,
  addPublicMessage: routing.guarded(addPublicMessage,'reply'),
  addInternalNote:routing.guarded(addInternalNote,'note'),
  changeStatus:routing.guarded(changeStatus,'status'),
  changePriority:routing.guarded(changePriority,'priority'),
  resolve:routing.guarded(resolve,'resolve'),
  confirmResolved:(user,id,options={})=>routing.guarded(confirmResolved,'confirm')(user,id,null,options),
  reopen:routing.guarded(reopen,'reopen'),
  stats,
  attachment,
  options,
};
