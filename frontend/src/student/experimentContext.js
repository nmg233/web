import {copyText as siteText} from "../content/systemText.js";
import { safeReturnTo } from './model.js';

export function learningStage(data) {
  if (!data?.progress?.review_completed) return 0;
  if (!data.progress.cards_done) return 1;
  if (!data.report || data.report.status === 'rejected') return 2;
  return 3;
}

// 沿用原学习页的卡片顺序规则，不增加跨课时门槛。
export function availableCardIndex(cards, cardId, progress) {
  const index = cards.findIndex((card) => String(card.id) === String(cardId));
  return progress?.review_completed && index >= 0 && (index === 0 || cards[index - 1].completed) ? index : -1;
}

export function learningReturnPath({ courseId, lessonId, stage, cardId }) {
  const path = `/courses/${courseId}${lessonId ? `/lessons/${lessonId}/learn` : ''}`;
  const params = new URLSearchParams();
  if (lessonId && Number.isInteger(stage) && stage >= 0 && stage <= 3) params.set('stage', String(stage));
  if (lessonId && stage === 1 && cardId) params.set('cardId', String(cardId));
  return safeReturnTo(`${path}${params.size ? `?${params}` : ''}`);
}

export function associatedExperimentLink(context, experiment = 'glider') {
  if (experiment !== 'glider') return '/lab';
  const params = new URLSearchParams({ course_id: String(context.courseId), returnTo: learningReturnPath(context) });
  if (context.lessonId) params.set('lesson_id', String(context.lessonId));
  return `/courses/${context.courseId}/glider?${params}`;
}

function denied(error) {
  return [403, 404].includes(error?.response?.status);
}

// 只在进入关联实验 / 返回时读取来源。首页不请求完整学习包。
export async function resolveExperimentReturn(context, api) {
  const { courseId, lessonId } = context;
  const fallback = (path, reason, detail = null) => ({ path, reason, detail, available: false });
  if (!courseId || !/^\d+$/.test(String(courseId))) return fallback('/explore', context.returnTo ? siteText("site.3926c7afbd214c30") : '');
  let detail;
  try { detail = await api.course(courseId); }
  catch (error) {
    return fallback('/explore', denied(error) ? siteText("site.c4132ee2bbd85aab") : siteText("site.2d658c8a56609fad"));
  }
  const mapPath = `/courses/${courseId}`;
  const safePath = safeReturnTo(context.returnTo || learningReturnPath({ courseId, lessonId }), '');
  if (!safePath) return fallback(mapPath, siteText("site.883c31b2574378d4"), detail);
  const url = new URL(safePath, 'https://local.invalid');
  const match = url.pathname.match(/^\/courses\/(\d+)(?:\/lessons\/(\d+)\/learn|\/lab)?$/);
  if (!match || match[1] !== String(courseId) || (lessonId ? match[2] !== String(lessonId) : Boolean(match[2]))) {
    return fallback(mapPath, siteText("site.ca486b14a36c12ec"), detail);
  }
  if (!lessonId) return { path: url.pathname.endsWith('/lab') ? mapPath+'/lab' : mapPath, available: true, detail, reason: '' };
  if (!(detail.lessons || []).some((lesson) => String(lesson.id) === String(lessonId) && lesson.status !== 'cancelled')) {
    return fallback(mapPath, siteText("site.3b7e6f3c0b837eb0"), detail);
  }
  let payload;
  try { payload = await api.lesson(lessonId); }
  catch (error) {
    if (denied(error)) {
      // 课时接口失败可能是课程刚撤回；重新确认后再决定能否返回地图。
      try { detail = await api.course(courseId); }
      catch { return fallback('/explore', siteText("site.73a3fd04b83b4178")); }
    }
    return fallback(mapPath, denied(error) ? siteText("site.3b7e6f3c0b837eb0") : siteText("site.9cf25451a24e82a5"), detail);
  }
  if (String(payload.course?.id) !== String(courseId) || String(payload.lesson?.id) !== String(lessonId)) {
    return fallback(mapPath, siteText("site.658a2be1edbb9b45"), detail);
  }
  const stage = url.searchParams.has('stage') ? Number(url.searchParams.get('stage')) : learningStage(payload);
  if (!Number.isInteger(stage) || stage < 0 || stage > learningStage(payload)) {
    return fallback(mapPath, siteText("site.fd16bda9118c02e8"), detail);
  }
  const cardId = url.searchParams.get('cardId');
  if(Array.isArray(detail.experiments)&&!detail.experiments.some(item=>item.experiment==='glider'&&String(item.lessonId)===String(lessonId)&&(item.stage==null||item.stage===stage)&&(item.cardId==null||String(item.cardId)===String(cardId)))){
    return fallback(mapPath,siteText("site.27a09c018221fe52"),detail);
  }
  if (cardId && (stage !== 1 || availableCardIndex(payload.cards || [], cardId, payload.progress) < 0)) {
    return fallback(mapPath, siteText("site.904e5c5daca21431"), detail);
  }
  return { path: learningReturnPath({ courseId, lessonId, stage, cardId }), available: true, detail, payload, reason: '' };
}
