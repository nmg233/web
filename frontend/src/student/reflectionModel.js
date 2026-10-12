export const oldReflectionFields=[['difficulty','system.records.008'],['solution','system.records.009'],['improvement','system.records.010'],['new_question','system.records.011']];
export const openReflectionFields=[['entry_note','next2.reflection.entry'],['together_note','next2.reflection.together'],['extra_note','next2.reflection.extra']];
export const reflectionFields=value=>value?.reflection_version===2?openReflectionFields:oldReflectionFields;
export const hasReflection=value=>reflectionFields(value).some(([k])=>typeof value?.[k]==='string'&&value[k].trim());
// Old drafts keep their original labels and all four texts, including new_question.
// Callers retain the original draft under a separate account-scoped backup key.
export function openReflectionDraft(value,label){
 if(value?.reflection_version===2)return value;
 const entries=oldReflectionFields.filter(([k])=>value?.[k]).map(([k,id])=>label(id)+'：'+value[k]);
 return{reflection_version:2,entry_note:entries.join('\n\n'),together_note:'',extra_note:''};
}
