const express = require('express');
const router = express.Router();
const controller = require('../controllers/workController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadWork } = require('../middleware/upload');

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get('/', controller.list);
router.get('/upload-options', controller.showUpload);
router.get('/pending-tasks', controller.pendingTasks);
router.post('/', uploadWork.single('file'), controller.upload);
router.get('/:id/download', controller.download);
router.get('/:id', controller.detail);
router.delete('/:id', controller.delete);
router.post('/:id/reject', requireRole('admin'), controller.reject);
router.post('/:id/review', requireRole('admin', 'academic_mentor'), controller.review);

module.exports = router;
