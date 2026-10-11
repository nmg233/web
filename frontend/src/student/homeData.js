import {copyText as siteText} from "../content/systemText.js";
const COURSE_CONCURRENCY = 3;

async function settleCourseDetails(courses, detail) {
  const results = new Array(courses.length);
  let cursor = 0;
  async function worker() {
    while (cursor < courses.length) {
      const index = cursor++;
      try { results[index] = { status: 'fulfilled', value: await detail(courses[index].id) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(COURSE_CONCURRENCY, courses.length) }, worker));
  return results;
}

function inaccessibleCourse(error) {
  const status = error.response?.status;
  return status === 403 || status === 404
    || (status === 400 && error.response?.data?.error === '课程不存在');
}

// 注入现有 API，便于验证请求范围和并发。不加载 /learning/lessons/:id 完整内容。
export async function loadExploreHome({ courseAPI, taskAPI }) {
  const [courseResult, taskResult] = await Promise.allSettled([courseAPI.list(), taskAPI.list()]);
  if (courseResult.status === 'rejected') throw courseResult.reason;
  const listed = courseResult.value.courses || [];
  const warnings = [];
  if (taskResult.status === 'rejected') warnings.push(siteText("site.51ec868473526871"));
  const results = await settleCourseDetails(listed, (id) => courseAPI.detail(id));
  const courseDetails = [];
  const courses = [];
  results.forEach((result, index) => {
    const course = listed[index];
    if (result.status === 'fulfilled') {
      courses.push(course);
      courseDetails.push(result.value);
    } else if (inaccessibleCourse(result.reason)) {
      warnings.push(siteText("site.08d32c9fb7b826ae"));
    } else {
      courses.push(course);
      warnings.push(`《${course.title}》的课时安排与待办未能加载，请重试或进入课程重新加载。`);
    }
  });
  const available = new Set(courseDetails.map((detail) => String(detail.course.id)));
  const tasks = taskResult.status === 'fulfilled'
    ? (taskResult.value.tasks || []).filter((task) => available.has(String(task.course_id))) : [];
  return { courses, courseDetails, tasks, warnings };
}
