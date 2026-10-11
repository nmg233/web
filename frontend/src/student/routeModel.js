import {copyText as siteText} from "../content/systemText.js";
import { groupLessons } from './model.js';

export function buildCourseRoute(lessons, groups = [], persistedChapterOrder = false) {
  let ordered = [...lessons].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || Number(a.id) - Number(b.id));
  // Real chapter order organizes the map; IDs/progress and backend gates stay intact.
  if(persistedChapterOrder){const taken=new Set(),rows=[];for(const group of groups)for(const lesson of ordered)if(group.lessonIds.includes(lesson.id)&&!taken.has(lesson.id)){rows.push(lesson);taken.add(lesson.id);}ordered=[...rows,...ordered.filter(l=>!taken.has(l.id))];}
  const membership = new Map();
  groupLessons(ordered, groups).forEach((group, index) => {
    group.lessons.forEach((lesson) => membership.set(String(lesson.id), { title: group.title, groupIndex: index }));
  });
  // 章节配置可能不连续。按真实顺序切成连续区域，不能把中间课时挪到路线末尾。
  const route = [];
  ordered.forEach((lesson, index) => {
    const group = membership.get(String(lesson.id));
    if (route.at(-1)?.groupIndex !== group.groupIndex) {
      route.push({ ...group, key: `${group.groupIndex}:${lesson.id}`, lessons: [] });
    }
    route.at(-1).lessons.push({ ...lesson, routeNumber: index + 1 });
  });
  return route;
}

export function currentLesson(lessons, requestedId) {
  const available = [...lessons].filter((lesson) => lesson.status !== 'cancelled')
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || Number(a.id) - Number(b.id));
  return available.find((lesson) => String(lesson.id) === String(requestedId))
    || available.find((lesson) => Number(lesson.progress) > 0 && Number(lesson.progress) < 100)
    || available.find((lesson) => Number(lesson.progress || 0) < 100)
    || null;
}

// 原排课字段来自 datetime-local，保留教师录入的墙上时间，不擅自加八小时。
export function scheduleTime(value) {
  return typeof value === 'string' && value.trim() ? value.replace('T', ' ') : siteText("site.a1a656a94c873794");
}
