import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visiblePolling} from './visiblePolling.js';
import {returnContext} from './returnContext.js';
function harness(){
 const document=new EventTarget(),window=new EventTarget(),timers=new Map();document.hidden=false;let time=0,id=0;
 return {document,window,timers,now:()=>time,setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key),advance:n=>time+=n,
 async tick(){const fn=timers.values().next().value;timers.clear();await fn?.();},visibility(hidden){document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));}};
}
test('hidden pages cancel timers, resume once; focus and visibility do not overlap in-flight work',async()=>{
 const h=harness();let calls=0,finish;const stop=visiblePolling({...h,run:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=h.tick();assert.equal(calls,1);h.advance(2000);h.window.dispatchEvent(new Event('focus'));assert.equal(calls,1);
 h.visibility(true);finish();await pending;assert.equal(h.timers.size,0);h.visibility(false);assert.equal(calls,2);finish();await Promise.resolve();
 h.visibility(true);assert.equal(h.timers.size,0);h.advance(10000);h.window.dispatchEvent(new Event('focus'));assert.equal(calls,2);
 h.visibility(false);assert.equal(calls,3);finish();await Promise.resolve();stop();assert.equal(h.timers.size,0);h.advance(5000);h.window.dispatchEvent(new Event('focus'));assert.equal(calls,3);
});
test('rejected reads remain retryable and cleanup removes scheduled work',async()=>{
 const h=harness();let calls=0;const stop=visiblePolling({...h,run:async()=>{calls++;throw Error('offline');}});await h.tick();assert.equal(h.timers.size,1);await h.tick();assert.equal(calls,2);stop();assert.equal(h.timers.size,0);
});
test('return context preserves desk and request filters while rejecting external or malformed paths',()=>{
 for(const url of ['/dashboard?category=reports&page=2','/admin/organization?section=requests&status=pending','/mentor/requests?kind=school&application=12'])assert.equal(returnContext(url,'/fallback'),url);
 for(const url of ['https://outside.test','//outside.test','/\\outside.test','/dashboard\n','/dashboard/evil','/student/course/2'])assert.equal(returnContext(url,'/fallback'),'/fallback');
});
