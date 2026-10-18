export function hasTeachingValue(value){
 if(value===0)return true;
 if(typeof value==='string')return Boolean(value.replace(/<!--[^]*?-->/g,'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/[\u200b-\u200d\ufeff]/g,'').trim());
 return value!=null&&value!==false;
}
export function validArticleBlocks(value,resources){
 let blocks;try{blocks=typeof value==='string'?JSON.parse(value):value;}catch{return [];}
 return Array.isArray(blocks)?blocks.filter(b=>b?.type==='paragraph'?hasTeachingValue(b.text):['image','file'].includes(b?.type)&&Number.isSafeInteger(b.resourceId)&&(!resources||resources.some(r=>r.id===b.resourceId&&r.has_file!==false))):[];
}
