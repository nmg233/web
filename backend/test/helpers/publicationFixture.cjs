// Explicit workflow helpers for regression tests that author historical lessons.
// No runtime bypass, global monkeypatch, or automatic reopen on failed validation.
function close(actor,courseId,lessonId){return require('../../services/publicationService').close(actor,courseId,lessonId,{reason:'隔离回归：关闭后改稿'});}
function publish(actor,courseId,lessonId){
 const service=require('../../services/publicationService');
 const request=service.submit(actor,courseId,{lesson_id:lessonId,reason:'隔离回归：提交已保存版本'});
 return service.decide(actor,courseId,request.id,{decision:'approved',reason:'隔离回归：核对后开放'});
}
module.exports={close,publish};
