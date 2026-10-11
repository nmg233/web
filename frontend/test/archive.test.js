import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentArchive, loadStudentArchive, reportSummary, scoreText, validEnrollments, workCounts, workStatus } from '../src/student/archiveModel.js';

const courses = [{ id: 10, title: '同名课程' }, { id: 20, title: '同名课程' }];
const enrollments = [{ enrollment_id: 1, course_id: 10 }, { enrollment_id: 2, course_id: 20 }];
const archive = () => ({ student: { id: 4 }, courses: [{ enrollment_id: 1 }, { enrollment_id: 2 }], works: [{ id: 11, student_id: 4, enrollment_id: 1, course_id: 10, version: 1, review_status: 'rejected' }, { id: 12, student_id: 4, enrollment_id: 1, course_id: 10, parent_work_id: 11, version: 2, review_status: 'rejected' }, { id: 13, student_id: 4, enrollment_id: 2, course_id: 20 }], reflections: [{ id: 1, enrollment_id: 1 }, { id: 2, enrollment_id: 2 }], evaluations: [{ id: 1, enrollment_id: 1, score: 0 }, { id: 2, enrollment_id: 2, score: null }], ability: { problem_discovery: 0, hands_on: null }, growthRecords: [] });
test('同名课程只按 ID 与有效报名关联，记录与统计共用展示集合', () => {
  const result = buildStudentArchive(archive(), courses.slice(0, 1), enrollments, 4);
  assert.equal(result.courses.length, 1); assert.equal(result.works.length, 2); assert.equal(result.reflections.length, 1); assert.equal(result.evaluations.length, 1);
  assert.deepEqual(result.counts, { courses: 1, projects: 1, iterations: 1, reflections: 1, evaluations: 1 });
  assert.equal(result.abilityAvailable, false);
  assert.equal(buildStudentArchive(archive(), courses, enrollments.slice(1), 4).works.length, 1);
  const bad = archive(); bad.works.push({ id: 30, enrollment_id: 1, course_id: 20 });
  assert.equal(buildStudentArchive(bad, courses, enrollments, 4).works.length, 3);
});
test('聚合必须与原作品集合一致；无评分与真实零分区分', () => {
  const result = buildStudentArchive(archive(), courses, enrollments, 4);
  assert.equal(result.abilityAvailable, true); assert.equal(scoreText(result.ability.problem_discovery), '0'); assert.equal(scoreText(result.ability.hands_on), '暂无评价');
  assert.equal(scoreText(undefined), '暂无评价');
  assert.throws(() => buildStudentArchive(archive(), courses, enrollments, 99), /归属/);
  assert.throws(() => validEnrollments(courses, undefined), /未能完整读取/);
});
test('历史退回显示已修改，最新退回保留修改入口；迭代不制造新项目', () => {
  const result = buildStudentArchive(archive(), courses, enrollments, 4);
  assert.equal(workStatus(result.works[0]).label, '已修改'); assert.equal(workStatus(result.works[0]).revisable, false);
  assert.equal(workStatus(result.works[1]).revisable, true);
  assert.deepEqual(workCounts(result.works), { projects: 2, iterations: 1 });
});
test('时间轴按 work_id 去除作品兜底，无关联系统记录隐藏，不猜标题时间', () => {
  const source = archive(); source.growthRecords = [{ id: 1, work_id: 11, description: '真实提交', event_type: 'system' }, { id: 2, work_id: 13, description: '撤回作品详情', event_type: 'system' }, { id: 3, description: '遗留作品文本', event_type: 'system' }, { id: 4, description: '个人观察', event_type: 'teacher', recorded_by: 2 }];
  const result = buildStudentArchive(source, courses.slice(0, 1), enrollments, 4);
  assert.equal(result.timeline.filter((item) => item.workId === 11).length, 1);
  assert.equal(result.timeline.filter((item) => item.workId === 13).length, 0);
  assert.equal(result.timeline.some((item) => item.text === '遗留作品文本'), false);
  assert.ok(result.timeline.some((item) => item.kind === '个人成长记录'));
  assert.equal(result.hiddenEvents, 1);
});
test('结束前重验课程及报名，撤回发生在读取期间也不能发布旧作品', async () => {
  let n = 0;
  const result = await loadStudentArchive({ courses: async () => ({ courses: ++n === 1 ? courses : courses.slice(1) }), enrollments: async () => ({ enrollments }), archive: async () => archive() }, 4);
  assert.equal(result.archive.works.length, 1); assert.equal(result.archive.works[0].id, 13);
});
test('归属请求失败拒绝展示；档案部分失败保留已核验课程并明确错误', async () => {
  await assert.rejects(loadStudentArchive({ courses: async () => ({ courses }), enrollments: async () => { throw Error('报名核验失败'); }, archive: async () => archive() }, 4), /报名核验失败/);
  const result = await loadStudentArchive({ courses: async () => ({ courses }), enrollments: async () => ({ enrollments }), archive: async () => { throw Error('断网'); } }, 4);
  assert.equal(result.archive, null); assert.ok(result.archiveError); assert.equal(result.courses.length, 2);
});
test('报告状态独立；无任务、未提交和未解锁不互相混同', () => {
  assert.equal(reportSummary({ progress: { report_unlocked: true }, consolidation_tasks: [] }).label, '尚未提交');
  assert.equal(reportSummary({ progress: { report_unlocked: false } }).label, '报告未解锁');
  assert.equal(reportSummary({ report: { status: 'approved', score: 0 }, consolidation_tasks: [{ work_status: 'rejected' }] }).label, '已通过');
  assert.equal(reportSummary({ report: { status: 'rejected', version: 2 } }).label, '需修改');
});
