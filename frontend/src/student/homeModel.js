import {copyText as siteText} from "../content/systemText.js";
// 仅组织首页动作，不计算学习完成度，也不参与学习解锁。
// /tasks 的 status 是报告/学习汇总；作品必须读取独立的 review_status/work_id。
export function buildHomeTodos({ courses = [], courseDetails = [], tasks = [] }) {
  const allowedCourses = new Map(courses.map((course) => [String(course.id), course]));
  const tasksByLesson = new Map();
  for (const task of tasks) {
    if (!allowedCourses.has(String(task.course_id))) continue;
    const key = `${task.course_id}:${task.lesson_id}`;
    if (!tasksByLesson.has(key)) tasksByLesson.set(key, []);
    tasksByLesson.get(key).push(task);
  }

  const candidates = [];
  for (const detail of courseDetails) {
    const course = allowedCourses.get(String(detail.course.id));
    if (!course) continue;
    for (const lesson of detail.lessons || []) {
      if (lesson.status === 'cancelled') continue;
      const key = `${course.id}:${lesson.id}`;
      const lessonTasks = tasksByLesson.get(key) || [];
      // 所有任务的报告状态来自相同的 latest report 子查询。没有任务的课时没有此摘要。
      const reportStatus = lessonTasks[0]?.report_status;
      const learningProgress = Number(lesson.progress || 0);
      const href = `/courses/${course.id}/lessons/${lesson.id}/learn`;
      const base = {
        courseId: course.id, lessonId: lesson.id, courseTitle: course.title,
        lessonTitle: lesson.title, learningProgress, reportStatus,
      };
      if (reportStatus === 'rejected') {
        candidates.push({ ...base, id: `report:${key}`, kind: 'revise-report', action: siteText("site.300d3b6c9fc3baae"),
          title: lesson.title, href: `${href}?stage=2`, priority: 0,
          description: siteText("site.f2a36f380e3f11c7") });
      } else if (learningProgress < 100 && reportStatus !== 'submitted') {
        // 不能用 25/60/85 等百分比反推出卡片或报告状态；实际阶段由学习页的真实接口决定。
        candidates.push({ ...base, id: `learning:${key}`, kind: 'continue-learning', action: siteText("site.9c188ce5b4657073"),
          title: lesson.title, href, priority: learningProgress > 0 ? 1 : 3,
          description: reportStatus === 'approved'
            ? siteText("site.d4f74e1bdb3aed9d")
            : siteText("site.d11bc6476c7465b9") });
      }

      for (const task of lessonTasks) {
        const workBase = { ...base, taskId: task.id, title: task.title, deadline: task.deadline,
          workId: task.work_id, workStatus: task.review_status };
        if (task.review_status === 'rejected' && task.work_id) {
          candidates.push({ ...workBase, id: `work:${task.id}`, kind: 'revise-work', action: siteText("site.634734a90f952a91"),
            href: `/works/${task.work_id}`, priority: 0,
            description: siteText("site.d08e4a74a183fe3a") });
        } else if (!task.work_id) {
          candidates.push({ ...workBase, id: `work:${task.id}`, kind: 'submit-work', action: siteText("site.7c9fc54eb9d888ad"),
            href: `${href}?task_id=${task.id}#task-${task.id}`, priority: 2,
            description: siteText("site.e0bc728d19f51fea") });
        }
      }
    }
  }
  return candidates.sort((a, b) => a.priority - b.priority
    || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
}

export function filterCourses(courses, query) {
  const term = query.trim().toLocaleLowerCase();
  return courses.filter((course) => [course.title, course.description, course.theme]
    .some((text) => String(text || '').toLocaleLowerCase().includes(term)));
}

// start_at 来自排课表单（北京时间墙钟时间），不能按 UTC 再加 8 小时。
function scheduledTime(value) {
  if (!value) return NaN;
  const normalized = String(value).replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+08:00`);
}

export function nextScheduledLesson(courseDetails = [], now = Date.now()) {
  return courseDetails.flatMap((detail) => (detail.lessons || [])
    .filter((lesson) => lesson.status === 'scheduled' && scheduledTime(lesson.start_at) >= now - 60 * 60 * 1000)
    .map((lesson) => ({ ...lesson, courseId: detail.course.id, courseTitle: detail.course.title })))
    .sort((a, b) => scheduledTime(a.start_at) - scheduledTime(b.start_at))[0];
}
