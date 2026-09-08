const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadResource, uploadReplay } = require('../middleware/upload');

router.use(requireAuth);
router.use(requirePasswordChanged);

// 课程 CRUD
router.get('/', controller.list);
router.post('/', requireRole('admin', 'academic_mentor'), controller.create);
router.get('/resources/:resource_id/download', controller.downloadResource);
router.get('/replays/:replayId/stream', controller.streamReplay);
router.put('/replays/:replayId', requireRole('admin', 'academic_mentor'), controller.updateReplay);
router.delete('/replays/:replayId', requireRole('admin', 'academic_mentor'), controller.deleteReplay);
router.get('/:id', controller.detail);
router.post('/:id/progress', requireRole('student'), controller.updateProgress);
router.put('/:id', requireRole('admin', 'academic_mentor'), controller.update);
router.delete('/:id', requireRole('admin', 'academic_mentor'), controller.delete);

// 课时
router.post('/:id/lessons', requireRole('admin', 'academic_mentor'), controller.addLesson);

// 资源
router.post('/:id/resources', requireRole('admin', 'academic_mentor'), uploadResource.single('file'), controller.uploadResource);

// 课程回放
router.get('/:id/replays', controller.listReplays);
router.post('/:id/replays', requireRole('admin', 'academic_mentor'), uploadReplay.single('file'), controller.uploadReplay);

// 任务
router.post('/lessons/:lesson_id/tasks', requireRole('admin', 'academic_mentor'), controller.addTask);

// 导师为学生报名
router.post('/:id/enroll', requireRole('admin', 'academic_mentor'), controller.enroll);

module.exports = router;
