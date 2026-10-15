// Admin-only read model. No student identity, progress recalculation, version binding or writes.
function previewData(db,user,{courseId,lessonId}={}){
 if(user.role!=='admin')throw Object.assign(new Error('仅管理员可预览学生界面'),{status:403});
 const courses=db.prepare("SELECT id,title,theme,description,cover_image,presentation_theme,map_mode,status,grade_level,difficulty FROM courses ORDER BY id").all();
 const course=courseId?courses.find(c=>c.id===Number(courseId)):null;if(courseId&&!course)throw Object.assign(new Error('课程不存在'),{status:404});
 const lessons=course?db.prepare("SELECT l.*,(SELECT real_name FROM users WHERE id=l.instructor_id) instructor_name FROM lessons l WHERE course_id=? ORDER BY sort_order,id").all(course.id):[];
 const lesson=lessonId?lessons.find(l=>l.id===Number(lessonId)):lessons[0];if(lessonId&&!lesson)throw Object.assign(new Error('课时不属于所选课程'),{status:404});
 const resources=course?db.prepare('SELECT id,course_id,lesson_id,title,description,resource_type,file_type,file_size,file_name,display_order,file_path FROM resources WHERE course_id=? ORDER BY display_order,id').all(course.id).map(({file_path,...r})=>({...r,has_file:Boolean(file_path)})):[];
 const replays=course?db.prepare('SELECT id,course_id,lesson_id,title,description,summary,duration_seconds,sort_order FROM course_replays WHERE course_id=? ORDER BY sort_order,id').all(course.id):[];
 const tasks=course?db.prepare("SELECT t.* FROM tasks t JOIN lessons l ON l.id=t.lesson_id WHERE l.course_id=? AND t.status='active' ORDER BY t.sort_order,t.id").all(course.id):[];
 const display=course?require('./coursePresentation').courseDisplay(course.id):{chapters:[],planNodes:[],experiments:[]};
 const cards=lesson?require('./learningService').previewLesson(user,lesson.id).cards:[];
 return{preview:true,serverDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),note:'管理员受控预览：教材来自真实课程；个人数据为空占位，不代表任何学生。所有业务写入禁止；未发布课程实际不可供学生访问',courses,course,lessons,resources,replays,tasks,...display,
  package:lesson?{preview:true,read_only:true,read_only_reason:'管理员预览，不绑定学生版本、不记录学习或提交',course,lesson:{...lesson,article_blocks:require('./articleBlocks').parse(lesson.article_blocks)},cards,resources:resources.filter(r=>!r.lesson_id||r.lesson_id===lesson.id),replays:replays.filter(r=>!r.lesson_id||r.lesson_id===lesson.id),consolidation_tasks:tasks.filter(t=>t.lesson_id===lesson.id),progress:{},report:null,reflection:null}:null};
}
module.exports={previewData};
