const express = require('express');
const controller = require('../controllers/learningController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get('/manage/lessons', requireRole('admin', 'academic_mentor'), controller.manageLessons);
router.get('/manage/lessons/:lessonId/cards', requireRole('admin', 'academic_mentor'), controller.manageCards);
router.post('/manage/lessons/:lessonId/cards', requireRole('admin'), controller.createCard);
router.post('/manage/lessons/:lessonId/cards/reorder', requireRole('admin'), controller.reorderCards);
router.put('/manage/cards/:cardId', requireRole('admin'), controller.updateCard);
router.delete('/manage/cards/:cardId', requireRole('admin'), controller.deleteCard);
router.post('/manage/cards/:cardId/exercises', requireRole('admin'), controller.createExercise);
router.put('/manage/exercises/:exerciseId', requireRole('admin'), controller.updateExercise);
router.delete('/manage/exercises/:exerciseId', requireRole('admin'), controller.deleteExercise);

router.get('/lessons/:lessonId/preview', requireRole('admin', 'academic_mentor', 'teacher'), controller.preview);
router.get('/lessons/:lessonId', requireRole('student'), controller.lesson);
router.post('/lessons/:lessonId/review-complete', requireRole('student'), controller.completeReview);
router.post('/exercises/:exerciseId/submit', requireRole('student'), controller.submitExercise);
router.post('/cards/:cardId/complete', requireRole('student'), controller.completeCard);
router.post('/lessons/:lessonId/report', requireRole('student'), controller.submitReport);

module.exports = router;
