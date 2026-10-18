// Only newly created automatic courses participate. Never rewrite legacy ten-node maps.
function sync(db,courseId){
 if(!db.prepare('SELECT automatic_map FROM courses WHERE id=?').get(courseId)?.automatic_map)return;
 const lessons=db.prepare("SELECT id FROM lessons WHERE course_id=? AND status!='cancelled' ORDER BY sort_order,id").all(courseId);
 if(lessons.length>100)throw Object.assign(new Error('自动地图最多100个有效课时，请先取消不再使用的课时'),{status:409});
 const current=db.prepare('SELECT lesson_id,position FROM course_plan_nodes WHERE course_id=? ORDER BY position').all(courseId);
 if(current.length===lessons.length&&current.every((n,i)=>n.lesson_id===lessons[i].id&&n.position===i+1))return;
 db.prepare('DELETE FROM course_plan_nodes WHERE course_id=?').run(courseId);
 const insert=db.prepare("INSERT INTO course_plan_nodes(course_id,position,lesson_id,state) VALUES(?,?,?,'linked')");
 lessons.forEach((l,i)=>insert.run(courseId,i+1,l.id));
}
module.exports={sync};
