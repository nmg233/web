const express = require('express');
const controller = require('../controllers/notificationController');
const { requireAuth, requirePasswordChanged } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
// AUTH-04：强制改密守卫覆盖通知模块
router.use(requirePasswordChanged);

router.get('/', controller.list);
router.get('/recent', controller.recent);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);
router.post('/hide-read', controller.hideRead);
router.get('/:id', controller.detail);
router.patch('/:id/read', controller.markRead);
router.patch('/:id/unread', controller.markUnread);
router.patch('/:id/hide', controller.hide);

module.exports = router;
