import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayRecoveryKey,readReplayRecovery,saveReplayRecovery,clearReplayRecovery} from '../src/utils/replayRecovery.js';
test('上传结果恢复按账号、课程、课时隔离，原请求键幂等保存和清除',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const key=replayRecoveryKey(1,2,3),row={token:'original',fingerprint:'same-file',name:'视频.webm'};
 assert.equal(saveReplayRecovery(storage,key,row),true);
 saveReplayRecovery(storage,key,{...row,title:'原说明'});
 assert.equal(readReplayRecovery(storage,key).length,1);
 for(const args of [[2,2,3],[1,3,3],[1,2,4]])assert.deepEqual(readReplayRecovery(storage,replayRecoveryKey(...args)),[]);
 clearReplayRecovery(storage,key,'unrelated');assert.equal(readReplayRecovery(storage,key).length,1);
 clearReplayRecovery(storage,key,'original');assert.equal(map.has(key),false);
});
test('损坏或拒绝存储不伪造上传成功，恢复记录有界',()=>{
 const storage={getItem:()=>'{broken',setItem:()=>{throw Error('denied');}};
 assert.deepEqual(readReplayRecovery(storage,'key'),[]);assert.equal(saveReplayRecovery(storage,'key',{token:'t',fingerprint:'f'}),false);
 let raw='[]';const working={getItem:()=>raw,setItem:(_k,v)=>{raw=v;}};
 for(let i=0;i<25;i++)saveReplayRecovery(working,'key',{token:String(i),fingerprint:'f'});
 assert.equal(readReplayRecovery(working,'key').length,20);assert.equal(readReplayRecovery(working,'key')[0].token,'5');
});
