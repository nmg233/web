const db=require('../config/database'),scope=require('./mentorSchoolScope');
function read(user,query={}){
 scope.actor(user);const admin=user.role==='admin',cm=column=>admin?'1=1':require('../helpers/courseScope').mentorCourseScope(column),args=admin?[]:[user.id,user.id];
 const records={
  courses:db.prepare(`SELECT c.id,c.title,c.status FROM courses c WHERE ${cm('c.id')} ORDER BY c.id DESC`).all(...args).map(c=>({title:c.title,context:({draft:'草稿',published:'已发布',archived:'已归档'})[c.status]||c.status,url:'/courses/'+c.id})),
  schools:scope.schools(user).map(s=>({title:s.name,context:s.region||'地区未填',url:'/mentor/organization?school='+s.id+'&section=accounts'})),
  reports:db.prepare(`SELECT r.id,u.real_name,l.title FROM lesson_learning_reports r JOIN users u ON u.id=r.student_id JOIN lessons l ON l.id=r.lesson_id WHERE r.status='submitted' AND r.id=(SELECT x.id FROM lesson_learning_reports x WHERE x.student_id=r.student_id AND x.lesson_id=r.lesson_id ORDER BY version DESC,id DESC LIMIT 1) AND ${cm('l.course_id')} ORDER BY r.id`).all(...args).map(r=>({title:r.title,context:r.real_name,url:'/mentor/reviews/'+r.id})),
  works:db.prepare(`SELECT w.id,w.title,u.real_name FROM works w JOIN users u ON u.id=w.student_id JOIN enrollments e ON e.id=w.enrollment_id WHERE w.review_status='pending' AND ${cm('e.course_id')} AND NOT EXISTS(SELECT 1 FROM works n WHERE n.parent_work_id=w.id) ORDER BY w.id`).all(...args).map(w=>({title:w.title,context:w.real_name,url:'/works/'+w.id})),
  gifts:db.prepare(`SELECT o.id,o.gift_name,o.student_name,o.course_id FROM reward_orders o WHERE o.status='pending' AND ${cm('o.course_id')} ORDER BY o.created_at,o.id`).all(...args).map(o=>({title:o.gift_name,context:o.student_name,url:o.course_id?'/courses/'+o.course_id+'?tab=rewards&order='+o.id:'/reward-management?order='+o.id})),
  preparing:db.prepare(`SELECT l.id,l.title,l.course_id,c.title course_title FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.content_state='preparing' AND l.status!='cancelled' AND c.status!='archived' AND ${cm('c.id')} ORDER BY c.id,l.sort_order,l.id`).all(...args).map(l=>({title:l.title,context:l.course_title,url:`/courses/${l.course_id}?tab=maintenance&lesson=${l.id}`})),
  applications:db.prepare(`SELECT a.id,a.name,a.status FROM school_applications a WHERE ${admin?'1=1':'a.applicant_id=?'} ORDER BY a.id DESC`).all(...(admin?[]:[user.id])).map(a=>({title:a.name,context:({pending:'待审核',approved:'已批准',rejected:'已驳回'})[a.status]||a.status,url:(admin?'/admin/organization?section=applications&application=':'/mentor/organization?application=')+a.id})),
 };
 const page=Math.max(1,parseInt(query.page,10)||1),pageSize=Math.min(100,Math.max(1,parseInt(query.pageSize,10)||10));
 const category=Object.hasOwn(records,query.category)?query.category:'reports';
 return{counts:Object.fromEntries(Object.entries(records).map(([key,rows])=>[key,rows.length])),category,items:records[category].slice((page-1)*pageSize,page*pageSize),total:records[category].length,page,pageSize,updatedAt:new Date().toISOString()};
}
module.exports={read};
