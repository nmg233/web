export const questionTypes = { single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题', fill_blank: '填空题', short_answer: '简答题' };
export function questionForm(exercise) {
  const blanks = exercise.answer?.blanks || (Array.isArray(exercise.answer) ? [exercise.answer] : [[exercise.answer ?? '']]);
  return { ...exercise, options: (exercise.options || []).map((o, i) => typeof o === 'object'
    ? { label: o.label ?? o.text, value: o.value ?? o.key ?? String(i) } : { label: o, value: o }),
  blanks: blanks.map((accepted) => accepted.join('\n')) };
}
export function questionPayload(values) {
  const { blanks, ...fields } = values;
  const choice = ['single_choice', 'multiple_choice'].includes(values.question_type);
  return { ...fields, options: choice ? values.options : [],
    answer: values.question_type === 'fill_blank' ? { blanks: blanks.map((s) => s.split('\n').map((v) => v.trim()).filter(Boolean)) } : values.answer };
}
