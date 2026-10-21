const db=require('../config/database');
const v=require('./courseContentValidation');
const imageTypes=new Set(['jpg','jpeg','png','webp','gif']);
const fileTypes=new Set(['pdf','doc','docx','ppt','pptx','xls','xlsx','txt','md','csv','zip']);
function parse(value){try{const blocks=typeof value==='string'?JSON.parse(value):value;return Array.isArray(blocks)?blocks:[];}catch{return [];}}
function validate(blocks,courseId,lessonId){
 if(!Array.isArray(blocks)||blocks.length>200||JSON.stringify(blocks).length>250000)v.invalid('文章最多200个段落/图片块，总长度不超过250000字符');
 const ids=new Set();
 return blocks.map(block=>{
  if(!block||typeof block!=='object'||Array.isArray(block)||!['paragraph','image','file','rich'].includes(block.type))v.invalid('文章只允许段落或本站图片、文件');
  const allowed=block.type==='rich'?['id','type','html','resourceIds']:block.type==='paragraph'?['id','type','text']:['id','type','resourceId','title','caption'];
  if(Object.keys(block).some(k=>!allowed.includes(k)))v.invalid('文章块包含不支持字段，不接受HTML或外部嵌入');
  if(typeof block.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(block.id)||ids.has(block.id))v.invalid('文章块标识无效或重复');ids.add(block.id);
  const text=(value,label,max)=>{const result=v.text(value,label,max)||'';if(/<\/?(?:script|iframe|img|style|object|embed|svg)\b|\bon\w+\s*=|javascript\s*:/i.test(result))v.invalid('文章不接受脚本、事件或外部嵌入');return result;};
  if(block.type==='rich'){const clean=require('./articleHtml').clean(block.html);for(const id of clean.resourceIds){const resource=db.prepare('SELECT lesson_id,file_type FROM resources WHERE id=? AND course_id=?').get(id,courseId);if(!resource||resource.lesson_id!==Number(lessonId)||!imageTypes.has(resource.file_type))v.invalid('文章图片必须属于当前课时');}return {id:block.id,type:'rich',html:clean.html,resourceIds:clean.resourceIds};}
  if(block.type==='paragraph')return {id:block.id,type:block.type,text:text(block.text,'段落',10000)};
  const id=v.integer(block.resourceId,'图片资源',{min:1}),resource=db.prepare('SELECT lesson_id,file_type FROM resources WHERE id=? AND course_id=?').get(id,courseId);
  if(!resource||resource.lesson_id!==Number(lessonId)||!(block.type==='image'?imageTypes:fileTypes).has(resource.file_type?.toLowerCase()))v.invalid('文章图片或文件必须是当前课程、当前课时的对应资源');
  return {id:block.id,type:block.type,resourceId:id,title:text(block.title,'图片标题',120),caption:text(block.caption,'图片说明',1000)};
 });
}
module.exports={parse,validate};
