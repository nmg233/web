import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardStore } from '../src/student/rewardStore.js';
import { initialRewardState, validateRewardState, redeemReward, rewardSnapshot } from '../src/student/rewardModel.js';
import { rewardStorageKey, DEMO_REWARDS_CHANGED } from '../src/student/rewardEvents.js';
import { rewardDemoConfig } from '../src/student/rewardConfig.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const channel = () => ({ close() {} });
// Persistence, migration, abort and cross-tab ordering run against native IndexedDB in
// tests/round10-rewards.browser.test.js and the complete round8 browser suite.
test('奖励纯规则保持原数值和固定徽章', () => {
 assert.equal(rewardDemoConfig.initialPoints,120);
 assert.deepEqual(rewardDemoConfig.gifts.slice(0,3).map(({id,cost,stock,limit})=>[id,cost,stock,limit]),[['notebook',40,3,2],['model',160,2,1],['sticker',20,0,1]]);
 assert.deepEqual(rewardDemoConfig.badges.map(({id,earned})=>[id,earned]),[['record',true],['iterate',false]]);
});
test('v1 验证保留合法原值，不重新计算；损坏数据明确拒绝',()=>{
 const state=initialRewardState();redeemReward(state,'notebook','legacy');const original=structuredClone(state);
 assert.equal(validateRewardState(state),state);assert.deepEqual(state,original);
 for(const value of[null,{balance:-1,records:[],ledger:[]},{balance:120,records:[null],ledger:[]},{balance:120,records:[],ledger:[null]}])assert.throws(()=>validateRewardState(value),{code:'CORRUPT_DATA'});
});
test('同确认纯规则去重，条件拒绝不修改传入状态',()=>{
 const state=initialRewardState();const first=redeemReward(state,'notebook','same');assert.equal(first.changed,true);assert.equal(redeemReward(state,'notebook','same').changed,false);
 assert.equal(state.balance,80);assert.equal(state.records.length,1);assert.equal(state.ledger.length,2);
 for(const [gift,id]of[['model','low'],['sticker','empty']]){const before=structuredClone(state);assert.throws(()=>redeemReward(state,gift,id),{code:'RULE_BLOCKED'});assert.deepEqual(state,before);}
 redeemReward(state,'notebook','second');assert.throws(()=>redeemReward(state,'notebook','third'),/上限/);assert.equal(rewardSnapshot(state).gifts[0].remaining,1);
});
test('共享状态按账号和键订阅，focus / clear 同步，卸载清理且订阅不重复',async()=>{
 const target=new EventTarget();let reads=0,balance=120,closed=0;
 const store=createRewardStore({accountId:1,target,createChannel:()=>({close(){closed++;}}),adapter:{load:async()=>{reads++;return{balance};}}});
 const off1=store.subscribe(()=>{}),off2=store.subscribe(()=>{});await tick();assert.equal(reads,1);
 const storageEvent=key=>Object.assign(new Event('storage'),{key});
 target.dispatchEvent(storageEvent(rewardStorageKey(2)));target.dispatchEvent(new CustomEvent(DEMO_REWARDS_CHANGED,{detail:{accountId:2}}));await tick();assert.equal(reads,1);
 balance=80;target.dispatchEvent(storageEvent(rewardStorageKey(1)));await tick();assert.equal(store.getSnapshot().data.balance,80);
 balance=120;target.dispatchEvent(new Event('focus'));await tick();assert.equal(store.getSnapshot().data.balance,120);
 target.dispatchEvent(storageEvent(null));target.dispatchEvent(new CustomEvent(DEMO_REWARDS_CHANGED,{detail:{accountId:'1'}}));await tick();assert.equal(reads,5);
 off1();off2();target.dispatchEvent(new Event('focus'));target.dispatchEvent(storageEvent(null));await tick();assert.equal(reads,5);assert.equal(closed,1);
});
test('交错读取只接受最新快照；短暂故障保留列表但状态失效；卸载后迟到响应无效',async()=>{
 const target=new EventTarget(),pending=[];
 const store=createRewardStore({accountId:1,target,createChannel:channel,adapter:{load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}});
 const off=store.subscribe(()=>{});store.refresh();pending[1].resolve({balance:80,gifts:['current']});await tick();pending[0].resolve({balance:120,gifts:['stale']});await tick();assert.equal(store.getSnapshot().data.balance,80);
 store.refresh();pending[2].reject(Error('read failed'));await tick();assert.equal(store.getSnapshot().status,'error');assert.deepEqual(store.getSnapshot().data.gifts,['current']);
 store.refresh();off();pending[3].resolve({balance:0});await tick();assert.equal(store.getSnapshot().data.balance,80);
});
test('已提交操作后回读失败不改写结果；广播内容不能直接成为余额',async()=>{
 let fail=false;const signal={close(){}};
 const store=createRewardStore({accountId:1,target:new EventTarget(),createChannel:()=>signal,adapter:{load:async()=>{if(fail)throw Error('read');return{balance:120};},reset:async()=>{fail=true;return{balance:120};}}});
 const off=store.subscribe(()=>{});await tick();assert.deepEqual(await store.reset(),{balance:120});assert.equal(store.getSnapshot().status,'error');
 fail=false;signal.onmessage({data:{accountId:1,balance:999}});await tick();assert.equal(store.getSnapshot().data.balance,120);off();assert.equal(signal.onmessage,null);
});
