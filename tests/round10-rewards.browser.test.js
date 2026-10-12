import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { readRewardAccount, writeRewardAccount, watchRewardTransactions, holdRewardDatabase, releaseRewardDatabase, waitRewardWrite, failRewardPut, restoreRewardPut } from './helpers/rewardBrowser.mjs';
const root=path.resolve(import.meta.dirname,'..'),base='http://127.0.0.1:5192';
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Vite not ready');}
async function page(context){const p=await context.newPage();p.setDefaultTimeout(5000);await p.route(base+'/reward-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>隔离原生数据库测试</title>'}));await p.goto(base+'/reward-harness');return p;}
async function adapter(p,id){return p.evaluate(async id=>{const{createDemoRewardAdapter}=await import('/src/student/rewardAdapter.js');window.adapters??={};window.adapters[id]=createDemoRewardAdapter(()=>localStorage,id);return window.adapters[id].load();},id);}
async function operation(p,id,kind,request='test'){return p.evaluate(async({id,kind,request})=>{try{return{ok:true,value:await(kind==='redeem'?window.adapters[id].redeem('notebook',request):window.adapters[id][kind]())};}catch(e){return{ok:false,code:e.code,name:e.name};}},{id,kind,request});}
const legacy={balance:80,records:[{id:'legacy-request',giftId:'notebook',title:'探索笔记本（演示）',cost:40,time:'2026-01-02T03:04:00.000Z',status:'演示兑换成功（不发货）'}],ledger:[{id:'legacy-request',title:'演示兑换：探索笔记本（演示）',amount:-40,time:'2026-01-02T03:04:00.000Z'},{id:'initial',title:'演示初始积分（非真实发放）',amount:120,time:''}]};
function stateIs(record,balance,records,ledger){assert.equal(record.state.balance,balance);assert.equal(record.state.records.length,records);assert.equal(record.state.ledger.length,ledger);assert.equal(record.initialized,true);}
test('第十轮：原生 IndexedDB 迁移、提交与 120 组双标签压力验证',{timeout:240000},async t=>{
 mkdirSync(path.join(root,'test-results'),{recursive:true});
 const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5192','--strictPort'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:'pipe'});let browser;
 try{await ready();browser=await chromium.launch({channel:'msedge',headless:true});console.log('Browser:',browser.version());
  await t.test('原样迁移并保留 v1 备份；重置/重开不重导入；已迁移账号不再读取 v1',async()=>{
   const c=await browser.newContext(),a=await page(c);
   try{await a.evaluate(data=>{localStorage.setItem('star-voyage:rewards:demo:v1:1',JSON.stringify(data));localStorage.setItem('learning:draft:1','keep');},legacy);
    await adapter(a,1);assert.deepEqual((await readRewardAccount(a,1)).state,legacy);
    await a.evaluate(()=>{window.originalGet=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k.includes('rewards:demo:v1'))throw Error('no legacy access');return window.originalGet.call(this,k);};});
    assert.equal((await adapter(a,1)).balance,80);await operation(a,1,'reset');stateIs(await readRewardAccount(a,1),120,0,1);
    await a.reload();assert.equal((await adapter(a,1)).balance,120);const b=await page(c);assert.equal((await adapter(b,1)).balance,120);
    assert.deepEqual(await b.evaluate(()=>JSON.parse(localStorage.getItem('star-voyage:rewards:demo:v1:1'))),legacy);assert.equal(await b.evaluate(()=>localStorage.getItem('learning:draft:1')),'keep');
   }finally{await c.close();}
  });
  await t.test('并发首次迁移与兑换不覆盖已提交状态；并发同编号仅一笔；不同账号隔离',async()=>{
   const c=await browser.newContext(),a=await page(c),b=await page(c);
   try{await a.evaluate(data=>localStorage.setItem('star-voyage:rewards:demo:v1:2',JSON.stringify(data)),legacy);
    const first=async p=>p.evaluate(async()=>{const{createDemoRewardAdapter}=await import('/src/student/rewardAdapter.js');const ad=createDemoRewardAdapter(()=>localStorage,2);return ad.redeem('notebook','same-first');});
    const values=await Promise.all([first(a),first(b)]);assert.equal(values[0].id,values[1].id);stateIs(await readRewardAccount(a,2),40,2,3);
    await adapter(a,3);await operation(a,3,'redeem','other');await adapter(b,2);await operation(b,2,'reset');stateIs(await readRewardAccount(a,2),120,0,1);stateIs(await readRewardAccount(a,3),80,1,2);
   }finally{await c.close();}
  });
  await t.test('损坏/不可读迁移源不被覆盖；迁移 put 后中止无初始化标记；直接重置恢复',async()=>{
   const c=await browser.newContext(),a=await page(c);
   try{await a.evaluate(()=>localStorage.setItem('star-voyage:rewards:demo:v1:4','{bad'));
    await assert.rejects(adapter(a,4),/损坏/);assert.equal(await readRewardAccount(a,4),undefined);assert.equal(await a.evaluate(()=>localStorage.getItem('star-voyage:rewards:demo:v1:4')),'{bad');
    assert.equal((await operation(a,4,'reset')).ok,true);stateIs(await readRewardAccount(a,4),120,0,1);
    await writeRewardAccount(a,4,{revision:-7,state:{balance:12,records:[null],ledger:[]}});await assert.rejects(adapter(a,4),/损坏/);await operation(a,4,'reset');stateIs(await readRewardAccount(a,4),120,0,1);
    await a.evaluate(data=>localStorage.setItem('star-voyage:rewards:demo:v1:5',JSON.stringify(data)),legacy);await failRewardPut(a);await assert.rejects(adapter(a,5),/未提交/);assert.equal(await readRewardAccount(a,5),undefined);await restoreRewardPut(a);assert.equal((await adapter(a,5)).balance,80);
    const failures=await a.evaluate(async()=>{const{createDemoRewardAdapter}=await import('/src/student/rewardAdapter.js');const out=[];for(const source of[()=>{throw Error('getter');},{getItem(){throw Error('read');}}]){try{await createDemoRewardAdapter(source,6).load();}catch(e){out.push(e.code);}}return out;});assert.deepEqual(failures,['STORAGE_ACCESS','READ_FAILED']);assert.equal(await readRewardAccount(a,6),undefined);
   }finally{await c.close();}
  });
  await t.test('数据库不可用、open 失败及真实升级 blocked 均可重试，不虚构持久成功',async()=>{
   const c=await browser.newContext(),a=await page(c);
   try{const codes=await a.evaluate(async()=>{const{createDemoRewardAdapter}=await import('/src/student/rewardAdapter.js');const out=[];for(const factory of[()=>{throw Error('denied');},()=>({open(){throw Error('open');}})]){try{await createDemoRewardAdapter(()=>localStorage,7,{indexedDB:factory}).load();}catch(e){out.push(e.code);}}return out;});assert.deepEqual(codes,['DB_UNAVAILABLE','DB_OPEN']);
    const blocked=await a.evaluate(async()=>{const{openRewardDatabase}=await import('/src/student/rewardDatabase.js');const db=await openRewardDatabase(()=>indexedDB);db.onversionchange=null;window.blockingDb=db;try{await openRewardDatabase(()=>({open(name){return indexedDB.open(name,2);}}));}catch(e){return e.code;}});assert.equal(blocked,'DB_BLOCKED');await a.evaluate(()=>window.blockingDb.close());assert.equal((await adapter(a,7)).balance,120);
   }finally{await c.close();}
  });
  await t.test('提交后取消与回读/广播失败不撤销事实；广播只触发数据库重读',async()=>{
   const c=await browser.newContext(),a=await page(c),b=await page(c);
   try{await adapter(a,8);const result=await a.evaluate(async()=>{const controller=new AbortController();const r=await window.adapters[8].redeem('notebook','committed',{signal:controller.signal});controller.abort();return r;});assert.equal(result.id,'committed');stateIs(await readRewardAccount(a,8),80,1,2);
    await a.evaluate(()=>{window.realChannel=BroadcastChannel;window.BroadcastChannel=class{constructor(){throw Error('denied channel');}};});assert.equal((await operation(a,8,'reset')).ok,true);assert.match((await operation(a,8,'load')).value.syncWarning,/保存|已|刷新/);stateIs(await readRewardAccount(b,8),120,0,1);
    const ack=await a.evaluate(async()=>{const{createRewardStore}=await import('/src/student/rewardStore.js');let fail=false;const real=window.adapters[8],store=createRewardStore({accountId:8,target:window,createChannel:()=>null,adapter:{...real,load:()=>fail?Promise.reject(Error('post-commit read')):real.load(),redeem:async(...args)=>{const r=await real.redeem(...args);fail=true;return r;}}});const off=store.subscribe(()=>{});const record=await store.redeem('notebook','ack');const status=store.getSnapshot().status;off();return{record,status};});assert.equal(ack.record.id,'ack');assert.equal(ack.status,'error');stateIs(await readRewardAccount(b,8),80,1,2);
    await b.evaluate(async()=>{const{createDemoRewardAdapter}=await import('/src/student/rewardAdapter.js');const{createRewardStore}=await import('/src/student/rewardStore.js');window.store=createRewardStore({accountId:8,target:window,adapter:createDemoRewardAdapter(()=>localStorage,8)});window.off=window.store.subscribe(()=>{window.reads=(window.reads||0)+1;});});await b.waitForFunction(()=>window.store.getSnapshot().status==='ready');const reads=await b.evaluate(()=>window.reads);
    await a.evaluate(()=>{const channel=new window.realChannel('star-voyage-reward-changes-v2');channel.postMessage({accountId:'8',balance:999999});channel.close();});await b.waitForFunction(n=>window.reads>n,reads);assert.equal(await b.evaluate(()=>window.store.getSnapshot().data.balance),80);await b.evaluate(()=>window.off());
   }finally{await c.close();}
  });
  await t.test('下一版签到：同账号双标签同一天只加5，重置保留日期和待同步意图',async()=>{
   const c=await browser.newContext(),a=await page(c),b=await page(c);
   try{await Promise.all([adapter(a,81),adapter(b,81)]);const sign=(p,date)=>p.evaluate(date=>window.adapters[81].checkin({day:{date,expires:performance.now()+60000}}),date);
    const outcomes=await Promise.all([sign(a,'2026-10-08'),sign(b,'2026-10-08')]);assert.equal(outcomes.filter(r=>r.changed).length,1);stateIs(await readRewardAccount(a,81),125,0,2);
    await operation(a,81,'redeem','pending-stable');await operation(b,81,'reset');assert.deepEqual((await readRewardAccount(a,81)).meta.checkins,['2026-10-08']);assert.equal((await readRewardAccount(a,81)).meta.outbox[0].id,'pending-stable');assert.equal((await sign(a,'2026-10-08')).changed,false);
    assert.equal((await operation(a,81,'redeem','pending-stable')).ok,true);stateIs(await readRewardAccount(a,81),120,0,1);
    assert.equal((await sign(b,'2026-10-09')).changed,true);stateIs(await readRewardAccount(a,81),125,0,2);await a.reload();await adapter(a,81);assert.equal((await sign(a,'2026-10-09')).changed,false);
   }finally{await c.close();}
  });
  await t.test('下一版签到：排队跨午夜日期过期、事务中止、损坏意图均不虚报成功',async()=>{
   const c=await browser.newContext(),a=await page(c),b=await page(c);
   try{await adapter(a,82);await watchRewardTransactions(a);await holdRewardDatabase(b);const late=a.evaluate(async()=>{try{await window.adapters[82].checkin({day:{date:'2026-10-09',expires:performance.now()+30}});return 'wrong';}catch(e){return e.code;}});await waitRewardWrite(a);await a.waitForTimeout(70);await releaseRewardDatabase(b);assert.equal(await late,'DATE_EXPIRED');stateIs(await readRewardAccount(a,82),120,0,1);
    await failRewardPut(a);const failure=await a.evaluate(async()=>{try{await window.adapters[82].checkin({day:{date:'2026-10-09',expires:performance.now()+60000}});}catch(e){return e.code;}});assert.equal(failure,'WRITE_FAILED');await restoreRewardPut(a);stateIs(await readRewardAccount(a,82),120,0,1);assert.deepEqual((await readRewardAccount(a,82)).meta,undefined);
    await writeRewardAccount(a,82,{meta:{checkins:['2026-10-09'],outbox:[null]}});assert.equal((await operation(a,82,'reset')).code,'CORRUPT_DATA');assert.deepEqual((await readRewardAccount(a,82)).meta.outbox,[null]);
   }finally{await c.close();}
  });
  await t.test('120 组混合事务顺序，逐组读取两页持久状态，12 次新第三标签抽检',async()=>{
   const c=await browser.newContext(),a=await page(c),b=await page(c),failures=[],samples=[];
   const started=new Date().toISOString();
   try{for(let i=0;i<120;i++){
     const id=10000+i,type=i%3;let held=false;
     try{await Promise.all([adapter(a,id),adapter(b,id)]);if(type===2)assert.equal((await operation(a,id,'redeem','seed')).ok,true);
      await Promise.all([watchRewardTransactions(a),watchRewardTransactions(b)]);await holdRewardDatabase(b);held=true;
      let first,second;
      if(type===0){first=operation(a,id,'redeem','first');await waitRewardWrite(a);second=operation(b,id,'reset');await waitRewardWrite(b);}
      else if(type===1){first=operation(b,id,'reset');await waitRewardWrite(b);second=operation(a,id,'redeem','after-reset');await waitRewardWrite(a);}
      else{first=operation(a,id,'redeem','last-a');await waitRewardWrite(a);second=operation(b,id,'redeem','last-b');await waitRewardWrite(b);}
      await releaseRewardDatabase(b);held=false;const outcomes=await Promise.all([first,second]);
      if(type===2){assert.equal(outcomes.filter(x=>x.ok).length,1);assert.equal(outcomes.find(x=>!x.ok).code,'RULE_BLOCKED');}else assert.ok(outcomes.every(x=>x.ok));
      const expected=type===0?[120,0,1]:type===1?[80,1,2]:[40,2,3];
      for(const p of[a,b])stateIs(await readRewardAccount(p,id),...expected);
      if(i%10===9){const third=await page(c);try{const s=await adapter(third,id);assert.equal(s.balance,expected[0]);assert.equal(s.records.length,expected[1]);assert.equal(s.ledger.length,expected[2]);samples.push(i);}finally{await third.close();}}
     }catch(e){failures.push({group:i,type,error:e.message});if(held)await releaseRewardDatabase(b);}
    }
   }finally{const report={browser:browser.version(),started,finished:new Date().toISOString(),groups:120,thirdTabSamples:samples,failures};writeFileSync(path.join(root,'test-results/round10-reward-stress.json'),JSON.stringify(report,null,2)+'\n');console.log('Stress:',JSON.stringify(report));await c.close();}
   assert.deepEqual(failures,[]);
  });
 }finally{await browser?.close();vite.kill();}
});
