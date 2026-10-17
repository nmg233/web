function dto(row){return{id:row.id,purpose:row.purpose,url:`/api/courses/${row.course_id}/theme/images/${row.id}`};}
function selected(db,courseId){return Object.fromEntries(db.prepare('SELECT i.* FROM course_theme_bindings b JOIN course_theme_images i ON i.id=b.image_id WHERE b.course_id=?').all(courseId).map(i=>[i.purpose,dto(i)]));}
module.exports={dto,selected};
