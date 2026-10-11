const reportFields = ['summary', 'key_points', 'application', 'difficulties', 'next_plan'];
const reflectionFields = ['difficulty', 'solution', 'improvement', 'new_question'];

export function reportFormValues(report = {}, reflection = {}) {
  const values = Object.fromEntries(reportFields.map((key) => [key, typeof report?.[key] === 'string' ? report[key] : '']));
  values.reflection = Object.fromEntries(reflectionFields.map((key) => [key, typeof reflection?.[key] === 'string' ? reflection[key] : '']));
  return values;
}

export function reportDraftKey(userId, lessonId, reportId) {
  return `lesson-report-draft:${userId}:${lessonId}:${reportId ?? 'new'}`;
}

export function restoreReportDraft(storage, key, report, reflection) {
  const original = reportFormValues(report, reflection);
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return original;
    return reportFormValues({ ...original, ...saved }, { ...original.reflection, ...saved.reflection });
  } catch { return original; }
}

export function saveReportDraft(storage, key, values) {
  try {
    storage.setItem(key, JSON.stringify(reportFormValues(values, values.reflection)));
    return true;
  } catch { return false; }
}

export function clearReportDraft(storage, key) {
  try { storage.removeItem(key); } catch { /* 提交已成功，存储不可用不能阻断页面刷新。 */ }
}
