const {test,after}=require('node:test');
const assert=require('node:assert/strict'),Database=require('better-sqlite3');
const db=new Database(':memory:');db.pragma('foreign_keys=ON');
require('../database/migrate').runMigrations(db);
require.cache[require.resolve('../config/database')]={exports:db};
const notify=require('../services/notificationService'),rewards=require('../services/rewardRedemptions'),readiness=require('../helpers/readiness');
db.prepare("INSERT INTO users(id,username,password_hash,real_name,role) VALUES(1,'admin','hash','管理员','admin')").run();
after(()=>db.close());
function queue(key){db.prepare('INSERT INTO notification_outbox(event_key,payload_json,recipients_json) VALUES(?,?,?)').run(key,JSON.stringify({eventKey:'real_reward_order',title:'隔离兑换通知',content:'只验证队列兼容，不创建正式订单',category:'system'}),JSON.stringify('admins'));}
test('上游通知worker可消费真实兑换动态管理员队列，两worker交替不重复通知',()=>{
 const key='real-reward:integration:shared';queue(key);notify.retryOutbox();rewards.flushNotifications();notify.retryOutbox();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(key).n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM user_notifications un JOIN notifications n ON n.id=un.notification_id WHERE n.dedupe_key=?').get(key).n,1);
 assert.ok(db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(key).delivered_at);
});
test('没有有效管理员时不能伪装已投递；恢复接收账号后管理员重放可恢复',()=>{
 const key='real-reward:integration:recipient';queue(key);db.prepare('UPDATE users SET is_active=0 WHERE id=1').run();
 const log=console.error;console.error=()=>{};try{notify.retryOutbox();}finally{console.error=log;}
 assert.equal(db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(key).delivered_at,null);
 db.prepare('UPDATE users SET is_active=1 WHERE id=1').run();notify.replayOutbox({id:1,role:'admin'},key);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(key).n,1);
});
test('通知已创建但投递标记失败整体回滚，重放后只有一次通知',()=>{
 const key='real-reward:integration:atomic';queue(key);
 db.exec("CREATE TRIGGER fail_delivery BEFORE UPDATE OF delivered_at ON notification_outbox WHEN NEW.event_key='real-reward:integration:atomic' AND NEW.delivered_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'test marker failure'); END");
 const log=console.error;console.error=()=>{};try{notify.retryOutbox();}finally{console.error=log;}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(key).n,0);
 assert.equal(db.prepare('SELECT delivered_at FROM notification_outbox WHERE event_key=?').get(key).delivered_at,null);
 db.exec('DROP TRIGGER fail_delivery');notify.replayOutbox({id:1,role:'admin'},key);rewards.flushNotifications();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(key).n,1);
});
test('readiness同时检查上游结构、旧教材补充与兑换幂等约束',()=>{
 assert.equal(readiness.assertReady(db),1029);
 db.exec('ALTER TABLE lesson_version_supplements RENAME TO missing_supplements');
 try{assert.throws(()=>readiness.assertReady(db));}finally{db.exec('ALTER TABLE missing_supplements RENAME TO lesson_version_supplements');}
 assert.equal(readiness.assertReady(db),1029);
});
