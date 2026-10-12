import {copyText as siteText} from "../content/systemText.js";
// HTTP 状态只说明这次请求失败。它不能单独证明整个学生账号或课程失效。
export const STUDENT_ACCESS_CHECK = 'student-access-check';
export const STUDENT_COURSES_CHANGED = 'student-courses-changed';

function pathOf(url = '') {
  try { return new URL(url, 'https://local.invalid').pathname.replace(/^\/api(?=\/)/, ''); }
  catch { return ''; }
}

export function accessCheckForError(error) {
  const { config = {}, response } = error;
  if (config.studentAccessProbe || ![403, 404].includes(response?.status)
    || response.data?.code === 'FORCE_RESET') return null;
  const raw = pathOf(config.url);
  const scoped = raw.match(/^\/course-spaces\/(\d+)(\/.*)$/);
  const path = scoped ? scoped[2] : raw;
  if (scoped) return { path:raw, courseId:scoped[1], reason:response.data?.error };
  const courseId = path.match(/^\/courses\/(\d+)(?:\/|$)/)?.[1];
  const lessonId = path.match(/^\/learning\/lessons\/(\d+)(?:\/|$)/)?.[1];
  const workId = path.match(/^\/works\/(\d+)(?:\/|$)/)?.[1];
  const taskId = path.match(/^\/tasks\/(\d+)(?:\/|$)/)?.[1];
  // 附件接口会用同一个 404 隐藏“文件缺失”和“无权访问”，须重验所属页面，
  // 不能据此清掉报告表单。模拟结果、通知、反馈则由其自身组件处理。
  const needsCourseCheck = courseId || lessonId || workId || taskId
    || /^\/courses\/(resources|replays)\//.test(path)
    || /^\/learning\/(cards|exercises)\//.test(path)
    || path === '/works' || path === '/dashboard/ai/ask' || path === '/archives/reflection';
  if (!needsCourseCheck) return null;
  return { path, courseId, lessonId, workId, taskId,
    reason: response.data?.error || response.data?.message || siteText("site.0d4cc45af4f9744d") };
}

// 返回当前页面真实依赖的对象；与实验的来源课程无关，/glider 不属于课程页面。
export function currentAccessTarget(pathname, search = '') {
  const params = new URLSearchParams(search);
  const lesson = pathname.match(/^\/courses\/(\d+)\/lessons\/(\d+)\/learn\/?$/);
  if (lesson) return { key: pathname, courseId: lesson[1], endpoint: `/course-spaces/${lesson[1]}/learning/lessons/${lesson[2]}` };
  const course = pathname.match(/^\/courses\/(\d+)(?:\/learn)?\/?$/);
  if (course) return { key: pathname, courseId: course[1], endpoint: `/courses/${course[1]}` };
  const space = pathname.match(/^\/courses\/(\d+)\/(.*)$/);
  if (space) {
    const object=space[2].match(/^(works|tasks)\/(\d+)$/);
    const endpoint=object?'/course-spaces/'+space[1]+'/'+object[0]:'/courses/'+space[1];
    return {key:pathname,courseId:space[1],endpoint};
  }
  const object = pathname.match(/^\/(works|tasks)\/(\d+)\/?$/);
  if (object) return { key: pathname, endpoint: `/${object[1]}/${object[2]}` };
  if (pathname === '/works/upload' && /^\d+$/.test(params.get('task_id') || '')) {
    return { key: `${pathname}?task_id=${params.get('task_id')}`, endpoint: `/tasks/${params.get('task_id')}` };
  }
  return { key: pathname, endpoint: null };
}

export function removedCourseIds(previous, next) {
  const available = new Set(next.map((course) => String(course.id)));
  return previous.filter((course) => !available.has(String(course.id))).map((course) => String(course.id));
}

export function shouldRefreshCourses(event, courseId) {
  if (courseId !== undefined && courseId !== null) {
    return event.removedCourseIds?.some((id) => String(id) === String(courseId)) || false;
  }
  return true;
}
