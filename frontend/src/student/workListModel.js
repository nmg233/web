// 列表 DTO 没有 course_id：按已授权课程逐批查询，以查询归属标记数据，不能按标题匹配。
export async function loadStudentWorks(api, { search = '', courseId } = {}) {
  const initial = (await api.courses()).courses || [];
  const selected = courseId != null && courseId !== '';
  const targets = selected ? initial.filter((course) => String(course.id) === String(courseId)) : initial;
  const batches = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
    while (cursor < targets.length) {
      const course = targets[cursor++];
      const result = await api.works({ search, course_id: course.id });
      batches.push({ courseId: course.id, works: result.works || [] });
    }
  }));
  // 查询期间也可能撤回/移除报名；发布结果前再读一次授权摘要。
  const courses = targets.length ? (await api.courses()).courses || [] : initial;
  const allowed = new Set(courses.map((course) => String(course.id)));
  const works = [...new Map(batches.filter((batch) => allowed.has(String(batch.courseId)))
    .flatMap((batch) => batch.works).map((work) => [work.id, work])).values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  const tasks = courses.length ? (await api.tasks()).tasks || [] : [];
  return { courses, works, tasks, filterInvalid: selected && !allowed.has(String(courseId)) };
}
