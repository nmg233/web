// 创建与编辑共用校验，避免 UI 校验被绕过后写入无效教学数据。
function validateTeachingInput(data, kind, current = {}) {
  if (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 200)) return '名称需要 1–200 个非空字符';
  if (data.description != null && (typeof data.description !== 'string' || data.description.length > 10000)) return '说明不能超过 10000 个字符';
  const dates = kind === 'lesson' ? ['start_at', 'end_at'] : ['deadline'];
  for (const field of dates) if (data[field] && !Number.isFinite(Date.parse(data[field]))) return '时间格式无效';
  if (kind === 'lesson') {
    const start = data.start_at === undefined ? current.start_at : data.start_at;
    const end = data.end_at === undefined ? current.end_at : data.end_at;
    if (start && end && Date.parse(end) <= Date.parse(start)) return '结束时间必须晚于开始时间';
    if (data.duration != null && data.duration !== '' && (!Number.isFinite(Number(data.duration)) || Number(data.duration) <= 0 || Number(data.duration) > 10000)) return '课时时长需要大于 0 且不超过 10000 分钟';
  } else if (data.task_type !== undefined && !['inquiry', 'experiment', 'reflection', 'creation', 'presentation'].includes(data.task_type)) return '任务类型无效';
  return null;
}
module.exports = { validateTeachingInput };
