const express = require('express');
const router = express.Router();
const controller = require('../controllers/gliderController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

// 结果文件：支持签名 URL 访问（视频直挂 <video> 无法携带 Bearer），
// 鉴权在控制器内完成。必须声明在 router.use(requireAuth) 之前。
router.get('/simulations/:id/files/:name', controller.file);

router.use(requireAuth);
router.use(requirePasswordChanged);

// 学生提交滑翔机参数并启动模拟
router.post('/simulate', requireRole('student'), controller.simulate);

// 引擎能力探测（提交前检查，避免课上才发现环境未就绪）
router.get('/capabilities', controller.capabilities);

// 我的模拟记录 / 详情 / 签名播放地址
router.get('/simulations', controller.list);
router.get('/simulations/:id', controller.detail);
router.get('/simulations/:id/stream-url', controller.streamUrl);

module.exports = router;
