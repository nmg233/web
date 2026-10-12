import test from 'node:test';
import assert from 'node:assert/strict';
import { accessCheckForError, currentAccessTarget, removedCourseIds, shouldRefreshCourses } from '../src/student/accessPolicy.js';

const error = (url, status = 404, data = { error: '附件不存在' }, config = {}) => ({ config: { url, ...config }, response: { status, data } });

test('附件 404 只产生重验请求；模拟文件、通知、反馈错误不影响课程页', () => {
  const check = accessCheckForError(error('/courses/resources/15/download'));
  assert.equal(check.path, '/courses/resources/15/download');
  assert.equal(check.courseId, undefined);
  assert.equal(check.reason, '附件不存在');
  for (const url of ['/glider/simulations/1/files/summary.json', '/glider/simulations/1/trace', '/feedback/attachments/3', '/notifications/9']) {
    assert.equal(accessCheckForError(error(url)), null);
  }
});

test('权限复核不会递归派发；登录与强制改密沿用独立全局处理', () => {
  assert.equal(accessCheckForError(error('/courses/1', 403, {}, { studentAccessProbe: true })), null);
  assert.equal(accessCheckForError(error('/learning/lessons/1', 401)), null);
  assert.equal(accessCheckForError(error('/learning/lessons/1', 403, { code: 'FORCE_RESET' })), null);
  assert.equal(accessCheckForError(error('/courses/1', 500)), null);
});

test('课程、课时、作品和卡片错误按真实请求对象分类，状态不作完成判定', () => {
  assert.equal(accessCheckForError(error('/api/courses/12')).courseId, '12');
  assert.equal(accessCheckForError(error('/learning/lessons/21/report', 403)).lessonId, '21');
  assert.equal(accessCheckForError(error('/works/10/download', 403)).workId, '10');
  assert.equal(accessCheckForError(error('/tasks/42', 403)).taskId, '42');
  assert.ok(accessCheckForError(error('/learning/cards/7/complete', 403)));
});

test('实验来源失效不会变成实验页失效；阶段与卡片查询不会重设页面身份', () => {
  assert.equal(currentAccessTarget('/glider', '?course_id=1&lesson_id=2').endpoint, null);
  assert.deepEqual(currentAccessTarget('/courses/1/lessons/2/learn', '?stage=1&card=12'), {
    key: '/courses/1/lessons/2/learn', courseId: '1', endpoint: '/course-spaces/1/learning/lessons/2',
  });
  assert.equal(currentAccessTarget('/courses/1/lessons/2/learn', '?stage=2').key,
    currentAccessTarget('/courses/1/lessons/2/learn', '?stage=1&card=12').key);
  assert.equal(currentAccessTarget('/works/upload', '?task_id=9&parent_work_id=10').endpoint, '/tasks/9');
  assert.equal(currentAccessTarget('/works/10').endpoint, '/works/10');
});

test('只有移除的课程触发其页面刷新，更新时间和其他课程变化不清空表单', () => {
  const previous = [{ id: 1, updated_at: 'old' }, { id: 2 }];
  const next = [{ id: 1, updated_at: 'new' }, { id: 3 }];
  const detail = { removedCourseIds: removedCourseIds(previous, next), courses: next };
  assert.deepEqual(detail.removedCourseIds, ['2']);
  assert.equal(shouldRefreshCourses(detail, 1), false);
  assert.equal(shouldRefreshCourses(detail, 2), true);
  assert.equal(shouldRefreshCourses(detail), true);
  assert.deepEqual(removedCourseIds([{ id: 1, updated_at: 'old' }], [{ id: '1', updated_at: 'new' }]), []);
});
