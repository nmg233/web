import test from 'node:test';import assert from 'node:assert/strict';
import {reviewQuery,changeReviewQuery,reviewScrollKey,readReviewScroll,saveReviewScroll} from '../src/utils/reviewQueueState.js';
test('评审URL只接收合法状态/正整数，课时必须带课程；修改筛选清掉页码及旧课时',()=>{
  assert.deepEqual(reviewQuery(new URLSearchParams('status=bad&course_id=1x&lesson_id=4&page=-1')),{status:'submitted',courseId:undefined,lessonId:undefined,page:1});
  const p=new URLSearchParams('status=rejected&course_id=4&lesson_id=8&page=3');assert.deepEqual(reviewQuery(p),{status:'rejected',courseId:'4',lessonId:'8',page:3});
  assert.equal(changeReviewQuery(p,'course_id','5').toString(),'status=rejected&course_id=5');assert.equal(changeReviewQuery(p,'page',4).get('lesson_id'),'8');assert.equal(changeReviewQuery(p,'status','approved').get('page'),null);
});
test('滚动位置按账号、状态、课程、课时和页码隔离；查询参数顺序不影响恢复',()=>{
  const a=new URLSearchParams('course_id=4&lesson_id=8&page=2&status=approved'),b=new URLSearchParams('status=approved&page=2&lesson_id=8&course_id=4');assert.equal(reviewScrollKey(1,a),reviewScrollKey(1,b));assert.notEqual(reviewScrollKey(1,a),reviewScrollKey(2,a));assert.notEqual(reviewScrollKey(1,a),reviewScrollKey(1,new URLSearchParams('course_id=5')));
  const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};saveReviewScroll(storage,'key',720);assert.equal(readReviewScroll(storage,'key'),720);saveReviewScroll(storage,'key',-2);assert.equal(readReviewScroll(storage,'key'),720);assert.equal(readReviewScroll({getItem:()=>'-4'},'key'),0);assert.equal(readReviewScroll({getItem:()=>{throw Error('blocked');}},'key'),0);assert.doesNotThrow(()=>saveReviewScroll({setItem:()=>{throw Error('blocked');}},'key',3));
});
