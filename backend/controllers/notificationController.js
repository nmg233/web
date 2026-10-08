const notificationService = require('../services/notificationService');

function sendError(res, err) {
  if (err instanceof notificationService.NotificationError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
  }
  console.error('通知模块错误:', err);
  return res.status(500).json({
    success: false,
    error: '通知服务暂时不可用',
    code: 'NOTIFICATION_INTERNAL_ERROR',
  });
}

exports.list = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.listForUser(req.user, req.query) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.outbox=(req,res)=>{try {res.json({data:notificationService.outbox(req.user)});} catch(err){sendError(res,err);}};
exports.replayOutbox=(req,res)=>{try {res.json({data:notificationService.replayOutbox(req.user,req.body.event_key)});} catch(err){sendError(res,err);}};

exports.recent = (req, res) => {
  try {
    const items = notificationService.recent(req.user, req.query.limit);
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.unreadCount = (req, res) => {
  try {
    const count = notificationService.unreadCount(req.user);
    return res.json({ success: true, data: { count } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.detail = (req, res) => {
  try {
    const notification = notificationService.detail(req.user, req.params.id);
    return res.json({ success: true, data: { notification } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.markRead = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.markRead(req.user, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.markUnread = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.markUnread(req.user, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.markAllRead = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.markAllRead(req.user) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.hide = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.hide(req.user, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.hideRead = (req, res) => {
  try {
    return res.json({ success: true, data: notificationService.hideRead(req.user) });
  } catch (err) {
    return sendError(res, err);
  }
};
