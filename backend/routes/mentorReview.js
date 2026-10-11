const express = require('express');
const controller = require('../controllers/mentorReviewController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requireRole('admin', 'academic_mentor'));

router.get('/', controller.list);
router.get('/:reportId', controller.detail);
router.post('/:reportId/review', controller.review);
router.post('/:reportId/exercises/:exerciseId/feedback', controller.feedback);

module.exports = router;
