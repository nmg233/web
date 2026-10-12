import {copyText as siteText, copyTemplate as siteTemplate} from "../content/systemText.js";
// 仅建立学生展示范围。服务端仍须补齐课程授权，不能以此替代接口权限。
const key = (value) => String(value);
const list = (value, name) => {
  if (!Array.isArray(value)) throw new Error(siteTemplate("site.73f5965f169dec23", {slot0: (name)}));
  return value;
};
export const scoreText = (value) => value == null || value === '' ? siteText("site.3188a17414ed8a7e") : String(value);
export const workDimensions = [['problem_discovery', '问题发现'], ['solution_design', '方案设计'], ['hands_on', '动手操作'], ['data_analysis', '数据分析'], ['presentation', '表达展示']];
export function workStatus(work) {
  if (work.review_status === 'rejected' && work.has_newer_version) return { label: siteText("site.9b9a2408e4780d10"), tone: 'neutral', revisable: false };
  return ({ approved: { label: siteText("site.2b12b3bd7cb9df2a"), tone: 'success' }, pending: { label: siteText("site.524b30587b5c504e"), tone: 'current' }, rejected: { label: siteText("site.a5b10e8f9852365f"), tone: 'warning', revisable: true } })[work.review_status] || { label: siteText("site.0b79b091e3605014"), tone: 'neutral' };
}
export function workCounts(works) {
  return { projects: new Set(works.map((work) => key(work.parent_work_id || work.id))).size, iterations: works.filter((work) => work.parent_work_id).length };
}
export function validEnrollments(courses, enrollments) {
  const ids = new Set(list(courses, siteText("site.b4aacec790d99c82")).map((course) => key(course.id)));
  return list(enrollments, siteText("site.637de26214e439e0")).filter((row) => ids.has(key(row.course_id)));
}

export function buildStudentArchive(archive, courses, enrollments, studentId) {
  if (key(archive.student?.id) !== key(studentId)) throw new Error(siteText("site.d8480409fb3f3af6"));
  const mapping = new Map(validEnrollments(courses, enrollments).map((row) => [key(row.enrollment_id), row]));
  const courseMap = new Map(courses.map((course) => [key(course.id), course]));
  const courseFor = (row) => {
    const enrollment = mapping.get(key(row.enrollment_id));
    if (!enrollment || (row.course_id != null && key(row.course_id) !== key(enrollment.course_id))) return null;
    if (row.student_id != null && key(row.student_id) !== key(studentId)) return null;
    return courseMap.get(key(enrollment.course_id));
  };
  const filter = (rows, name) => list(rows, name).flatMap((row) => {
    const course = courseFor(row);
    return course ? [{ ...row, course_id: course.id, course_title: course.title }] : [];
  });
  const visibleCourses = filter(archive.courses, siteText("site.dbc17c073f7ca8f2"));
  const rawWorks = list(archive.works, siteText("site.a9f2f6d621ccf4e0"));
  const works = filter(rawWorks, siteText("site.a9f2f6d621ccf4e0"));
  // 档案 DTO 没有 has_newer_version；只在同一真实版本根内比较版本号。
  const latest = new Map();
  works.forEach((work) => latest.set(key(work.parent_work_id || work.id), Math.max(latest.get(key(work.parent_work_id || work.id)) || 0, work.version || 1)));
  works.forEach((work) => { work.has_newer_version = latest.get(key(work.parent_work_id || work.id)) > (work.version || 1); });
  const reflections = filter(archive.reflections, siteText("site.11c1393834274716"));
  const evaluations = filter(archive.evaluations, siteText("site.4df0f89832b20a64"));
  const workIds = new Set(works.map((work) => key(work.id)));
  const growth = list(archive.growthRecords, siteText("site.40c8c9a4076e6f7c"));
  const events = growth.filter((record) => record.work_id != null ? workIds.has(key(record.work_id)) : record.event_type === 'teacher' && record.recorded_by != null);
  const timeline = [
    ...events.map((record) => ({ id: `event-${record.id}`, at: record.created_at, text: record.description, kind: record.work_id != null ? siteText("site.a9f2f6d621ccf4e0") : siteText("site.815a1a8f2dd27344"), recorder: record.recorder_name, workId: record.work_id })),
    ...works.filter((work) => !events.some((record) => key(record.work_id) === key(work.id))).map((work) => ({ id: `work-${work.id}`, at: work.created_at, text: siteTemplate("site.3ff5518041cc776b", {slot0: (work.title), slot1: (work.version || 1)}), kind: siteText("site.389eea802ed7dbfe"), workId: work.id })),
    ...reflections.map((row) => ({ id: `reflection-${row.id}`, at: row.created_at, text: row.lesson_title || row.course_title, kind: row.report_id ? siteText("site.8921d4ae8b74a517") : siteText("site.da64363b8ec61e75"), reflection: row })),
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return { ...archive, courses: visibleCourses, works, reflections, evaluations, timeline,
    abilityAvailable: rawWorks.length === works.length,
    hiddenEvents: growth.filter((record) => record.work_id == null && !(record.event_type === 'teacher' && record.recorded_by != null)).length,
    counts: { courses: visibleCourses.length, ...workCounts(works), reflections: reflections.length, evaluations: evaluations.length } };
}

export async function loadArchiveScope(api) {
  const [courses, mapping] = await Promise.all([api.courses(), api.enrollments()]);
  return { courses: list(courses.courses, siteText("site.b4aacec790d99c82")), enrollments: validEnrollments(courses.courses, mapping.enrollments) };
}

export async function loadStudentArchive(api, studentId) {
  // 最多三个并发摘要请求。归属失败拒绝发布；档案失败仍可浏览已核验课程。
  const [scopeResult, archiveResult] = await Promise.allSettled([loadArchiveScope(api), api.archive(studentId)]);
  if (scopeResult.status === 'rejected') throw scopeResult.reason;
  const scope = await loadArchiveScope(api); // 防止读取期间撤回或换报名后的迟到结果。
  if (archiveResult.status === 'rejected') return { ...scope, archive: null, archiveError: archiveResult.reason.response?.data?.error || siteText("site.c692bee54279ae8e") };
  return { ...scope, archive: buildStudentArchive(archiveResult.value, scope.courses, scope.enrollments, studentId), archiveError: '' };
}

export function reportSummary(payload) {
  const report = payload.report;
  if (report) return { label: ({ draft: siteText("site.56ad2c721b8841c8"), submitted: siteText("site.c706a1efa7cb4d51"), approved: siteText("site.e7e8453a498e046c"), rejected: siteText("site.2ab89efd911a3715") })[report.status] || siteText("site.0b79b091e3605014"), tone: report.status === 'approved' ? 'success' : report.status === 'rejected' ? 'warning' : 'current', report };
  return { label: payload.progress?.report_unlocked ? siteText("site.fd833ed1fce64089") : siteText("site.07755ae7e37e50a2"), tone: 'neutral', report: null };
}
