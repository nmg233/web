const express = require('express');
const router = express.Router();
const controller = require('../controllers/studentController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { uploadImport } = require('../middleware/upload');

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get('/classes/:schoolId', requireRole('admin', 'academic_mentor', 'teacher'), controller.getClasses);

// 用户列表
router.get('/', requireRole('admin', 'academic_mentor', 'teacher'), controller.list);

// 学生 CRUD
router.post('/', requireRole('admin'), controller.create);
// 分配选项（管理员）——必须声明在 /:id 之前，否则会被当作 id
router.get('/options', requireRole('admin'), controller.getAssignOptions);
router.get('/import-batches', requireRole('admin'), controller.importBatches);
router.get('/import-batches/:batchId', requireRole('admin'), controller.importBatch);
router.get('/import-batches/:batchId/credentials', requireRole('admin'), controller.importCredentials);
router.post('/import-batches/:batchId/resume', requireRole('admin'), controller.resumeImport);
router.post('/import-batches/:batchId/acknowledge', requireRole('admin'), controller.acknowledgeImport);
router.get('/:id', controller.detail);
router.put('/:id', requireRole('admin'), controller.updateStudent);
router.delete('/:id', requireRole('admin'), controller.deleteStudent);
// 管理员：分配学校/班级/负责教师/负责导师
router.put('/:id/assign', requireRole('admin'), controller.assignStudent);
router.post('/:id/status', requireRole('admin'), controller.changeStatus);

// 批量导入（文件或 JSON）
router.post('/import', requireRole('admin'), uploadImport.single('file'), controller.import);

// 学校和班级管理（管理员）
router.post('/schools', requireRole('admin'), controller.createSchool);
router.delete('/schools/:id', requireRole('admin'), controller.deleteSchool);
router.put('/schools/:id/status', requireRole('admin'), controller.schoolStatus);
router.post('/classes', requireRole('admin'), controller.createClass);
router.delete('/classes/:id', requireRole('admin'), controller.deleteClass);
router.post('/classes/:id/transfer', requireRole('admin'), controller.transferClass);
router.get('/classes/:id/transfers', requireRole('admin'), controller.classTransfers);

// 用户管理（管理员）
router.post('/users', requireRole('admin'), controller.createUser);
router.put('/users/:id', requireRole('admin'), controller.updateUser);
router.delete('/users/:id', requireRole('admin'), controller.deleteUser);
router.post('/users/batch-delete', requireRole('admin'), controller.batchDeleteUsers);

module.exports = router;
