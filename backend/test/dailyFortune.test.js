const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
process.env.DB_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pbl-fortune-')),'test.db');process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='test';
const {dailyFortune,VERSION,goodPairs}=require('../services/dailyFortune'),app=require('../app'),db=require('../config/database');
let server,url;const tokens={};
before(async()=>{
 const hash=require('bcryptjs').hashSync('test123',4);for(const[id,role]of[[1,'student'],[2,'student'],[3,'teacher']])db.prepare('INSERT INTO users(id,username,password_hash,real_name,role) VALUES(?,?,?,?,?)').run(id,'u'+id,hash,'合成账号'+id,role);
 await new Promise(resolve=>server=app.listen(0,resolve));url='http://127.0.0.1:'+server.address().port;
 server.keepAliveTimeout=60000; // The 51,200-case synchronous sweep exceeds Node's default idle timeout.
 for(const id of[1,2,3])tokens[id]=(await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'u'+id,password:'test123'})}).then(r=>r.json())).token;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
const get=(id,suffix='')=>fetch(url+'/api/account/daily-fortune'+suffix,{headers:id?{Authorization:'Bearer '+tokens[id]}:{}});
const catalog=require('../../shared/fortunePool.json'),goodIds=catalog.good.map(id=>id.slice('fortune.good.'.length)),avoidIds=catalog.avoid.map(id=>id.slice('fortune.avoid.'.length));
const combination = ({level,art,good,avoid}) => ({level,art,good,avoid});
test('已知 12 月 6/7 日碰撞：比较展示组合，不用日期差异冒充刷新',()=>{
 assert.notDeepEqual(combination(dailyFortune(4,new Date('2026-12-06T00:00:00Z'))),combination(dailyFortune(4,new Date('2026-12-07T00:00:00Z'))));
});
test('64 个账号连续 800 日：相邻完整组合不同，宜项和枚举受控',()=>{
 for(let id=1;id<=64;id++){
  let previous;const cycle=new Set();
  for(let day=0;day<800;day++){
   const result=dailyFortune(id,new Date(Date.UTC(2025,0,1)+day*86400000));
   if(previous){assert.notDeepEqual(combination(result),combination(previous),`account ${id}, ${result.date}`);assert.notDeepEqual([...result.good].sort(),[...previous.good].sort());assert.notDeepEqual(result.avoid,previous.avoid);assert.ok(result.good.every(item=>!previous.good.includes(item)));}
   if(day<720)cycle.add(JSON.stringify(combination(result)));
   assert.ok(['great','lucky','small','steady'].includes(result.level));assert.ok(['fortune-plane','fortune-star','fortune-device'].includes(result.art));
   assert.equal(new Set(result.good).size,2);assert.ok(result.good.every(v=>goodIds.includes(v)));assert.ok(result.avoid.every(v=>avoidIds.includes(v)));previous=result;
  }
  assert.equal(cycle.size,720,`account ${id}: first 720 display combinations are distinct`);
 }
});
test('跨年、闰日、北京时间午夜、跳过多天均按服务端日期重新派生',()=>{
 for(const [a,b] of [['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2028-02-29','2028-03-01']]){
  const first=dailyFortune(4,new Date(a+'T15:59:59Z')),next=dailyFortune(4,new Date(a+'T16:00:00Z'));
  assert.equal(first.date,a);assert.equal(next.date,b);assert.notDeepEqual(combination(first),combination(next));
 }
 const jumped=dailyFortune(4,new Date('2027-01-09T00:00:00Z'));assert.equal(jumped.date,'2027-01-09');assert.deepEqual(jumped,dailyFortune(4,new Date('2027-01-08T16:00:00Z')));
});
test('独立 Node 进程重启结果一致，不依赖缓存',()=>{
 const {execFileSync}=require('node:child_process');
 const code="console.log(JSON.stringify(require('./services/dailyFortune').dailyFortune(4,new Date('2026-12-07T00:00:00Z'))))";
 const run=()=>JSON.parse(execFileSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true}));
 assert.deepEqual(run(),run());assert.deepEqual(run(),dailyFortune(4,new Date('2026-12-07T00:00:00Z')));
});
test('北京时间午夜切日，账号和日期稳定派生，受控枚举无重复宜',()=>{
 const beforeMidnight=dailyFortune(1,new Date('2026-10-07T15:59:59Z')),afterMidnight=dailyFortune(1,new Date('2026-10-07T16:00:00Z'));
 assert.equal(beforeMidnight.date,'2026-10-07');assert.equal(afterMidnight.date,'2026-10-08');assert.equal(beforeMidnight.nextUpdateAt,'2026-10-07T16:00:00.000Z');
 assert.deepEqual(beforeMidnight,dailyFortune(1,new Date('2026-10-07T00:00:00Z')));assert.equal(beforeMidnight.version,VERSION);assert.equal(new Set(beforeMidnight.good).size,2);
 assert.notDeepEqual(beforeMidnight,dailyFortune(2,new Date('2026-10-07T15:59:59Z')));
});
test('同账号新 token/跨客户端固定结果，认证账号隔离，读取不写业务表',async()=>{
 const counts=()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>[name,db.prepare('SELECT count(*) n FROM "'+name+'"').get().n]);
 const original=counts(),first=await get(1);assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');const result=await first.json();
 const again=await get(1);assert.deepEqual(await again.json(),result);assert.deepEqual(await(await get(2)).json(),dailyFortune(2));assert.deepEqual(counts(),original);
});
test('指定他人/课程/日期被拒绝，未登录和维护角色不能读取',async()=>{
 for(const query of ['?userId=2','?courseId=1','?date=2026-01-01','?student_id=2'])assert.equal((await get(1,query)).status,400);
 assert.equal((await get()).status,401);assert.equal((await get(3)).status,403);
});
test('强制改密、停用和失效 token 沿用全局认证边界',async()=>{
 db.prepare('UPDATE users SET force_reset_password=1 WHERE id=1').run();assert.equal((await(await get(1)).json()).code,'FORCE_RESET');
 db.prepare('UPDATE users SET force_reset_password=0,is_active=0 WHERE id=1').run();assert.equal((await get(1)).status,401);
 tokens[1]='expired-token';assert.equal((await get(1)).status,401);
});

test('各30条受控候选，435个宜组合完整且循环边界也不重复昨日条目',()=>{assert.equal(goodIds.length,30);assert.equal(avoidIds.length,30);for(const seed of [1,7,500,0xffffffff]){const pairs=goodPairs(seed);assert.equal(pairs.length,435);assert.equal(new Set(pairs.map(p=>[...p].sort().join('|'))).size,435);for(let i=0;i<pairs.length;i++)assert.ok(pairs[i].every(item=>!pairs[(i+1)%pairs.length].includes(item)));}});
