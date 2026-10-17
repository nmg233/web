const db=require('../config/database'),{randomUUID}=require('node:crypto');
const {invalid,fields}=require('./studentRewards');
const scope=require('../helpers/courseRewardScope');
const PHYSICAL_SUCCESS='兑换成功！老师会在下次课把奖品带给你哦~';
const balance=id=>db.prepare(`SELECT COALESCE((SELECT SUM(amount) FROM student_coin_ledger WHERE student_id=?),0)-COALESCE((SELECT SUM(cost) FROM reward_orders WHERE student_id=?),0) balance`).get(id,id).balance;
const strictId=id=>{if(!/^\d{1,12}$/.test(String(id))||Number(id)<1)invalid('礼品编号无效');return Number(id);};
const key=k=>{if(typeof k!=='string'||!/^[-a-zA-Z0-9_]{16,100}$/.test(k))invalid('请求编号无效');return k;};
const imageUrl=id=>id?'/api/reward-shop/images/'+id:null;
function giftDTO(g,student){
 const redeemed=student?db.prepare('SELECT COUNT(*) n FROM reward_orders WHERE student_id=? AND gift_id=?').get(student,g.id).n:0;
 const alreadyBadge=student&&g.type==='badge'&&db.prepare('SELECT 1 FROM reward_badge_grants WHERE student_id=? AND gift_id=?').get(student,g.id);
 return {...g,image_url:imageUrl(g.image_id),redeemed,blockedReason:!g.published?'礼品已下架':g.stock<1?'库存不足':alreadyBadge?'你已拥有这个徽章':g.per_student_limit!==null&&redeemed>=g.per_student_limit?'已达到限兑次数':null};
}
function catalog(student,courseId){const courses=scope.courses(student);if(courseId!=null&&!courses.some(c=>c.id===Number(courseId)))scope.fail('课程当前不可访问');return {gifts:db.prepare(`SELECT g.*,c.title course_title FROM reward_gifts g JOIN courses c ON c.id=g.course_id JOIN enrollments e ON e.course_id=c.id WHERE g.published=1 AND c.status='published' AND e.student_id=? AND e.status='active' AND (? IS NULL OR c.id=?) ORDER BY c.id,g.id DESC`).all(student,courseId??null,courseId??null).map(g=>giftDTO(g,student)),balance:balance(student),courses};}
function page(query){const n=Number(query.page||1);if(!Number.isSafeInteger(n)||n<1||n>1000000)invalid('页码无效');return n;}
function orders(student,query={},manager){const p=page(query),courseId=query.courseId==null?null:strictId(query.courseId);if(manager)scope.manage(manager,courseId);const where=student?'WHERE student_id=? AND (? IS NULL OR course_id=?)':'WHERE course_id IS ?',args=student?[student,courseId,courseId]:[courseId];
 return {courses:student?db.prepare('SELECT DISTINCT course_id id,course_title title FROM reward_orders WHERE student_id=? AND course_id IS NOT NULL').all(student):[],items:db.prepare(`SELECT * FROM reward_orders ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).all(...args,(p-1)*20).map(o=>({...o,image_url:imageUrl(o.image_id)})),total:db.prepare(`SELECT COUNT(*) n FROM reward_orders ${where}`).get(...args).n,page:p};
}
function managedGifts(actor,courseId){scope.manage(actor,courseId);return {gifts:db.prepare('SELECT * FROM reward_gifts WHERE course_id IS ? ORDER BY id DESC').all(courseId??null).map(g=>giftDTO(g))};}
function managedOrder(actor,id,courseId){const o=db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id);if(!o)scope.fail('兑换订单不存在');scope.manage(actor,o.course_id);if(courseId!==undefined&&Number(courseId)!==o.course_id)scope.fail('订单不属于当前课程');return {items:[o],total:1,page:1};}
function outbox(eventKey,payload,recipients,courseId=null){db.prepare('INSERT OR IGNORE INTO notification_outbox(event_key,payload_json,recipients_json,reward_course_id) VALUES(?,?,?,?)').run(eventKey,JSON.stringify({...payload,dedupeKey:eventKey,category:'system'}),JSON.stringify(recipients),courseId);}
// Notification creation + delivery marker share a transaction. A crash cannot
// leave a delivered notification without its durable retry/deduplication state.
function flushNotifications(actor,courseId){
 if(actor){scope.manage(actor,courseId);db.prepare("UPDATE notification_outbox SET quarantined_at=NULL,next_retry_at=NULL,attempts=0 WHERE event_key LIKE 'real-reward:%' AND delivered_at IS NULL AND reward_course_id IS ?").run(courseId??null);}
 const ns=require('./notificationService');
 const pending=db.prepare("SELECT * FROM notification_outbox WHERE event_key LIKE 'real-reward:%' AND delivered_at IS NULL AND quarantined_at IS NULL AND (?=0 OR reward_course_id IS ?) ORDER BY created_at LIMIT 50").all(actor?1:0,courseId??null);
 for(const event of pending){try{db.transaction(()=>{
   const current=db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(event.event_key);if(current.delivered_at)return;
   const recipients=JSON.parse(event.recipients_json),ids=recipients==='admins'||recipients==='course-managers'?require('../helpers/courseScope').managerRecipients(db,event.reward_course_id):recipients;
   const result=ns.createForUsers(JSON.parse(event.payload_json),ids);if(!result)throw Error('接收账号暂不可用');
   db.prepare('UPDATE notification_outbox SET delivered_at=CURRENT_TIMESTAMP,attempts=attempts+1,last_error=NULL,next_retry_at=NULL WHERE event_key=?').run(event.event_key);
  }).immediate();
 }catch{db.prepare("UPDATE notification_outbox SET attempts=attempts+1,last_error='通知待重试，请管理员检查接收账号或通知服务',next_retry_at=datetime('now','+30 seconds') WHERE event_key=? AND delivered_at IS NULL").run(event.event_key);}}
 return notificationState();
}
function notificationState(actor,courseId){if(actor)scope.manage(actor,courseId);return {pending:db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE event_key LIKE 'real-reward:%' AND delivered_at IS NULL AND (?=0 OR reward_course_id IS ?)").get(actor?1:0,courseId??null).n};}
function redeem(student,body){fields(body,['giftId','requestKey','expectedPrice']);const giftId=strictId(body.giftId),requestKey=key(body.requestKey);if(!Number.isSafeInteger(body.expectedPrice)||body.expectedPrice<1)invalid('缺少确认时的金币价格');
 const result=db.transaction(()=>{
  const old=db.prepare('SELECT * FROM reward_orders WHERE student_id=? AND request_key=?').get(student,requestKey);
  if(old){const current=db.prepare("SELECT 1 FROM users WHERE id=? AND role='student' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(student);if(!current)invalid('账号当前不能兑换',401);if(old.gift_id!==giftId||old.cost!==body.expectedPrice)invalid('同一请求编号不能更换礼品或价格',409);return {order:old,created:false,balance:balance(student)};}
  const user=db.prepare("SELECT * FROM users WHERE id=? AND role='student' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(student);if(!user)invalid('账号当前不能兑换，请重新登录',401);
  const g=db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(giftId);if(!g||!g.published)invalid('礼品已下架或不存在',409);
  if(!scope.accessible(student,g.course_id))scope.fail('礼品所属课程当前不可兑换');
  if(g.price!==body.expectedPrice)invalid('礼品价格已变化，请重新查看后确认',409);
  const state=giftDTO(g,student);if(state.blockedReason)invalid(state.blockedReason,409);
  if(balance(student)<g.price)invalid('金币不足',409);
  const now=new Date().toISOString(),id=randomUUID();
  const reduced=db.prepare('UPDATE reward_gifts SET stock=stock-1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>0 AND published=1').run(giftId);if(!reduced.changes)invalid('库存不足',409);
  db.prepare('INSERT INTO reward_orders(id,student_id,request_key,gift_id,gift_name,gift_type,gift_description,image_id,cost,student_name,student_username,status,created_at,fulfilled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,student,requestKey,giftId,g.name,g.type,g.description,g.image_id,g.price,user.real_name||user.username,user.username,g.type==='badge'?'fulfilled':'pending',now,g.type==='badge'?now:null);
  const courseTitle=db.prepare('SELECT title FROM courses WHERE id=?').get(g.course_id).title;
  db.prepare('UPDATE reward_orders SET course_id=?,course_title=? WHERE id=?').run(g.course_id,courseTitle,id);
  if(g.type==='badge')db.prepare('INSERT INTO reward_badge_grants(id,order_id,student_id,gift_id,name,description,image_id,earned_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),id,student,giftId,g.name,g.description,g.image_id,now);
  if(g.type==='badge')db.prepare('UPDATE reward_badge_grants SET course_id=?,course_title=? WHERE order_id=?').run(g.course_id,courseTitle,id);
  outbox('real-reward:order:'+id,{eventKey:'real_reward_order',title:'学生礼品兑换',content:`${user.real_name||user.username}（${user.username}）兑换了「${g.name}」，消耗 ${g.price} 金币。${g.type==='physical'?'请线下发放后标记已发放。':'数字徽章已加入账号。'}`,actionUrl:`/courses/${g.course_id}?tab=rewards&order=${encodeURIComponent(id)}`,createdBy:student},'course-managers',g.course_id);
  return {order:db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id),created:true,balance:balance(student)};
 }).immediate();
 flushNotifications();return {...result,message:result.order.gift_type==='physical'?PHYSICAL_SUCCESS:'兑换成功！徽章已加入你的徽章墙。'};
}
function validateGift(body,actor,courseId){
 fields(body,['name','type','description','imageId','price','stock','perStudentLimit','published','revision','courseId','requestKey']);
 if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)invalid('礼品名称须为1–80个字');
 if(!['physical','badge'].includes(body.type))invalid('请选择实物或徽章');
 if(typeof body.description!=='string'||body.description.length>2000)invalid('介绍最多2000字');
 for(const f of ['price','stock'])if(!Number.isSafeInteger(body[f])||body[f]<(f==='price'?1:0)||body[f]>1000000)invalid(f==='price'?'金币价格须为1–1000000整数':'库存须为0–1000000整数');
 if(body.perStudentLimit!==null&&(!Number.isSafeInteger(body.perStudentLimit)||body.perStudentLimit<1||body.perStudentLimit>1000000))invalid('限兑次数须为正整数，或留空表示不限');
 if(typeof body.published!=='boolean')invalid('上下架状态无效');
 if(body.imageId!==null&&(typeof body.imageId!=='string'||!db.prepare('SELECT 1 FROM reward_images WHERE id=?').get(body.imageId)))invalid('请先上传有效图片');
 if(body.imageId)scope.imageManage(actor,body.imageId,courseId);
 if(body.published&&!body.imageId)invalid('上架前请上传一张图片');
 return body;
}
function saveGift(actor,id,body){return db.transaction(()=>{
 const old=id?db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(strictId(id)):null;
 if(id&&!old)invalid('礼品不存在',404);
 const courseId=old?.course_id??(body.courseId==null?null:strictId(body.courseId));scope.manage(actor,courseId);if(!old&&courseId==null)invalid('请从真实课程内新增礼品');if(old&&body.courseId!=null&&Number(body.courseId)!==old.course_id)invalid('礼品不能转移课程，请创建独立礼品',409);
 const b=validateGift(body,actor,courseId);
 const request=body.requestKey?require('../helpers/requestResults').identity({id:actor},'course-gift-create',{...body,request_key:key(body.requestKey)}):null;const replay=!id&&request&&require('../helpers/requestResults').existing(db,request);if(replay)return replay;
 if(old&&(!Number.isSafeInteger(b.revision)||b.revision!==old.revision))invalid('礼品或库存已变化，请刷新后重新编辑',409);
 if(old&&old.type!==b.type&&db.prepare('SELECT 1 FROM reward_orders WHERE gift_id=?').get(old.id))invalid('已兑换的礼品不能更换类型，请新建礼品',409);
 let giftId=old?.id;
 if(old)db.prepare('UPDATE reward_gifts SET name=?,type=?,description=?,image_id=?,price=?,stock=?,per_student_limit=?,published=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name.trim(),b.type,b.description,b.imageId,b.price,b.stock,b.perStudentLimit,+b.published,actor,giftId);
 else giftId=Number(db.prepare('INSERT INTO reward_gifts(name,type,description,image_id,price,stock,per_student_limit,published,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(b.name.trim(),b.type,b.description,b.imageId,b.price,b.stock,b.perStudentLimit,+b.published,actor,actor).lastInsertRowid);
 if(!old)db.prepare('UPDATE reward_gifts SET course_id=? WHERE id=?').run(courseId,giftId);
 const saved=db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(giftId);
 db.prepare('INSERT INTO reward_admin_audit(actor_id,action,object_id,before_json,after_json) VALUES(?,?,?,?,?)').run(actor,old?'gift.update':'gift.create',String(giftId),old?JSON.stringify(old):null,JSON.stringify(saved));const dto=giftDTO(saved);if(!id&&request)require('../helpers/requestResults').save(db,request,dto);return dto;
 }).immediate();}
function fulfill(actor,id,body){fields(body,['courseId']);if(typeof id!=='string'||id.length>100)invalid('订单编号无效');const result=db.transaction(()=>{
 const order=db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id);if(!order)invalid('兑换记录不存在',404);scope.manage(actor,order.course_id);if(body.courseId!==undefined&&Number(body.courseId)!==order.course_id)scope.fail('订单不属于当前课程');if(order.status==='fulfilled')return order;
 const name=db.prepare('SELECT real_name,username FROM users WHERE id=?').get(actor);
 db.prepare("UPDATE reward_orders SET status='fulfilled',fulfilled_by=?,fulfiller_name=?,fulfilled_at=? WHERE id=? AND status='pending'").run(actor,name.real_name||name.username,new Date().toISOString(),id);
 const saved=db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id);
 db.prepare('INSERT INTO reward_admin_audit(actor_id,action,object_id,before_json,after_json) VALUES(?,?,?,?,?)').run(actor,'order.fulfill',id,JSON.stringify(order),JSON.stringify(saved));
 outbox('real-reward:fulfilled:'+id,{eventKey:'real_reward_fulfilled',title:'礼品已发放',content:`你兑换的「${order.gift_name}」已由老师发放。`,actionUrl:'/me?rewards=records',createdBy:actor},[order.student_id],order.course_id);return saved;
 }).immediate();flushNotifications();return result;}
function badges(student){return db.prepare("SELECT *, 'exchange' source FROM reward_badge_grants WHERE student_id=? ORDER BY earned_at,id").all(student).map(g=>({...g,image_url:imageUrl(g.image_id),accessible:false,shown_at:g.earned_at}));}
module.exports={managedGifts,managedOrder,balance,catalog,orders,redeem,saveGift,fulfill,badges,giftDTO,key,flushNotifications,notificationState,PHYSICAL_SUCCESS};
