const learningService = require('../services/learningService');

function sendError(res, err) {
  if (err instanceof learningService.LearningError) {
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
