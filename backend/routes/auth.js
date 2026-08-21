const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/loginRateLimit');

router.get('/schools', controller.getSchools);
router.get('/classes', controller.getClasses);
// AUTH-07：登录接口增加 IP 限流 / 用户名失败限流 / 账户锁定
router.post('/login', loginRateLimit(controller.login));
router.post('/register', controller.register);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);
// 用户自助修改密码（需登录）
router.post('/change-password', requireAuth, controller.changePassword);
// 管理员重置密码（仅 admin）
router.post('/admin/reset-password', requireAuth, requireRole('admin'), controller.adminResetPassword);

module.exports = router;
