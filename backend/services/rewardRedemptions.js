const db=require('../config/database'),{randomUUID}=require('node:crypto');
const {invalid,fields}=require('./studentRewards');
const PHYSICAL_SUCCESS='兑换成功！老师会在下次课把奖品带给你哦~';
const balance=id=>db.prepare(`SELECT COALESCE((SELECT SUM(amount) FROM student_coin_ledger WHERE student_id=?),0)-COALESCE((SELECT SUM(cost) FROM reward_orders WHERE student_id=?),0) balance`).get(id,id).balance;
const strictId=id=>{if(!/^\d{1,12}$/.test(String(id))||Number(id)<1)invalid('礼品编号无效');return Number(id);};
const key=k=>{if(typeof k!=='string'||!/^[-a-zA-Z0-9_]{16,100}$/.test(k))invalid('请求编号无效');return k;};
const imageUrl=id=>id?'/api/reward-shop/images/'+id:null;
function assertAdmin(id){if(!db.prepare("SELECT 1 FROM users WHERE id=? AND role='admin' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(id))invalid('仅当前有效管理员可以操作',403);}
function giftDTO(g,student){
 const redeemed=student?db.prepare('SELECT COUNT(*) n FROM reward_orders WHERE student_id=? AND gift_id=?').get(student,g.id).n:0;
 const alreadyBadge=student&&g.type==='badge'&&db.prepare('SELECT 1 FROM reward_badge_grants WHERE student_id=? AND gift_id=?').get(student,g.id);
 return {...g,image_url:imageUrl(g.image_id),redeemed,blockedReason:!g.published?'礼品已下架':g.stock<1?'库存不足':alreadyBadge?'你已拥有这个徽章':g.per_student_limit!==null&&redeemed>=g.per_student_limit?'已达到限兑次数':null};
}
function catalog(student){return {gifts:db.prepare('SELECT * FROM reward_gifts WHERE published=1 ORDER BY id DESC').all().map(g=>giftDTO(g,student)),balance:balance(student)};}
function page(query){const n=Number(query.page||1);if(!Number.isSafeInteger(n)||n<1||n>1000000)invalid('页码无效');return n;}
function orders(student,query={}){const p=page(query),where=student?'WHERE student_id=?':'',args=student?[student]:[];
 return {items:db.prepare(`SELECT * FROM reward_orders ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).all(...args,(p-1)*20).map(o=>({...o,image_url:imageUrl(o.image_id)})),total:db.prepare(`SELECT COUNT(*) n FROM reward_orders ${where}`).get(...args).n,page:p};
}
function outbox(eventKey,payload,recipients){db.prepare('INSERT OR IGNORE INTO notification_outbox(event_key,payload_json,recipients_json) VALUES(?,?,?)').run(eventKey,JSON.stringify({...payload,dedupeKey:eventKey,category:'system'}),JSON.stringify(recipients));}
// Notification creation + delivery marker share a transaction. A crash cannot
// leave a delivered notification without its durable retry/deduplication state.
function flushNotifications(){
 const ns=require('./notificationService');
 const pending=db.prepare("SELECT * FROM notification_outbox WHERE event_key LIKE 'real-reward:%' AND delivered_at IS NULL AND quarantined_at IS NULL ORDER BY created_at LIMIT 50").all();
 for(const event of pending){try{db.transaction(()=>{
   const current=db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(event.event_key);if(current.delivered_at)return;
   const recipients=JSON.parse(event.recipients_json),ids=recipients==='admins'?ns.userIdsByRoles(['admin']):recipients;
   const result=ns.createForUsers(JSON.parse(event.payload_json),ids);if(!result)throw Error('接收账号暂不可用');
   db.prepare('UPDATE notification_outbox SET delivered_at=CURRENT_TIMESTAMP,attempts=attempts+1,last_error=NULL,next_retry_at=NULL WHERE event_key=?').run(event.event_key);
  }).immediate();
 }catch{db.prepare("UPDATE notification_outbox SET attempts=attempts+1,last_error='通知待重试，请管理员检查接收账号或通知服务',next_retry_at=datetime('now','+30 seconds') WHERE event_key=? AND delivered_at IS NULL").run(event.event_key);}}
 return notificationState();
}
function notificationState(){return {pending:db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE event_key LIKE 'real-reward:%' AND delivered_at IS NULL").get().n};}
function redeem(student,body){fields(body,['giftId','requestKey','expectedPrice']);const giftId=strictId(body.giftId),requestKey=key(body.requestKey);if(!Number.isSafeInteger(body.expectedPrice)||body.expectedPrice<1)invalid('缺少确认时的金币价格');
 const result=db.transaction(()=>{
  const old=db.prepare('SELECT * FROM reward_orders WHERE student_id=? AND request_key=?').get(student,requestKey);
  if(old){if(old.gift_id!==giftId||old.cost!==body.expectedPrice)invalid('同一请求编号不能更换礼品或价格',409);return {order:old,created:false,balance:balance(student)};}
  const user=db.prepare("SELECT * FROM users WHERE id=? AND role='student' AND is_active=1 AND archived_at IS NULL AND force_reset_password=0").get(student);if(!user)invalid('账号当前不能兑换，请重新登录',401);
  const g=db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(giftId);if(!g||!g.published)invalid('礼品已下架或不存在',409);
  if(g.price!==body.expectedPrice)invalid('礼品价格已变化，请重新查看后确认',409);
  const state=giftDTO(g,student);if(state.blockedReason)invalid(state.blockedReason,409);
  if(balance(student)<g.price)invalid('金币不足',409);
  const now=new Date().toISOString(),id=randomUUID();
  const reduced=db.prepare('UPDATE reward_gifts SET stock=stock-1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>0 AND published=1').run(giftId);if(!reduced.changes)invalid('库存不足',409);
  db.prepare('INSERT INTO reward_orders(id,student_id,request_key,gift_id,gift_name,gift_type,gift_description,image_id,cost,student_name,student_username,status,created_at,fulfilled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,student,requestKey,giftId,g.name,g.type,g.description,g.image_id,g.price,user.real_name||user.username,user.username,g.type==='badge'?'fulfilled':'pending',now,g.type==='badge'?now:null);
  if(g.type==='badge')db.prepare('INSERT INTO reward_badge_grants(id,order_id,student_id,gift_id,name,description,image_id,earned_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),id,student,giftId,g.name,g.description,g.image_id,now);
  outbox('real-reward:order:'+id,{eventKey:'real_reward_order',title:'学生礼品兑换',content:`${user.real_name||user.username}（${user.username}）兑换了「${g.name}」，消耗 ${g.price} 金币。${g.type==='physical'?'请线下发放后标记已发放。':'数字徽章已加入账号。'}`,actionUrl:'/reward-management',createdBy:student},'admins');
  return {order:db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id),created:true,balance:balance(student)};
 }).immediate();
 flushNotifications();return {...result,message:result.order.gift_type==='physical'?PHYSICAL_SUCCESS:'兑换成功！徽章已加入你的徽章墙。'};
}
function validateGift(body){
 fields(body,['name','type','description','imageId','price','stock','perStudentLimit','published','revision']);
 if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)invalid('礼品名称须为1–80个字');
 if(!['physical','badge'].includes(body.type))invalid('请选择实物或徽章');
 if(typeof body.description!=='string'||body.description.length>2000)invalid('介绍最多2000字');
 for(const f of ['price','stock'])if(!Number.isSafeInteger(body[f])||body[f]<(f==='price'?1:0)||body[f]>1000000)invalid(f==='price'?'金币价格须为1–1000000整数':'库存须为0–1000000整数');
 if(body.perStudentLimit!==null&&(!Number.isSafeInteger(body.perStudentLimit)||body.perStudentLimit<1||body.perStudentLimit>1000000))invalid('限兑次数须为正整数，或留空表示不限');
 if(typeof body.published!=='boolean')invalid('上下架状态无效');
 if(body.imageId!==null&&(typeof body.imageId!=='string'||!db.prepare('SELECT 1 FROM reward_images WHERE id=?').get(body.imageId)))invalid('请先上传有效图片');
 if(body.published&&!body.imageId)invalid('上架前请上传一张图片');
 return body;
}
function saveGift(actor,id,body){return db.transaction(()=>{
 assertAdmin(actor);
 const b=validateGift(body),old=id?db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(strictId(id)):null;
 if(id&&!old)invalid('礼品不存在',404);
 if(old&&(!Number.isSafeInteger(b.revision)||b.revision!==old.revision))invalid('礼品或库存已变化，请刷新后重新编辑',409);
 if(old&&old.type!==b.type&&db.prepare('SELECT 1 FROM reward_orders WHERE gift_id=?').get(old.id))invalid('已兑换的礼品不能更换类型，请新建礼品',409);
 let giftId=old?.id;
 if(old)db.prepare('UPDATE reward_gifts SET name=?,type=?,description=?,image_id=?,price=?,stock=?,per_student_limit=?,published=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name.trim(),b.type,b.description,b.imageId,b.price,b.stock,b.perStudentLimit,+b.published,actor,giftId);
 else giftId=Number(db.prepare('INSERT INTO reward_gifts(name,type,description,image_id,price,stock,per_student_limit,published,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(b.name.trim(),b.type,b.description,b.imageId,b.price,b.stock,b.perStudentLimit,+b.published,actor,actor).lastInsertRowid);
 const saved=db.prepare('SELECT * FROM reward_gifts WHERE id=?').get(giftId);
 db.prepare('INSERT INTO reward_admin_audit(actor_id,action,object_id,before_json,after_json) VALUES(?,?,?,?,?)').run(actor,old?'gift.update':'gift.create',String(giftId),old?JSON.stringify(old):null,JSON.stringify(saved));return giftDTO(saved);
 }).immediate();}
function fulfill(actor,id,body){fields(body,[]);if(typeof id!=='string'||id.length>100)invalid('订单编号无效');const result=db.transaction(()=>{
 assertAdmin(actor);
 const order=db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id);if(!order)invalid('兑换记录不存在',404);if(order.status==='fulfilled')return order;
 const name=db.prepare('SELECT real_name,username FROM users WHERE id=?').get(actor);
 db.prepare("UPDATE reward_orders SET status='fulfilled',fulfilled_by=?,fulfiller_name=?,fulfilled_at=? WHERE id=? AND status='pending'").run(actor,name.real_name||name.username,new Date().toISOString(),id);
 const saved=db.prepare('SELECT * FROM reward_orders WHERE id=?').get(id);
 db.prepare('INSERT INTO reward_admin_audit(actor_id,action,object_id,before_json,after_json) VALUES(?,?,?,?,?)').run(actor,'order.fulfill',id,JSON.stringify(order),JSON.stringify(saved));
 outbox('real-reward:fulfilled:'+id,{eventKey:'real_reward_fulfilled',title:'礼品已发放',content:`你兑换的「${order.gift_name}」已由老师发放。`,actionUrl:'/me?rewards=records',createdBy:actor},[order.student_id]);return saved;
 }).immediate();flushNotifications();return result;}
function badges(student){return db.prepare("SELECT *, 'exchange' source FROM reward_badge_grants WHERE student_id=? ORDER BY earned_at,id").all(student).map(g=>({...g,image_url:imageUrl(g.image_id),accessible:false,shown_at:g.earned_at}));}
module.exports={balance,catalog,orders,redeem,saveGift,fulfill,badges,giftDTO,key,flushNotifications,notificationState,PHYSICAL_SUCCESS};
