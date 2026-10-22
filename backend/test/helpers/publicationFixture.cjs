// Prepare historical fixtures for live draft editing via the same production guard.
// No closure, automatic approval, runtime bypass or mutation of student bindings.
function edit(actor,courseId,lessonId){
 const db=require('../../config/database');
 require('../../services/publicationService').read(actor,courseId);
 if(!db.prepare('SELECT id FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId))throw Error('Fixture lesson does not belong to course');
 return require('../../helpers/lessonPublication').assertEditable(db,lessonId);
}
function publish(actor,courseId,lessonId){
 const service=require('../../services/publicationService');
 const request=service.submit(actor,courseId,{lesson_id:lessonId,reason:'隔离回归：提交已保存版本'});
 return service.decide(actor,courseId,request.id,{decision:'approved',reason:'隔离回归：核对后开放'});
}
module.exports={edit,publish};
