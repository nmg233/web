const db=require('../config/database'),scope=require('./mentorSchoolScope');
const priority=require('../../shared/staffWorkspace.json').categories.map(c=>c.key).filter(k=>!['courses','schools'].includes(k));
function read(user,query={}){
 scope.actor(user);require('./feedbackRouting').refreshPending();
 const admin=user.role==='admin',uid=Number(user.id),cm=column=>admin?'1=1':require('../helpers/courseScope').mentorCourseScope(column).replaceAll('?',String(uid));
 const applications=require('./applicationConversations').collectionSql(user),feedback=require('./feedbackRouting').readSql(user);
 const collections={
  courses:`SELECT c.id,c.title,c.status context,'/courses/'||c.id url,c.updated_at sort_at,'course:'||c.id object_key FROM courses c WHERE ${cm('c.id')}`,
  schools:`SELECT s.id,s.name title,COALESCE(s.region,'地区未填') context,'${admin?'/dashboard/schools/':'/mentor/organization?section=accounts&school='}'||s.id url,s.name sort_at,'school:'||s.id object_key FROM schools s WHERE s.is_active=1 AND ${scope.schoolSql(user)}`,
  reports:`SELECT r.id,l.title,u.real_name context,'/mentor/reviews/'||r.id url,r.id sort_at,'report:'||r.id object_key FROM lesson_learning_reports r JOIN users u ON u.id=r.student_id JOIN lessons l ON l.id=r.lesson_id WHERE r.status='submitted' AND NOT EXISTS(SELECT 1 FROM report_replacements rr WHERE rr.report_id=r.id) AND r.id=(SELECT x.id FROM lesson_learning_reports x WHERE x.student_id=r.student_id AND x.lesson_id=r.lesson_id ORDER BY version DESC,id DESC LIMIT 1) AND ${cm('l.course_id')}`,
  works:`SELECT w.id,w.title,u.real_name context,'/works/'||w.id url,w.id sort_at,'work:'||w.id object_key FROM works w JOIN users u ON u.id=w.student_id JOIN enrollments e ON e.id=w.enrollment_id WHERE w.review_status='pending' AND ${cm('e.course_id')} AND NOT EXISTS(SELECT 1 FROM works n WHERE n.parent_work_id=w.id)`,
  gifts:`SELECT o.id,o.gift_name title,o.student_name context,CASE WHEN o.course_id IS NULL THEN '/reward-management?order='||o.id ELSE '/courses/'||o.course_id||'?tab=rewards&order='||o.id END url,o.id sort_at,'order:'||o.id object_key FROM reward_orders o WHERE o.status='pending' AND ${cm('o.course_id')}`,
  preparing:`SELECT l.id,l.title,c.title context,'/courses/'||c.id||'?tab=maintenance&lesson='||l.id url,l.id sort_at,'lesson:'||l.id object_key FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.content_state='preparing' AND l.status!='cancelled' AND c.status!='archived' AND ${cm('c.id')}`,
  publications:`SELECT p.id,COALESCE(l.title,c.title) title,'${admin?'待管理员审批':'等待管理员审批'} · '||u.real_name context,'/courses/'||p.course_id||'?tab=maintenance'||CASE WHEN p.lesson_id IS NULL THEN '' ELSE '&lesson='||p.lesson_id END url,p.id sort_at,'publication:'||p.id object_key FROM publication_requests p JOIN courses c ON c.id=p.course_id LEFT JOIN lessons l ON l.id=p.lesson_id JOIN users u ON u.id=p.applicant_id WHERE p.status='pending' AND ${cm('p.course_id')}`,
  applications:`SELECT a.kind||':'||a.id id,CASE WHEN a.kind='school' THEN a.object_name ELSE CASE a.kind WHEN 'course' THEN '既有课程管理申请' ELSE '自主开发方案申请' END||' #'||a.id END title,a.applicant_name context,'/mentor/requests?kind='||a.kind||'&application='||a.id url,a.updated_at sort_at,'application:'||a.kind||':'||a.id object_key FROM (${applications}) a WHERE a.status='pending'`,
  applicationReplies:`SELECT a.kind||':'||a.id id,COALESCE(a.object_name,'申请 #'||a.id) title,a.applicant_name context,'/mentor/requests?kind='||a.kind||'&application='||a.id url,a.updated_at sort_at,'application:'||a.kind||':'||a.id object_key FROM (${applications}) a WHERE a.needs_reply='${admin?'admin':'applicant'}'`,
  feedback:`SELECT f.id,f.title,f.feedback_no context,'/feedback/'||f.id url,f.updated_at sort_at,'feedback:'||f.id object_key FROM feedbacks f WHERE ${feedback} AND f.status NOT IN('closed','rejected','resolved','waiting_user') AND f.reception_level='${admin?'admin':'mentor'}' ${admin?'':`AND (f.assignee_id IS NULL OR f.assignee_id=${uid})`}`,
  feedbackReplies:`SELECT f.id,f.title,'需导师补充内部说明' context,'/feedback/'||f.id url,f.updated_at sort_at,'feedback:'||f.id object_key FROM feedbacks f WHERE ${feedback} AND f.status NOT IN('closed','rejected','resolved') AND f.mentor_followup_pending=1 ${admin?'':`AND f.user_id!=${uid}`}`,
 };
 // SQLite counts and pages the selected queue; never load every work/report to slice in JS.
 return db.transaction(()=>{
  const counts=db.prepare('SELECT '+Object.entries(collections).map(([key,sql])=>'(SELECT COUNT(*) FROM ('+sql+')) AS '+key).join(',')).get();
  const actionable=priority.filter(key=>admin||!['publications','applications'].includes(key));
  const category=Object.hasOwn(collections,query.category)?query.category:actionable.find(key=>counts[key]>0)||'reports';
  const page=Math.min(1000000,Math.max(1,parseInt(query.page,10)||1)),pageSize=Math.min(50,Math.max(1,parseInt(query.pageSize,10)||5));
  const union=actionable.map(key=>'SELECT object_key FROM ('+collections[key]+')').join(' UNION ');
  const pendingCount=db.prepare('SELECT COUNT(*) n FROM ('+union+')').get().n;
  return{counts,category,items:db.prepare('SELECT * FROM ('+collections[category]+') ORDER BY sort_at DESC,id DESC LIMIT ? OFFSET ?').all(pageSize,(page-1)*pageSize),total:counts[category],page,pageSize,pendingCount,
   folders:db.prepare(collections.courses+" AND c.status!='archived' ORDER BY c.updated_at DESC,c.id DESC LIMIT 4").all(),updatedAt:new Date().toISOString()};
 })();
}
module.exports={read};
