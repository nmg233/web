const db = require('../config/database');
const { courseBelongsToMentor } = require('../helpers/courseScope');
const settingsService = require('../services/aiSettingsService');
const documentService = require('../services/aiDocumentService');
const answerService = require('../services/aiAnswerService');

function canUseCourse(user, course) {
  if (!course) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'academic_mentor') return courseBelongsToMentor(user.id, course.id);
  if (user.role !== 'student' || course.status !== 'published') return false;
  return Boolean(db.prepare("SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ? AND status = 'active'")
    .get(course.id, user.id));
}

function canManageKnowledge(user, courseId) {
  return user.role === 'admin' || (user.role === 'academic_mentor' && courseBelongsToMentor(user.id, courseId));
}

function fail(res, err) {
  if (!err.status) console.error('灵境小智错误:', err);
  return res.status(err.status || 500).json({ error: err.status ? err.message : '灵境小智暂时遇到了问题，请稍后再试' });
}

exports.getCourses = (req, res) => {
  try {
    const user = req.user;
    let courses;
    if (user.role === 'student') {
      courses = db.prepare(`SELECT c.id, c.title FROM courses c JOIN enrollments e ON e.course_id = c.id
        WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'published' ORDER BY c.id DESC`).all(user.id);
    } else if (user.role === 'academic_mentor') {
      courses = db.prepare(`SELECT c.id, c.title FROM courses c WHERE c.created_by = ? OR EXISTS
        (SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.instructor_id = ?) ORDER BY c.id DESC`).all(user.id, user.id);
    } else {
      courses = db.prepare('SELECT id, title FROM courses ORDER BY id DESC').all();
    }
    res.json({ title: '灵境小智', enabled: Boolean(settingsService.readSettings().enabled), courses });
  } catch (err) { fail(res, err); }
};

exports.ask = async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const courseId = Number(req.body?.course_id);
    if (!question || question.length > 1000) return res.status(400).json({ error: '问题长度须为 1—1000 字' });
    if (!Number.isSafeInteger(courseId) || courseId <= 0) return res.status(400).json({ error: '请先选择一门课程' });
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!canUseCourse(req.user, course)) return res.status(403).json({ error: '无权向该课程提问' });
    const result = await answerService.ask(req.user, course, question);
    res.json(result);
  } catch (err) { fail(res, err); }
};

exports.getSettings = (_req, res) => {
  try { res.json(settingsService.publicSettings()); }
  catch (err) { fail(res, err); }
};

exports.saveSettings = (req, res) => {
  try { res.json(settingsService.saveSettings(req.body || {})); }
  catch (err) { fail(res, err); }
};

exports.getDocuments = (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isSafeInteger(courseId) || !canManageKnowledge(req.user, courseId)) return res.status(403).json({ error: '无权管理该课程资料' });
    res.json({ documents: documentService.listDocuments(courseId) });
  } catch (err) { fail(res, err); }
};

exports.indexResource = (req, res) => {
  try {
    const resource = db.prepare('SELECT id, course_id FROM resources WHERE id = ?').get(req.params.resourceId);
    if (!resource || !canManageKnowledge(req.user, resource.course_id)) return res.status(404).json({ error: '资料不存在' });
    const document = documentService.registerResource(resource.id);
    res.json({ status: document.status, error_message: document.error_message });
  } catch (err) { fail(res, err); }
};

exports.setDocumentEnabled = (req, res) => {
  try {
    const doc = db.prepare('SELECT id, course_id, status FROM ai_documents WHERE id = ?').get(req.params.documentId);
    if (!doc || !canManageKnowledge(req.user, doc.course_id)) return res.status(404).json({ error: '资料不存在' });
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled 必须是布尔值' });
    if (req.body.enabled && doc.status === 'unsupported') return res.status(400).json({ error: documentService.UNSUPPORTED_MESSAGE });
    db.prepare('UPDATE ai_documents SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(req.body.enabled), doc.id);
    res.json({ enabled: req.body.enabled });
  } catch (err) { fail(res, err); }
};
