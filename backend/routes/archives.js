const express = require('express');
const router = express.Router();
const controller = require('../controllers/archiveController');
const { requireAuth, requirePasswordChanged, requireReflectionSubmittable, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get('/tree', controller.showExport);
router.get('/generate', controller.generate);
router.get('/generate-batch', controller.generateBatch);
router.post('/growth-records', requireRole('admin', 'academic_mentor', 'teacher'), controller.addGrowthRecord);
router.get('/reflection', requireReflectionSubmittable, controller.showReflection);
router.post('/reflection', requireReflectionSubmittable, controller.submitReflection);
router.post('/evaluation', requireRole('admin', 'academic_mentor', 'teacher'), controller.submitEvaluation);

module.exports = router;
