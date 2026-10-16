import {copyText as siteText} from "../content/systemText.js";
export const validId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
export function sourceAction(source, courseId) {
  if (!validId(source.id) || !validId(courseId)) return null;
  if (source.type === 'resource') return { download: true };
  if (source.type === 'task') return { href: `/tasks/${source.id}`, label: siteText("site.04070f94dbd1aea8")};
  if (['course', 'lesson', 'card'].includes(source.type)) return { href: `/courses/${courseId}`, label: siteText("site.6f8a296bbc69dd5c")};
  return null;
}
export const sourceTypes = { get resource(){return siteText("site.72580f0e1b8c5a24")}, get task(){return siteText("site.12905f2c2f2f631f")}, get course(){return siteText("site.cfa0082ddc897314")}, get lesson(){return siteText("site.f8f53436b10210e2")}, get card(){return siteText("site.5852d43924b2e8b6")} };
export const scopeLabels = { get core(){return siteText("site.f0a452ae02128642")}, get extension(){return siteText("site.f59a05eafcdd536e")}, get unrelated(){return siteText("site.d24f329d0f54b32a")} };
export const taskLabels = { get pending(){return siteText("site.d51a9088b5cef6b2")}, get in_progress(){return siteText("site.190e2ec42eadeddc")}, get submitted(){return siteText("site.7b852746ce6ef8cc")}, get completed(){return siteText("site.4774134a09fbb0f6")} };
export const reportLabels = { get draft(){return siteText("site.b3338cf69714e63d")}, get submitted(){return siteText("site.c50832d2197dc3b0")}, get approved(){return siteText("site.ed8e5c644ef3cd85")}, get rejected(){return siteText("site.53a13ea741868fd1")} };
export function taskGroups(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const id = String(task.course_id);
    if (!groups.has(id)) groups.set(id, { id, title: task.course_title, tasks: [] });
    groups.get(id).tasks.push(task);
  }
  return [...groups.values()];
}
export function learningPercent(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
export function replayDuration(value) {
  const n = Math.floor(Number(value));
  return n > 0 ? `${Math.floor(n / 60)} 分 ${n % 60} 秒` : '';
}
export function courseReadError(error) {
  return [403, 404].includes(error?.response?.status) || (error?.response?.status === 400 && error?.response?.data?.error === '课程不存在')
    ? siteText("site.f995c7841fa138d8") : siteText("site.c52dd33e5275bcb5");
}
