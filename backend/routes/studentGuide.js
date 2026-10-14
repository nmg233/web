const router = require('express').Router();
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const controller = require('../controllers/studentGuideController');

// 使用指南弹窗只服务学生本人；未完成强制改密前不读取、也不写入关闭状态。
router.use(requireAuth, requirePasswordChanged, requireRole('student'), (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/', controller.status);
router.post('/dismiss', controller.dismiss);

module.exports = router;
