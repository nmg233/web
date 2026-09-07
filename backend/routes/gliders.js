const express = require('express');
const router = express.Router();
const controller = require('../controllers/gliderController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePasswordChanged);

// 学生提交滑翔机参数并启动模拟
router.post('/simulate', requireRole('student'), controller.simulate);

// 我的模拟记录 / 详情 / 结果文件（图、CSV、摘要）
router.get('/simulations', controller.list);
router.get('/simulations/:id', controller.detail);
router.get('/simulations/:id/files/:name', controller.file);

module.exports = router;
