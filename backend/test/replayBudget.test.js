const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');

test('视频上传预算限制并发、幂等释放、磁盘不足拒绝，文件系统异常向错误中间件传递',t=>{
 const uploadPath=require.resolve('../middleware/upload');
 const budgetPath=require.resolve('../middleware/replayBudget');
 const previous=require.cache[uploadPath];
 require.cache[uploadPath]={id:uploadPath,filename:uploadPath,loaded:true,exports:{UPLOAD_ROOT:'isolated-budget-fixture'}};
 delete require.cache[budgetPath];
 t.after(()=>{if(previous)require.cache[uploadPath]=previous;else delete require.cache[uploadPath];delete require.cache[budgetPath];});
 t.mock.method(fs,'mkdirSync',()=>{});
 let free=10_000_000_000n,fsError=null;
 t.mock.method(fs,'statfsSync',()=>{if(fsError)throw fsError;return {bavail:free,bsize:1n};});
 const budget=require('../middleware/replayBudget');
 function attempt(){const res=new EventEmitter();res.status=n=>{res.code=n;return res;};res.json=value=>{res.body=value;return res;};let nextCalls=0,error;budget({},res,e=>{nextCalls++;error=e;});return {res,nextCalls,error};}
 const open=Array.from({length:4},attempt);assert.ok(open.every(r=>r.nextCalls===1&&!r.error));assert.equal(attempt().res.code,429);
 open[0].res.emit('finish');open[0].res.emit('close');open[0].res.emit('finish');
 const replacement=attempt();assert.equal(replacement.nextCalls,1);assert.equal(attempt().res.code,429);
 for(const r of [...open.slice(1),replacement])r.res.emit('close');
 free=1n;assert.equal(attempt().res.code,507);
 free=10_000_000_000n;fsError=new Error('fixture statfs failure');assert.equal(attempt().error,fsError);
 fsError=null;const recovered=attempt();assert.equal(recovered.nextCalls,1);recovered.res.emit('finish');
});
