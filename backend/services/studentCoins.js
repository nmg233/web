const db=require('../config/database');
const {randomUUID}=require('node:crypto');
const {taskEligibility}=require('../helpers/rewardEligibility');
const {latestReport}=require('../helpers/learningGate');
const {invalid,fields}=require('./studentRewards');
const VERSION='account-coins-v1';
const dayAt=now=>now.toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
const previousDay=day=>dayAt(new Date(Date.parse(day+'T00:00:00+08:00')-86400000));
function validMonth(month){return typeof month==='string'&&/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month);}
// Clock injection is internal test dependency only; no HTTP or environment override.
function createCoinService(clock=()=>new Date()){
 const total=id=>db.prepare('SELECT COALESCE(SUM(amount),0) balance FROM student_coin_ledger WHERE student_id=?').get(id).balance;
 const today=(id,now)=>{const date=dayAt(now),record=db.prepare('SELECT checkin_date,streak,amount,ledger_id FROM student_coin_checkins WHERE student_id=? AND checkin_date=?').get(id,date);
  const yesterday=db.prepare('SELECT streak FROM student_coin_checkins WHERE student_id=? AND checkin_date=?').get(id,previousDay(date));const next=(yesterday?.streak||0)+1;
  return {date,checked:!!record,streak:record?.streak||yesterday?.streak||0,todayStreak:record?.streak||next,amount:record?.amount||Math.min(4+next,10),record:record||null,validForMs:Date.parse(date+'T00:00:00+08:00')+86400000-now.getTime()};};
 const summary=id=>db.transaction(()=>({balance:total(id),today:today(id,clock()),totalCheckins:db.prepare('SELECT COUNT(*) n FROM student_coin_checkins WHERE student_id=?').get(id).n,ruleVersion:VERSION}))();
 const accessible=(id,lesson)=>Boolean(db.prepare("SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE l.id=? AND e.student_id=? AND e.status='active' AND c.status='published' AND l.status!='cancelled'").get(lesson,id));
 const dto=(id,row)=>{const {snapshot_json,...value}=row;return {...value,accessible:row.reward_type==='lesson'&&accessible(id,row.lesson_id),snapshot:JSON.parse(snapshot_json)};};
 const ledger=(id,before)=>{if(before!==undefined&&(typeof before!=='string'||!/^\d{1,15}$/.test(before)||Number(before)<1))invalid('明细游标无效');const rows=db.prepare('SELECT * FROM student_coin_ledger WHERE student_id=? AND sequence<? ORDER BY sequence DESC LIMIT 21').all(id,before===undefined?Number.MAX_SAFE_INTEGER:Number(before));return {entries:rows.slice(0,20).map(r=>dto(id,r)),nextBefore:rows.length>20?String(rows[19].sequence):null};};
 const calendar=(id,month)=>{if(!validMonth(month))invalid('月份须为2000–2099年内的YYYY-MM');const start=month+'-01',end=month+'-32';return {month,records:db.prepare('SELECT checkin_date,streak,amount FROM student_coin_checkins WHERE student_id=? AND checkin_date>=? AND checkin_date<? ORDER BY checkin_date').all(id,start,end),today:today(id,clock())};};
 const checkin=id=>db.transaction(()=>{const now=clock(),state=today(id,now);if(state.checked)return {...summary(id),entry:dto(id,db.prepare('SELECT * FROM student_coin_ledger WHERE id=? AND student_id=?').get(state.record.ledger_id,id)),created:false};
  const entryId=randomUUID(),snapshot={version:VERSION,date:state.date,streak:state.todayStreak,amount:state.amount};
  db.prepare("INSERT INTO student_coin_ledger(id,student_id,reward_type,amount,occurred_at,beijing_date,rule_version,checkin_date,snapshot_json) VALUES(?,?,'checkin',?,?,?,?,?,?)").run(entryId,id,state.amount,now.toISOString(),state.date,VERSION,state.date,JSON.stringify(snapshot));
  db.prepare('INSERT INTO student_coin_checkins(student_id,checkin_date,streak,amount,ledger_id) VALUES(?,?,?,?,?)').run(id,state.date,state.todayStreak,state.amount,entryId);
  return {...summary(id),entry:dto(id,db.prepare('SELECT * FROM student_coin_ledger WHERE id=?').get(entryId)),created:true};
 }).immediate();
 const reconcile=id=>db.transaction(()=>{const created=[],settled=[],pending=[];
  const lessons=db.prepare("SELECT l.id,l.course_id,l.title lesson_title,c.title course_title FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE e.student_id=? AND e.status='active' AND c.status='published' AND l.status!='cancelled' ORDER BY c.id,l.sort_order,l.id").all(id);
  for(const l of lessons){const old=db.prepare("SELECT * FROM student_coin_ledger WHERE student_id=? AND lesson_id=? AND reward_type='lesson'").get(id,l.id);if(old){settled.push({lessonId:l.id,entryId:old.id,amount:old.amount});continue;}
   const state=taskEligibility(id,l.id),report=latestReport(id,l.id),score=report?.score,validScore=typeof score==='number'&&Number.isInteger(score)&&score>=0&&score<=100;
   const checks=[...state.checks,{key:'score',satisfied:validScore,reason:'最新已通过报告尚缺有效的0–100整数评分，请等待负责导师补充；可以稍后重新核对'}];
   if(!checks.every(c=>c.satisfied)){pending.push({lessonId:l.id,courseId:l.course_id,lessonTitle:l.lesson_title,checks:checks.filter(c=>!c.satisfied)});continue;}
   const now=clock(),entryId=randomUUID(),snapshot={version:VERSION,checks,reportId:report.id,reportVersion:report.version,score,works:db.prepare("SELECT w.id,w.version,w.review_status FROM works w JOIN tasks t ON t.id=w.task_id WHERE w.student_id=? AND t.lesson_id=? AND t.status='active' ORDER BY w.id").all(id,l.id)};
   db.prepare("INSERT INTO student_coin_ledger(id,student_id,reward_type,amount,occurred_at,beijing_date,rule_version,lesson_id,course_id,report_id,report_version,report_score,lesson_title,course_title,snapshot_json) VALUES(?,?,'lesson',?,?,?,?,?,?,?,?,?,?,?,?)").run(entryId,id,score,now.toISOString(),dayAt(now),VERSION,l.id,l.course_id,report.id,report.version,score,l.lesson_title,l.course_title,JSON.stringify(snapshot));created.push({lessonId:l.id,entryId,amount:score});
  }return {...summary(id),created,settled,pending};
 }).immediate();
 return {summary,ledger,calendar,checkin,reconcile};
}
module.exports={...createCoinService(),createCoinService,dayAt,previousDay,validMonth,VERSION,fields};
