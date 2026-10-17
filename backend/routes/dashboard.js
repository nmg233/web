const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController');
const aiController = require('../controllers/aiController');
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePasswordChanged);

// 仪表盘
router.get('/', controller.index);
router.get('/admin-pending',requireRole('admin'),(req,res,next)=>{try{
 const db=require('../config/database');
 const reports=db.prepare("SELECT r.id,l.title,u.real_name FROM lesson_learning_reports r JOIN lessons l ON l.id=r.lesson_id JOIN users u ON u.id=r.student_id WHERE r.status='submitted' AND r.id=(SELECT x.id FROM lesson_learning_reports x WHERE x.student_id=r.student_id AND x.lesson_id=r.lesson_id ORDER BY version DESC,id DESC LIMIT 1) ORDER BY r.id LIMIT 10").all().map(r=>({title:r.title,context:r.real_name,url:'/mentor/reviews/'+r.id}));
 const gifts=db.prepare("SELECT id,gift_name,student_name FROM reward_orders WHERE status='pending' ORDER BY created_at,id LIMIT 10").all().map(r=>({title:r.gift_name,context:r.student_name,url:'/reward-management?order='+encodeURIComponent(r.id)}));
 const feedback=db.prepare("SELECT id,title,status FROM feedbacks WHERE status IN ('pending','processing') ORDER BY id LIMIT 10").all().map(r=>({title:r.title,context:r.status,url:'/feedback/'+r.id}));
 const preparing=db.prepare("SELECT l.id,l.course_id,l.title,c.title course_title FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.content_state='preparing' AND l.status!='cancelled' AND c.status!='archived' ORDER BY c.id,l.sort_order,l.id LIMIT 10").all().map(r=>({title:r.title,context:r.course_title,url:`/courses/${r.course_id}?tab=maintenance&lesson=${r.id}`}));
 res.json({reports,gifts,feedback,preparing});
}catch(e){next(e);}});

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
