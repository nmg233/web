import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeTodos, nextScheduledLesson, filterCourses } from '../src/student/homeModel.js';
import { loadExploreHome } from '../src/student/homeData.js';

const courses = [{ id: 1, title: '测试课程' }];
const lesson = { id: 10, title: '测试课时', status: 'scheduled', progress: 0, sort_order: 0 };
const details = (lessons = [lesson]) => [{ course: courses[0], lessons }];
const task = { id: 101, course_id: 1, lesson_id: 10, title: '测试作品任务', work_id: 50, review_status: 'rejected' };
const todos = (tasks, lessons = [lesson]) => buildHomeTodos({ courses, courseDetails: details(lessons), tasks });

test('报告通过或待评审时，最新作品退回仍提供独立修改入口', () => {
  for (const report_status of ['approved', 'submitted']) {
    const result = todos([{ ...task, report_status, status: report_status === 'approved' ? 'completed' : 'submitted' }], [{ ...lesson, progress: report_status === 'approved' ? 100 : 85 }]);
    assert.equal(result[0].kind, 'revise-work');
    assert.equal(result[0].action, '修改作品');
    assert.equal(result[0].href, '/works/50');
    assert.equal(result[0].reportStatus, report_status);
    assert.equal(result[0].workStatus, 'rejected');
  }
});

test('没有作品任务的未完成课时仍可继续，摘要不猜测报告或卡片状态', () => {
  const result = todos([], [{ ...lesson, progress: 35 }, { ...lesson, id: 11, progress: 85 }, { ...lesson, id: 12, progress: 100 }]);
  assert.deepEqual(result.map((item) => item.lessonId), [10, 11]);
  assert.ok(result.every((item) => item.kind === 'continue-learning' && item.reportStatus === undefined));
  assert.equal(result[0].href, '/courses/1/lessons/10/learn');
});

test('同课时多个任务只产生一个继续学习，报告退回也只产生一个修改报告', () => {
  const tasks = [101, 102].map((id) => ({ ...task, id, review_status: 'approved', report_status: null }));
  assert.equal(todos(tasks).filter((item) => item.kind === 'continue-learning').length, 1);
  const revised = todos(tasks.map((item) => ({ ...item, report_status: 'rejected' })));
  assert.equal(revised.filter((item) => item.kind === 'revise-report').length, 1);
  assert.equal(revised.filter((item) => item.kind === 'continue-learning').length, 0);
  assert.equal(revised[0].href, '/courses/1/lessons/10/learn?stage=2');
});

test('作品与报告保持独立，修改报告和修改作品均可到达', () => {
  const result = todos([{ ...task, report_status: 'rejected' }]);
  assert.deepEqual(new Set(result.map((item) => item.kind)), new Set(['revise-report', 'revise-work']));
  assert.equal(todos([{ ...task, report_status: 'approved', review_status: 'approved' }], [{ ...lesson, progress: 100 }]).length, 0);
  assert.equal(todos([{ ...task, report_status: 'submitted', review_status: 'pending' }], [{ ...lesson, progress: 85 }]).length, 0);
});

test('报告通过不会覆盖服务端仍未完成的课时学习进度', () => {
  const result = todos([{ ...task, report_status: 'approved', review_status: 'approved', status: 'completed' }], [{ ...lesson, progress: 70 }]);
  assert.equal(result[0].kind, 'continue-learning');
  assert.equal(result[0].learningProgress, 70);
  assert.equal(result[0].reportStatus, 'approved');
});

test('未提交作品提供任务位置入口，不从课时进度推断作品已完成', () => {
  const result = todos([{ ...task, work_id: null, review_status: null, report_status: 'approved' }], [{ ...lesson, progress: 100 }]);
  assert.equal(result[0].action, '提交作品');
  assert.equal(result[0].href, '/courses/1/lessons/10/learn?task_id=101#task-101');
});

test('取消的课时、已失效课程及没有课时摘要的任务不会回流到首页', () => {
  assert.equal(todos([task], [{ ...lesson, status: 'cancelled' }]).length, 0);
  assert.equal(buildHomeTodos({ courses: [], courseDetails: details(), tasks: [task] }).length, 0);
  assert.equal(buildHomeTodos({ courses, courseDetails: [], tasks: [task] }).length, 0);
});

test('摘要加载限制课程请求并发，且不请求任何完整课时内容', async () => {
  let active = 0;
  let maximum = 0;
  const calls = [];
  const courseList = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, title: `课程 ${index + 1}` }));
  const data = await loadExploreHome({
    courseAPI: {
      list: async () => ({ courses: courseList }),
      detail: async (id) => {
        calls.push(id); active += 1; maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { course: courseList[id - 1], lessons: [{ ...lesson, id }] };
      },
    },
    taskAPI: { list: async () => ({ tasks: [] }) },
    learningAPI: { lesson: () => { throw new Error('首页不应加载完整课时内容'); } },
  });
  assert.equal(data.courseDetails.length, 8);
  assert.equal(calls.length, 8);
  assert.equal(maximum, 3);
});

test('课程在列表和详情请求之间撤回时清除该课程，其他课程仍保留', async () => {
  const data = await loadExploreHome({
    courseAPI: {
      list: async () => ({ courses: [...courses, { id: 2, title: '仍可学习' }] }),
      detail: async (id) => {
        if (id === 1) throw { response: { status: 404, data: { error: '课程不存在' } } };
        return { course: { id }, lessons: [{ ...lesson, id: 20 }] };
      },
    },
    taskAPI: { list: async () => ({ tasks: [task] }) },
  });
  assert.deepEqual(data.courses.map((course) => course.id), [2]);
  assert.deepEqual(data.tasks, []);
  assert.equal(data.warnings.length, 1);
});

test('任务摘要失败保留已确认课时继续学习，并明确提示待办未完整加载', async () => {
  const data = await loadExploreHome({
    courseAPI: { list: async () => ({ courses }), detail: async () => details()[0] },
    taskAPI: { list: async () => { throw new Error('network'); } },
  });
  assert.equal(data.warnings.length, 1);
  assert.equal(buildHomeTodos(data)[0].kind, 'continue-learning');
});

test('课程搜索不改变分配关系，下一节课排除取消/过期场次并使用北京时间', () => {
  const visible = [{ id: 1, title: '飞行课程', theme: '工程' }, { id: 2, title: '生态课程' }];
  assert.deepEqual(filterCourses(visible, ' 工程 ').map((course) => course.id), [1]);
  assert.equal(visible.length, 2);
  const next = nextScheduledLesson(details([
    { ...lesson, id: 9, start_at: '2026-10-03T07:00' },
    { ...lesson, id: 10, start_at: '2026-10-03T09:00', status: 'cancelled' },
    { ...lesson, id: 11, start_at: '2026-10-03T10:00' },
    { ...lesson, id: 12, start_at: '2026-10-03T11:00' },
  ]), Date.parse('2026-10-03T09:30:00+08:00'));
  assert.equal(next.id, 11);
});
