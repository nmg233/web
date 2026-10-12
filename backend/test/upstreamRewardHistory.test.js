const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),jwt=require('jsonwebtoken');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-reward-history-'));
Object.assign(process.env,{NODE_ENV:'test',DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'),JWT_SECRET:'reward-history-integration'});
const app=require('../app'),db=require('../config/database'),coins=require('../services/studentCoins');let server,url;
const historyTables=['student_coin_ledger','student_coin_checkins','student_badge_grants','reward_orders','reward_badge_grants','demo_exchange_events'];
const histories=()=>Object.fromEntries(historyTables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
const user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
async function api(p,method='GET',body){const response=await fetch(url+'/api'+p,{method,headers:{Authorization:'Bearer '+jwt.sign({id:1,role:'admin',auth_version:0},process.env.JWT_SECRET),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
before(async()=>{
 db.exec("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'history_admin','unchanged-admin','历史管理员','admin');INSERT INTO schools(id,name) VALUES(1,'历史学校');INSERT INTO classes(id,name,school_id) VALUES(1,'历史班级',1);");
 for(const id of[2,3,4,5,98,99])db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,'unchanged-student',?,'student')").run(id,'history_'+id,'历史学生'+id);
 // No enrollments or lessons are needed for account-level history; those older
 // blockers must not accidentally be the reason these accounts are protected.
 coins.checkin(2);
 db.prepare("INSERT INTO student_badge_grants(id,student_id,lesson_id,course_id,name,art_id,description,lesson_title,course_title,criterion_snapshot) VALUES('lesson-badge-history',3,901,902,'已获得课时徽章','vr','历史记录','已移除课时','已移除课程','{}')").run();
 db.prepare("INSERT INTO reward_gifts(id,name,type,description,price,stock,per_student_limit,published,created_by,updated_by) VALUES(1,'历史徽章礼品','badge','隔离历史验收',1,0,1,0,1,1)").run();
 db.prepare("INSERT INTO reward_orders(id,student_id,request_key,gift_id,gift_name,gift_type,gift_description,cost,student_name,student_username,status,created_at,fulfilled_at) VALUES('historical-order',4,'historical-request-123',1,'历史徽章礼品','badge','隔离历史验收',1,'历史学生4','history_4','fulfilled','2026-10-01T10:00:00Z','2026-10-01T10:00:00Z')").run();
 db.prepare("INSERT INTO reward_badge_grants(id,order_id,student_id,gift_id,name,description,earned_at) VALUES('exchange-badge-history','historical-order',4,1,'历史徽章礼品','隔离历史验收','2026-10-01T10:00:00Z')").run();
 db.prepare("INSERT INTO demo_exchange_events(id,student_id,operation_id,gift_id,gift_name,gift_type) VALUES('demo-history',5,'old-demo-operation','old-demo-gift','历史演示礼品','physical')").run();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('只有奖励历史且无教学关联的账号，三种删除入口均保留账号与真实/演示历史',async()=>{
 assert.equal(db.prepare('SELECT COUNT(*) n FROM enrollments').get().n,0);const before=histories();
 for(const [id,label]of[[2,'真实金币流水'],[3,'课时徽章记录'],[4,'真实礼品兑换订单'],[5,'历史演示兑换记录']]){
  const original=user(id);
  for(const prefix of ['/students/','/students/users/']){const response=await api(prefix+id,'DELETE');assert.equal(response.status,400);assert.match(response.data.error,new RegExp(label));assert.deepEqual(user(id),original);assert.deepEqual(histories(),before);}
  const batch=await api('/students/users/batch-delete','POST',{ids:[id]});assert.equal(batch.status,200);assert.deepEqual(batch.data.deleted,[]);assert.equal(batch.data.blocked.length,1);assert.match(batch.data.blocked[0],new RegExp(label));assert.deepEqual(user(id),original);assert.deepEqual(histories(),before);
 }
});
test('有奖励历史不能通过改角色绕过数据保护，仍可合法停用/归档和恢复且不丢历史',async()=>{
 const before=histories();
 for(const id of[2,3,4,5]){
  const original=user(id);const changed=await api('/students/users/'+id,'PUT',{real_name:original.real_name,role:'teacher',school_id:1,class_id:1});assert.equal(changed.status,409);assert.ok(changed.data.blockers.length);assert.deepEqual(user(id),original);assert.deepEqual(histories(),before);
  for(const action of ['disable','archive','restore']){const response=await api('/students/'+id+'/status','POST',{action,reason:'隔离验收：保留奖励历史'});assert.equal(response.status,200,JSON.stringify(response.data));assert.equal(user(id).is_active,action==='restore'?1:0);assert.equal(Boolean(user(id).archived_at),action==='archive');assert.equal(user(id).password_hash,original.password_hash);assert.deepEqual(histories(),before);}
 }
});
test('真正无历史账号仍可删除、变更角色；混合批量删除仅删除无历史账号',async()=>{
 const before=histories();assert.equal((await api('/students/users/98','PUT',{real_name:'无历史教师',role:'teacher',school_id:1,class_id:1})).status,200);assert.equal(user(98).role,'teacher');assert.equal((await api('/students/users/98','DELETE')).status,200);assert.equal(user(98),undefined);
 const batch=await api('/students/users/batch-delete','POST',{ids:[2,99]});assert.equal(batch.status,200);assert.equal(batch.data.deleted.length,1);assert.equal(batch.data.blocked.length,1);assert.ok(user(2));assert.equal(user(99),undefined);assert.deepEqual(histories(),before);
});

test('确定性模拟事务边界新增奖励历史：写事务重验保留账号和金币（非并发压测）',()=>{
 const controller=require('../controllers/studentController');
 const originalTransaction=db.transaction;
 const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 for(const [id,operation] of [[90,'deleteUser'],[91,'deleteStudent'],[92,'batchDeleteUsers'],[93,'updateUser']]){
  db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,'unchanged','竞态学生','student')").run(id,'boundary_'+id);
  let injected=false;
  db.transaction=function(fn){const tx=originalTransaction.call(this,fn);const inject=()=>{if(!injected){injected=true;const patched=db.transaction;db.transaction=originalTransaction;try{coins.checkin(id);}finally{db.transaction=patched;}}};const wrapper=(...args)=>{inject();return tx(...args);};wrapper.immediate=(...args)=>{inject();return tx.immediate(...args);};return wrapper;};
  const req={params:{id:String(id)},user:{id:1,role:'admin'},body:operation==='updateUser'?{real_name:'竞态学生',role:'teacher',school_id:1,class_id:1}:operation==='batchDeleteUsers'?{ids:[id]}:{}};
  const res=response();
  try{controller[operation](req,res);}finally{db.transaction=originalTransaction;}
  assert.equal(injected,true,operation+' reached write boundary');assert.ok(user(id));assert.equal(user(id).role,'student');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_coin_ledger WHERE student_id=?').get(id).n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_coin_checkins WHERE student_id=?').get(id).n,1);
  if(operation==='batchDeleteUsers'){assert.equal(res.code,200);assert.deepEqual(res.body.deleted,[]);assert.equal(res.body.blocked.length,1);}else{assert.equal(res.code,operation==='updateUser'?409:400);assert.match(res.body.error,/历史|关联/);}
 }
});
