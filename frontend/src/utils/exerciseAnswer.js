export function exerciseAnswer(value, options = []) {
  if (value === null || value === undefined) return '未作答';
  const labels = new Map(options.map((o) => typeof o === 'object' && o ? [o.value ?? o.key, o.label ?? o.text] : [o,o]));
  const text = (v) => v === true ? '正确' : v === false ? '错误' : labels.get(v) ?? String(v);
  if (value?.blanks) return value.blanks.map((group,i) => `第 ${i + 1} 空：${group.map(text).join(' / ')}`).join('；');
  return Array.isArray(value) ? value.map(text).join('、') : text(value);
}
