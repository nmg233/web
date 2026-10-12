const fieldsV1 = ['difficulty','solution','improvement','new_question'];
const fieldsV2 = ['entry_note','together_note','extra_note'];
function validateReflection(value = {}) {
  const version=value.reflection_version??1;
  if(![1,2].includes(version))throw Object.assign(new Error('反思版本无效'),{status:400});
  for(const k of [...fieldsV1,...fieldsV2]) if(value[k]!=null&&typeof value[k]!=='string') throw Object.assign(new Error('反思内容须为文字'),{status:400});
  const fields=version===2?fieldsV2:fieldsV1;
  const result={reflection_version:version,...Object.fromEntries([...fieldsV1,...fieldsV2].map(k=>[k,null]))};
  for(const key of fields){const v=value[key];if(v!=null&&(typeof v!=='string'||v.length>2000))throw Object.assign(new Error('每个反思框最多 2000 字'),{status:400});result[key]=v?.trim()?v:null;}
  if(!fields.some(k=>result[k]))throw Object.assign(new Error('请在任意一个反思框写下想记录的内容'),{status:400});
  // Reject mixed payloads instead of silently discarding the historical fourth field.
  if((version===2?fieldsV1:fieldsV2).some(k=>value[k]?.trim()))throw Object.assign(new Error('请按反思版本提交，旧四项内容需保留原含义'),{status:400});
  return result;
}
const columns=['difficulty','solution','improvement','new_question','reflection_version','entry_note','together_note','extra_note'];
module.exports={validateReflection,columns};
