export async function readRewardAccount(page, id = 4) {
  return page.evaluate(async id => {
    const {openRewardDatabase,REWARD_STORE}=await import('/src/student/rewardDatabase.js');
    const db=await openRewardDatabase(()=>indexedDB);
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(REWARD_STORE,'readonly'),r=tx.objectStore(REWARD_STORE).get(String(id));let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  },id);
}
export async function writeRewardAccount(page, id, patch) {
  await page.evaluate(async({id,patch})=>{
    const{openRewardDatabase,REWARD_STORE}=await import('/src/student/rewardDatabase.js');const db=await openRewardDatabase(()=>indexedDB);
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(REWARD_STORE,'readwrite'),store=tx.objectStore(REWARD_STORE),r=store.get(String(id));r.onsuccess=()=>store.put({...r.result,...patch,accountId:String(id)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  },{id,patch});
}
export async function watchRewardTransactions(page) {
  await page.evaluate(()=>{
    window.rewardWritesCreated=0;
    if(window.originalRewardTransaction)return;
    window.originalRewardTransaction=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(names,mode,...rest){
      const tx=window.originalRewardTransaction.call(this,names,mode,...rest);
      if(this.name==='star-voyage-rewards'&&mode==='readwrite'&&!window.creatingRewardHold)window.rewardWritesCreated++;
      return tx;
    };
  });
}
export async function holdRewardDatabase(page) {
  await page.evaluate(async()=>{
    const{openRewardDatabase,REWARD_STORE}=await import('/src/student/rewardDatabase.js');const db=await openRewardDatabase(()=>indexedDB);
    window.creatingRewardHold=true;const tx=db.transaction(REWARD_STORE,'readwrite');window.creatingRewardHold=false;
    window.rewardHoldReady=false;window.releaseRewardHold=false;
    window.rewardHoldDone=new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};});
    const keepActive=()=>{const r=tx.objectStore(REWARD_STORE).get('__test_hold__');r.onsuccess=()=>{window.rewardHoldReady=true;if(!window.releaseRewardHold)keepActive();};};keepActive();
  });
  await page.waitForFunction(()=>window.rewardHoldReady);
}
export async function releaseRewardDatabase(page) {
  await page.evaluate(()=>{window.releaseRewardHold=true;return window.rewardHoldDone;});
}
export async function waitRewardWrite(page, count=1) {
  await page.waitForFunction(count=>window.rewardWritesCreated>=count,count);
}
export async function failRewardPut(page) {
  await page.evaluate(()=>{
    window.rewardOriginalPut=IDBObjectStore.prototype.put;window.rewardAttemptIds=[];
    IDBObjectStore.prototype.put=function(value,...rest){
      if(this.name==='accounts'&&this.transaction.db.name==='star-voyage-rewards'){
        window.rewardAttemptIds.push(value.state?.records?.[0]?.id);
        const request=window.rewardOriginalPut.call(this,value,...rest);
        request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;
      }
      return window.rewardOriginalPut.call(this,value,...rest);
    };
  });
}
export async function restoreRewardPut(page) { await page.evaluate(()=>{IDBObjectStore.prototype.put=window.rewardOriginalPut;}); }
