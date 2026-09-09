const express = require('express');
const router = express.Router();
const controller = require('../controllers/gliderController');
const { requireAuth, requirePasswordChanged, requireRole, optionalAuth } = require('../middleware/auth');

// 结果文件：同时支持两种访问方式 ——
//  1) 带 Bearer 的常规下载（axios blob 拉取 3D 航迹/遥测 PNG、CSV、summary），
//     optionalAuth 校验后由控制器按 req.user 判权；
//  2) 无 Bearer 的短期签名 URL（视频/图片直挂 <video>/<img> 无法携带 Authorization），
//     控制器内以签名校验兜底。
// 因此本路由不能直接挂在 router.use(requireAuth) 之后，改用 optionalAuth 兼容两种场景。
router.get('/simulations/:id/files/:name', optionalAuth, controller.file);

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
