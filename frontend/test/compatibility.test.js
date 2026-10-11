import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceAction, taskGroups, learningPercent, replayDuration, courseReadError } from '../src/student/compatibilityModel.js';

test('来源只为已知类型和合法对象生成真实入口，卡片不能猜课时', () => {
  assert.deepEqual(sourceAction({type:'card',id:9},3),{href:'/courses/3',label:'查看课程地图'});
  assert.deepEqual(sourceAction({type:'task',id:9},3),{href:'/tasks/9',label:'查看任务'});
  assert.equal(sourceAction({type:'resource',id:null},3),null);
  assert.equal(sourceAction({type:'unknown',id:9},3),null);
  assert.equal(sourceAction({type:'lesson',id:9},'../else'),null);
});
test('任务以课程 ID 分组，缺失进度不变成零', () => {
  const groups=taskGroups([{id:1,course_id:2,course_title:'同名'},{id:2,course_id:3,course_title:'同名'}]);
  assert.equal(groups.length,2);assert.equal(learningPercent(null),null);assert.equal(learningPercent(''),null);
  assert.equal(learningPercent(0),0);assert.equal(learningPercent(100),100);assert.equal(learningPercent(101),null);
});
test('回放零值为空、课程实际 400 与临时错误分开', () => {
  assert.equal(replayDuration(0),'');assert.equal(replayDuration(null),'');assert.equal(replayDuration(65),'1 分 5 秒');
  assert.equal(courseReadError({response:{status:400,data:{error:'课程不存在'}}}),'课程不存在或已不可访问');
  assert.equal(courseReadError({response:{status:503}}),'课程暂时无法读取');
});
