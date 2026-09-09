const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadResource, uploadReplay } = require('../middleware/upload');

// 回放流式播放：支持签名 URL 访问（<video> 直挂无法携带 Bearer），鉴权在控制器内完成。
// 必须声明在 router.use(requireAuth) 之前。
router.get('/replays/:replayId/stream', controller.streamReplay);

router.use(requireAuth);
router.use(requirePasswordChanged);

// 课程 CRUD
router.get('/', controller.list);
router.post('/', requireRole('admin', 'academic_mentor'), controller.create);
router.get('/resources/:resource_id/download', controller.downloadResource);
router.delete('/resources/:resource_id', requireRole('admin', 'academic_mentor'), controller.deleteResource);
router.get('/replays/:replayId/stream-url', controller.streamUrl);
router.put('/replays/:replayId', requireRole('admin', 'academic_mentor'), controller.updateReplay);
router.delete('/replays/:replayId', requireRole('admin', 'academic_mentor'), controller.deleteReplay);
router.get('/:id', controller.detail);
router.post('/:id/progress', requireRole('student'), controller.updateProgress);
router.put('/:id', requireRole('admin', 'academic_mentor'), controller.update);
router.delete('/:id', requireRole('admin', 'academic_mentor'), controller.delete);

// 课时
router.post('/:id/lessons', requireRole('admin', 'academic_mentor'), controller.addLesson);
router.put('/lessons/:lessonId', requireRole('admin', 'academic_mentor'), controller.updateLesson);
router.post('/lessons/:lessonId/cancel', requireRole('admin', 'academic_mentor'), controller.cancelLesson);

// 资源
router.post('/:id/resources', requireRole('admin', 'academic_mentor'), uploadResource.single('file'), controller.uploadResource);

// 课程回放
router.get('/:id/replays', controller.listReplays);
router.post('/:id/replays', requireRole('admin', 'academic_mentor'), uploadReplay.single('file'), controller.uploadReplay);

// 任务
router.post('/lessons/:lesson_id/tasks', requireRole('admin', 'academic_mentor'), controller.addTask);

// 选课导入：仅执行导师和管理员
router.post('/:id/enroll', requireRole('admin', 'academic_mentor'), controller.enroll);
// 导入候选学生查询（同上权限）
router.get('/:id/enroll/candidates', controller.enrollCandidates);
// 管理员异常修正：移除报名（软删除 + 审计，日常不可退课）
router.delete('/:courseId/enrollments/:enrollmentId', requireRole('admin'), controller.removeEnrollment);

module.exports = router;
