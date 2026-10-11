const service = require('../services/mentorReviewService');

function sendError(res, err) {
  if (err instanceof service.MentorReviewError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error('导师评审错误:', err);
  return res.status(500).json({ error: '导师评审服务暂时不可用' });
}

exports.list = (req, res) => {
  try { return res.json(service.list(req.user, req.query)); } catch (err) { return sendError(res, err); }
};
exports.detail = (req, res) => {
  try { return res.json(service.detail(req.user, req.params.reportId)); } catch (err) { return sendError(res, err); }
};
exports.review = (req, res) => {
  try { return res.json(service.review(req.user, req.params.reportId, req.body)); } catch (err) { return sendError(res, err); }
};
exports.feedback = (req, res) => {
  try { return res.json(service.feedback(req.user, req.params.reportId, req.params.exerciseId, req.body)); } catch (err) { return sendError(res, err); }
};
