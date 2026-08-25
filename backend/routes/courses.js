const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadResource } = require('../middleware/upload');

router.use(requireAuth);
router.use(requirePasswordChanged);

// 学生自主选课
router.post('/enroll', requireRole('student'), controller.studentEnroll);

// 课程 CRUD
router.get('/', controller.list);
router.post('/', requireRole('admin', 'executive_mentor', 'academic_mentor'), controller.create);
router.get('/resources/:resource_id/download', controller.downloadResource);
router.get('/:id', controller.detail);
router.post('/:id/progress', requireRole('student'), controller.updateProgress);
router.put('/:id', requireRole('admin', 'executive_mentor', 'academic_mentor'), controller.update);
router.delete('/:id', requireRole('admin', 'executive_mentor'), controller.delete);

// 课时
router.post('/:id/lessons', requireRole('admin', 'executive_mentor', 'academic_mentor'), controller.addLesson);

// 资源
router.post('/:id/resources', requireRole('admin', 'executive_mentor', 'academic_mentor'), uploadResource.single('file'), controller.uploadResource);

// 任务
router.post('/lessons/:lesson_id/tasks', requireRole('admin', 'executive_mentor', 'academic_mentor'), controller.addTask);

// 导师为学生报名
router.post('/:id/enroll', requireRole('admin', 'executive_mentor', 'academic_mentor'), controller.enroll);

module.exports = router;
