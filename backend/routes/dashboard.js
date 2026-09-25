const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController');
const aiController = require('../controllers/aiController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePasswordChanged);

// 仪表盘
router.get('/', controller.index);

// 学校管理
router.get('/schools', requireRole('admin'), controller.showAddSchool);
router.post('/schools', requireRole('admin'), controller.addSchool);
router.get('/schools/:id', requireRole('admin'), controller.showSchool);
router.post('/schools/:id/delete', requireRole('admin'), controller.deleteSchool);
router.post('/schools/:id/classes', requireRole('admin'), controller.addClass);
router.post('/schools/:id/classes/:classId/delete', requireRole('admin'), controller.deleteClass);

// AI 助教
router.get('/ai/courses', requireRole('admin', 'academic_mentor', 'student'), aiController.getCourses);
router.post('/ai/ask', requireRole('admin', 'academic_mentor', 'student'), aiController.ask);
router.get('/ai/settings', requireRole('admin'), aiController.getSettings);
router.put('/ai/settings', requireRole('admin'), aiController.saveSettings);
router.get('/ai/courses/:courseId/documents', requireRole('admin', 'academic_mentor'), aiController.getDocuments);
router.post('/ai/resources/:resourceId/index', requireRole('admin', 'academic_mentor'), aiController.indexResource);
router.patch('/ai/documents/:documentId', requireRole('admin', 'academic_mentor'), aiController.setDocumentEnabled);

module.exports = router;
