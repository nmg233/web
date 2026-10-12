import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLessons, safeReturnTo, draftKey } from '../src/student/model.js';
import { createDemoRewardAdapter } from '../src/student/rewardAdapter.js';
import { initialRewardState, redeemReward } from '../src/student/rewardModel.js';
import { canRoleAccessPath, homeForRole } from '../src/utils/roleNavigation.js';


test('章节不会丢失未配置课时，不重复出现或自动解锁', () => {
  const lessons = [{ id: 1, progress: 0 }, { id: 2, progress: 60 }, { id: 3, progress: 100 }];
  const result = groupLessons(lessons, [{ title: '已确认分组', lessonIds: [2, 99] }, { title: '重复分组', lessonIds: [2] }]);
  assert.deepEqual(result.map((group) => group.lessons.map((lesson) => lesson.id)), [[2], [1, 3]]);
  assert.equal(result[0].lessons[0].progress, 60);
});
test('实验返回仅接受站内课程链接', () => {
  for (const url of ['//evil.test', 'https://evil.test', '/\\evil.test', 'javascript:alert(1)', '/courses/1%2f/evil', '/courses/1/../../login', '/courses/1\n']) assert.equal(safeReturnTo(url), '/lab', url);
  assert.equal(safeReturnTo('/courses/1/lessons/2/learn?stage=2#report'), '/courses/1/lessons/2/learn?stage=2#report');
});
test('草稿键按账号、课程、课时隔离', () => {
  assert.notEqual(draftKey(1, 2, 3), draftKey(2, 2, 3));
  assert.notEqual(draftKey(1, 2, 3), draftKey(1, 2, 4));
  assert.throws(() => draftKey(null, 2, 3));
});
test('学生新旧路由兼容，其他角色首页不变', () => {
  assert.equal(homeForRole('student'), '/explore');
  assert.equal(homeForRole('teacher'), '/observer');
  for (const path of ['/explore', '/lab', '/archives/rewards', '/dashboard', '/courses/1', '/tasks/2', '/works/3', '/notifications/4']) assert.ok(canRoleAccessPath('student', path));
  assert.equal(canRoleAccessPath('teacher', '/archives/rewards'), false);
  assert.equal(canRoleAccessPath('student', '/mentor/reviews'), false);
});
test('演示纯规则：扣减、幂等、明细及独立初始状态', () => {
  const a=initialRewardState(),b=initialRewardState();
  redeemReward(a,'notebook','request-1');redeemReward(a,'notebook','request-1');
  assert.equal(a.balance,80);assert.equal(a.records.length,1);assert.equal(a.ledger[0].amount,-40);assert.equal(b.balance,120);
  redeemReward(a,'notebook','request-2');assert.throws(()=>redeemReward(a,'notebook','request-3'),/上限/);
  assert.throws(()=>redeemReward(a,'model','request-4'),/还差/);assert.throws(()=>redeemReward(a,'sticker','request-5'),/库存/);assert.equal(a.balance,40);
});
test('数据库不可用不能静默回退到旧存储或内存成功', async () => {
  let reads=0;const adapter=createDemoRewardAdapter({getItem(){reads++;return null;}},1,{indexedDB:()=>{throw Error('denied');}});
  await assert.rejects(adapter.redeem('notebook','failure'),{code:'DB_UNAVAILABLE'});await assert.rejects(adapter.load(),{code:'DB_UNAVAILABLE'});assert.equal(reads,0);
});
