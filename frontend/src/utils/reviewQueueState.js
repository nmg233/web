const positive = value => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value)>0 ? String(Number(value)) : undefined;
export function reviewQuery(params) {
  return {status:['submitted','approved','rejected'].includes(params.get('status'))?params.get('status'):'submitted',courseId:positive(params.get('course_id')),lessonId:positive(params.get('course_id'))?positive(params.get('lesson_id')):undefined,page:Number(positive(params.get('page'))||1)};
}
export function changeReviewQuery(params,field,value) {
  const next=new URLSearchParams(params);value?next.set(field,String(value)):next.delete(field);
  if(field!=='page')next.delete('page');if(field==='course_id')next.delete('lesson_id');return next;
}
export function reviewScrollKey(userId,params) {
  const {status,courseId,lessonId,page}=reviewQuery(params);return `review-scroll:${userId}:${status}:${courseId||''}:${lessonId||''}:${page}`;
}
export function readReviewScroll(storage,key) {
  try{const raw=storage?.getItem(key);if(raw===null||raw===undefined)return 0;const y=Number(raw);return Number.isFinite(y)&&y>=0?y:0;}catch{return 0;}
}
export function saveReviewScroll(storage,key,y) {
  try{if(Number.isFinite(y)&&y>=0)storage?.setItem(key,String(y));}catch{/* Navigation remains available when optional session storage is blocked. */}
}
