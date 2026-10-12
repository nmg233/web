import {copyText as siteText} from "../content/systemText.js";
// 展示层排序和分组不产生新的解锁条件或进度。
export function groupLessons(lessons, config = []) {
  const remaining = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
  const groups = config.map((group) => ({
    title: group.title,
    lessons: group.lessonIds.flatMap((id) => {
      const lesson = remaining.get(String(id));
      remaining.delete(String(id));
      return lesson ? [lesson] : [];
    }),
  })).filter((group) => group.lessons.length);
  if (remaining.size) groups.push({ title: config.length ? siteText("site.97936d292123886f") : siteText("site.73697a8c4ffb4eb3"), lessons: [...remaining.values()] });
  return groups;
}

export function safeReturnTo(value, fallback = '/lab') {
  if (typeof value !== 'string' || value.includes('\\') || [...value].some((char) => char.charCodeAt(0) <= 32) || /%2f|%5c/i.test(value)) return fallback;
  if (!/^\/courses\/\d+(?:\/lessons\/\d+\/learn|\/(?:learn|lab|glider|archives|reflection|assistant|tasks(?:\/\d+)?|works(?:\/(?:upload|\d+))?))?(?:[?#]|$)/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

export function draftKey(userId, courseId, lessonId) {
  if (!userId || !courseId || !lessonId) throw new Error(siteText("site.b3a0e5436646dbab"));
  return `star-voyage:report:v1:${userId}:${courseId}:${lessonId}`;
}
