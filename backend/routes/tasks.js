const express = require('express');
const router = express.Router();
const controller = require('../controllers/taskController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

router.use(requireAuth);
// AUTH-04：强制改密守卫覆盖任务模块
router.use(requirePasswordChanged);
router.use(requireRole('student', 'admin', 'executive_mentor', 'academic_mentor', 'teacher'));
router.get('/', controller.list);
router.get('/:id', controller.detail);

module.exports = router;
