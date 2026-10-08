const fs = require('fs');
const path = require('path');
const feedbackService = require('../services/feedbackService');
const { FEEDBACK_UPLOAD_ROOT, removeFiles } = require('../middleware/feedbackUpload');

function sendError(res, err) {
  if (err instanceof feedbackService.FeedbackError || err.status) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
  }
  console.error('反馈模块错误:', err);
  return res.status(500).json({ success: false, error: '反馈服务暂时不可用', code: 'FEEDBACK_INTERNAL_ERROR' });
}

exports.options = (_req, res) => {
  res.json({ success: true, data: feedbackService.options() });
};

exports.create = (req, res) => {
  try {
    const feedback = feedbackService.create(req.user, req.body, req.files || []);
    return res.status(201).json({ success: true, data: { feedback } });
  } catch (err) {
    removeFiles(req.files);
    return sendError(res, err);
  }
};

exports.mine = (req, res) => {
  try {
    return res.json({ success: true, data: feedbackService.listMine(req.user, req.query) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.manageList = (req, res) => {
  try {
    return res.json({ success: true, data: feedbackService.listManage(req.user, req.query) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.stats = (req, res) => {
  try {
    return res.json({ success: true, data: { stats: feedbackService.stats(req.user) } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.detail = (req, res) => {
  try {
    return res.json({ success: true, data: feedbackService.detail(req.user, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.addMessage = (req, res) => {
  try {
    const message = feedbackService.addPublicMessage(req.user, req.params.id, req.body.content);
    return res.status(201).json({ success: true, data: { message } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.addInternalNote = (req, res) => {
  try {
    const message = feedbackService.addInternalNote(req.user, req.params.id, req.body.content);
    return res.status(201).json({ success: true, data: { message } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.changeStatus = (req, res) => {
  try {
    const feedback = feedbackService.changeStatus(req.user, req.params.id, req.body.status);
    return res.json({ success: true, data: { feedback } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.changePriority = (req, res) => {
  try {
    const feedback = feedbackService.changePriority(req.user, req.params.id, req.body.priority);
    return res.json({ success: true, data: { feedback } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.resolve = (req, res) => {
  try {
    const feedback = feedbackService.resolve(req.user, req.params.id, req.body.resolution);
    return res.json({ success: true, data: { feedback } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.confirm = (req, res) => {
  try {
    const feedback = feedbackService.confirmResolved(req.user, req.params.id);
    return res.json({ success: true, data: { feedback } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.reopen = (req, res) => {
  try {
    const feedback = feedbackService.reopen(req.user, req.params.id, req.body.reason);
    return res.json({ success: true, data: { feedback } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.downloadAttachment = (req, res) => {
  try {
    const attachment = feedbackService.attachment(req.user, req.params.id);
    const resolvedPath = path.resolve(attachment.file_path);
    const relative = path.relative(FEEDBACK_UPLOAD_ROOT, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolvedPath)) {
      throw new feedbackService.FeedbackError('附件文件不存在', 404, 'FEEDBACK_ATTACHMENT_NOT_FOUND');
    }
    return res.download(resolvedPath, attachment.original_name);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.uploadError = (err, req, res, _next) => {
  removeFiles(req.files);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: '单个附件不能超过10MB', code: 'FEEDBACK_FILE_TOO_LARGE' });
  }
  if (err?.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ success: false, error: '最多只能上传3个附件', code: 'FEEDBACK_TOO_MANY_FILES' });
  }
  return res.status(400).json({ success: false, error: err.message || '附件上传失败', code: 'FEEDBACK_UPLOAD_FAILED' });
};
