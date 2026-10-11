import test from 'node:test';
import assert from 'node:assert/strict';
import { associatedExperiments, configuredExperiments, TEST_EXPERIMENT_ASSOCIATIONS } from '../src/student/experimentConfig.js';
import { associatedExperimentLink, availableCardIndex, resolveExperimentReturn } from '../src/student/experimentContext.js';

const detail = { course: { id: 1 }, lessons: [{ id: 11, status: 'active' }] };
const payload = { course: { id: 1 }, lesson: { id: 11 }, progress: { review_completed: true, cards_done: false }, cards: [{ id: 101, completed: true }, { id: 102, completed: false }] };
const context = { courseId: '1', lessonId: '11', returnTo: '/courses/1/lessons/11/learn?stage=1&cardId=102' };
const denied = () => { throw { response: { status: 404 } }; };

test('正式配置不自动关联滑翔机；测试绑定精确到指定课程、课时、阶段、卡片', () => {
  assert.deepEqual(configuredExperiments(), []);
  assert.equal(associatedExperiments({ courseId: 1 }, configuredExperiments(true)).length, 1);
  assert.equal(associatedExperiments({ courseId: 1, lessonId: 1, stage: 1, cardId: 2 }, TEST_EXPERIMENT_ASSOCIATIONS).length, 1);
  for (const wrongContext of [{ courseId: 1, lessonId: 2 }, { courseId: 1, lessonId: 1, stage: 0, cardId: 2 }, { courseId: 1, lessonId: 1, stage: 1, cardId: 1 }, { courseId: 2 }]) {
    assert.equal(associatedExperiments(wrongContext, configuredExperiments(true)).length, 0);
  }
});

test('实验入口保存真实卡片ID，返回重新核验并恢复学习阶段和卡片', async () => {
  const link = new URL(associatedExperimentLink({ courseId: 1, lessonId: 11, stage: 1, cardId: 102 }), 'https://local.invalid');
  assert.equal(link.searchParams.get('returnTo'), context.returnTo);
  const reads = [];
  const result = await resolveExperimentReturn(context, { course: async (id) => { reads.push(['course', id]); return detail; }, lesson: async (id) => { reads.push(['lesson', id]); return payload; } });
  assert.equal(result.available, true);
  assert.equal(result.path, context.returnTo);
  assert.deepEqual(reads, [['course', '1'], ['lesson', '11']]);
});

test('来源卡片下架或重新未解锁时回退可访问课程地图', async () => {
  for (const cards of [[payload.cards[0]], [{ ...payload.cards[0], completed: false }, payload.cards[1]]]) {
    const result = await resolveExperimentReturn(context, { course: async () => detail, lesson: async () => ({ ...payload, cards }) });
    assert.equal(result.available, false);
    assert.equal(result.path, '/courses/1');
    assert.match(result.reason, /知识卡片/);
  }
  assert.equal(availableCardIndex(payload.cards, 102, { review_completed: false }), -1);
});

test('课时取消回退课程地图，课程撤回回退课程选择', async () => {
  const lessonRemoved = await resolveExperimentReturn(context, { course: async () => ({ ...detail, lessons: [] }), lesson: async () => assert.fail('取消课时不读取学习包') });
  assert.equal(lessonRemoved.path, '/courses/1');
  const courseRemoved = await resolveExperimentReturn(context, { course: denied, lesson: async () => assert.fail('撤回课程不读取学习包') });
  assert.equal(courseRemoved.path, '/explore');
  assert.match(courseRemoved.reason, /撤回/);
});

test('学习包请求期间课程撤回时再次确认，避免回到失效地图', async () => {
  let reads = 0;
  const result = await resolveExperimentReturn(context, { course: async () => { if (++reads === 1) return detail; return denied(); }, lesson: denied });
  assert.equal(result.path, '/explore');
  assert.equal(reads, 2);
});

test('返回地址不能跨站、跨课程、跨课时，也不能跳到未解锁阶段', async () => {
  for (const returnTo of ['https://example.com', '//example.com', '/courses/2/lessons/11/learn', '/courses/1/lessons/22/learn', '/courses/1/lessons/11/learn?stage=3']) {
    const result = await resolveExperimentReturn({ ...context, returnTo }, { course: async () => detail, lesson: async () => payload });
    assert.equal(result.available, false);
    assert.equal(result.path, '/courses/1');
  }
});

test('无课程旧实验入口引导课程选择，网络失败明确说明无法核验', async () => {
  const independent = await resolveExperimentReturn({}, { course: () => assert.fail('独立实验不得自动关联课程') });
  assert.equal(independent.path, '/explore');
  const offline = await resolveExperimentReturn(context, { course: async () => { throw new Error('offline'); } });
  assert.equal(offline.path, '/explore');
  assert.match(offline.reason, /暂时无法确认/);
});
