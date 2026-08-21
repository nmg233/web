const express = require('express');
const controller = require('../controllers/feedbackController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadFeedbackAttachments } = require('../middleware/feedbackUpload');

const router = express.Router();

router.use(requireAuth);
// AUTH-04：强制改密守卫覆盖反馈模块
router.use(requirePasswordChanged);

router.get('/options', controller.options);
router.get('/mine', controller.mine);
router.get('/manage/list', requireRole('admin'), controller.manageList);
router.get('/manage/stats', requireRole('admin'), controller.stats);
router.get('/attachments/:id', controller.downloadAttachment);

router.post('/', uploadFeedbackAttachments.array('attachments', 3), controller.create);
router.post('/:id/messages', controller.addMessage);
router.post('/:id/internal-notes', requireRole('admin'), controller.addInternalNote);
router.patch('/:id/status', requireRole('admin'), controller.changeStatus);
router.patch('/:id/priority', requireRole('admin'), controller.changePriority);
router.post('/:id/resolve', requireRole('admin'), controller.resolve);
router.post('/:id/confirm', controller.confirm);
router.post('/:id/reopen', controller.reopen);
router.get('/:id', controller.detail);

router.use(controller.uploadError);

module.exports = router;
