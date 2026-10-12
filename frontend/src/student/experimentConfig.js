import {copyText as siteText} from "../content/systemText.js";
// 正式关联须由课程团队确认。实验室自由使用不依赖此配置。
export const EXPERIMENT_ASSOCIATIONS = [];
export const V2_TEST_ASSOCIATIONS = [
 {id:'v2-test-card-glider',experiment:'glider',courseId:9001,lessonId:90011,stage:1,cardId:900112,label:siteText("site.e1237541aac6e7ed"),testOnly:true},
];

// 仅自动化测试 / 明确开启的本地测试页面使用，不代表正式教学内容。
export const TEST_EXPERIMENT_ASSOCIATIONS = [
  { id: 'test-course-glider', experiment: 'glider', courseId: 1, label: siteText("site.e1237541aac6e7ed"), testOnly: true },
  { id: 'test-card-glider', experiment: 'glider', courseId: 1, lessonId: 1, stage: 1, cardId: 2, label: siteText("site.e1237541aac6e7ed"), testOnly: true },
];

export function associatedExperiments(context, config = EXPERIMENT_ASSOCIATIONS) {
  return config.filter((item) => String(item.courseId) === String(context.courseId)
    && String(item.lessonId ?? '') === String(context.lessonId ?? '')
    && (item.stage == null || Number(item.stage) === Number(context.stage))
    && (item.cardId == null || String(item.cardId) === String(context.cardId)));
}

export function configuredExperiments(testMode = false, sampleMode = false) {
  return [...EXPERIMENT_ASSOCIATIONS, ...(testMode ? TEST_EXPERIMENT_ASSOCIATIONS : []), ...(sampleMode ? V2_TEST_ASSOCIATIONS : [])];
}
