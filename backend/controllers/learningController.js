const learningService = require('../services/learningService');

function sendError(res, err) {
  if (err instanceof learningService.LearningError || (Number.isInteger(err.status)&&err.status>=400&&err.status<500)) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error('学习流程错误:', err);
  return res.status(500).json({ error: '学习服务暂时不可用', code: 'LEARNING_INTERNAL_ERROR' });
}

function action(handler, successStatus = 200) {
  return (req, res) => {
    try {
      return res.status(successStatus).json(handler(req));
    } catch (err) {
      return sendError(res, err);
    }
  };
}

exports.lesson = action((req) => learningService.lessonPackage(req.user.id, req.params.lessonId));
exports.availability = action(req=>{
 const db=require('../config/database');
 const row=db.prepare(`SELECT l.id,l.publication_state,l.closure_reason FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE l.id=? AND e.student_id=? AND e.status='active' AND c.status='published' AND l.status!='cancelled'`).get(req.params.lessonId,req.user.id);
 if(!row)throw Object.assign(new Error('课程或报名已不可访问'),{status:404});
 return {id:row.id,open:['legacy','published'].includes(row.publication_state),state:row.publication_state,reason:row.closure_reason||null};
});
exports.preview = action((req) => learningService.previewLesson(req.user, req.params.lessonId));
exports.completeReview = action((req) => ({ progress: learningService.completeReview(req.user.id, req.params.lessonId) }));
exports.submitExercise = action((req) => learningService.submitExercise(req.user.id, req.params.exerciseId, req.body.answer));
exports.completeCard = action((req) => ({ progress: learningService.completeCard(req.user.id, req.params.cardId) }));
exports.submitReport = action((req) => ({ report: learningService.submitReport(req.user.id, req.params.lessonId, req.body) }), 201);

exports.manageCards = action((req) => ({ cards: learningService.listManagedCards(req.user, req.params.lessonId),
  context:learningService.managedContext(req.user,req.params.lessonId) }));
exports.repairLegacy = action((req) => learningService.repairLegacy(req.user,req.params.lessonId,req.body.student_id,req.body.reason));
exports.manageLessons = action((req) => ({ lessons: learningService.listManagedLessons(req.user) }));
exports.createCard = action((req) => learningService.createCard(req.user, req.params.lessonId, req.body), 201);
exports.updateCard = action((req) => learningService.updateCard(req.user, req.params.cardId, req.body));
exports.deleteCard = action((req) => learningService.deleteCard(req.user, req.params.cardId));
exports.createExercise = action((req) => learningService.createExercise(req.user, req.params.cardId, req.body), 201);
exports.updateExercise = action((req) => learningService.updateExercise(req.user, req.params.exerciseId, req.body));
exports.deleteExercise = action((req) => learningService.deleteExercise(req.user, req.params.exerciseId));
exports.reorderCards = action((req) => learningService.reorderCards(req.user, req.params.lessonId, req.body.card_ids));
