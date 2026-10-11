import {safeReturnTo} from './model.js';
// Only the current account's authorized server DTO is considered here. Historical
// grants retain safe snapshots; locked definitions come from the server's scope.
export function badgeRoomItems(data){
 const earned=(data?.grants||[]).map(g=>({...g,key:'grant:'+g.id,earned:true,source:'lesson'}));
 const lessons=new Set(earned.map(g=>String(g.lesson_id)));
 const locked=(data?.locked||[]).filter(l=>l.definition&&!lessons.has(String(l.lessonId))).map(l=>({key:'lesson:'+l.lessonId,lesson_id:l.lessonId,course_id:l.courseId,...l.definition,checks:l.checks,earned:false,source:'lesson',accessible:true}));
 return {earned,locked};
}
export function selectedBadge(items,key){return [...items.earned,...items.locked].find(b=>b.key===key)||null;}
export function badgeRoomReturn(value){
 if(typeof value!=='string'||value.includes('\\')||[...value].some(c=>c.charCodeAt(0)<=32))return '/me';
 try{const url=new URL(value,'https://local.invalid');if(!value.startsWith('/')||url.origin!=='https://local.invalid'||url.pathname!=='/me')return '/me';const course=safeReturnTo(url.searchParams.get('returnTo'),'');return course?'/me?returnTo='+encodeURIComponent(course):'/me';}catch{return '/me';}
}
