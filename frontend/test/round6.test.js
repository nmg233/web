import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStudentWorks } from '../src/student/workListModel.js';
import { flightMetrics } from '../src/pages/glider/gliderModel.js';

test('作品按可访问课程 ID 查询，重名无影响；并发最多3、去重、搜索透传', async () => {
  const courses = Array.from({length:7}, (_,i)=>({id:i+1,title:'同名课程'}));
  let running=0, peak=0; const calls=[];
  const data = await loadStudentWorks({ courses:async()=>({courses}), tasks:async()=>({tasks:[]}), works:async(query)=>{
    calls.push(query); peak=Math.max(peak,++running); await new Promise(r=>setTimeout(r,3)); running--;
    return { works:[{id:query.course_id,created_at:'2026-10-03'}, {id:99,created_at:'2026-10-02'}] };
  } }, {search:'作品'});
  assert.equal(peak,3); assert.equal(data.works.length,8);
  assert.deepEqual(calls.map(c=>c.course_id).sort((a,b)=>a-b),[1,2,3,4,5,6,7]);
  assert.ok(calls.every(c=>c.search==='作品'));
});
test('列表加载途中课程撤回，已返回作品也被丢弃', async () => {
  let n=0;
  const data=await loadStudentWorks({courses:async()=>({courses:++n===1?[{id:1}]:[]}),works:async()=>({works:[{id:1}]}),tasks:async()=>{throw new Error('不应读取');}});
  assert.deepEqual(data.works,[]); assert.deepEqual(data.tasks,[]);
});
test('无有效课程/失效筛选不发起无限定作品查询，错误不伪装为空', async () => {
  const api={courses:async()=>({courses:[{id:1}]}),works:async()=>{throw new Error('读取失败');},tasks:async()=>({tasks:[]})};
  const filtered=await loadStudentWorks(api,{courseId:2});
  assert.equal(filtered.filterInvalid,true); assert.deepEqual(filtered.works,[]);
  assert.deepEqual((await loadStudentWorks({...api,courses:async()=>({courses:[]})})).works,[]);
  await assert.rejects(()=>loadStudentWorks(api),/读取失败/);
});
test('指标缺失显示破折号，真实零值保留',()=>{
  const metrics=flightMetrics({glide_time_s:null,result:{alt_end:0,mean_speed_mps:0}});
  assert.equal(metrics[0].value,'—'); assert.equal(metrics[1].value,'—');
  assert.equal(metrics[4].value,0); assert.equal(metrics[5].value,0);
});
