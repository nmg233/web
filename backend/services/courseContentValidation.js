const db=require('../config/database');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function invalid(message,status=400){throw Object.assign(new Error(message),{status});}
function text(value,label,max,required=false){
 if(value==null&&!required)return null;
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))invalid(`${label}${required?'不能为空，且':''}最多 ${max} 字`);
 return value.trim()?value:null;
}
function integer(value,label,{min=0,max=Number.MAX_SAFE_INTEGER,nullable=false}={}){
 if(nullable&&(value==null||value===''))return null;
 if(typeof value==='boolean'||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)invalid(`${label}无效`);
 return Number(value);
}
function lessonId(value,courseId){const id=integer(value,'课时',{min:1,nullable:true});if(id&&!db.prepare('SELECT id FROM lessons WHERE id=? AND course_id=?').get(id,courseId))invalid('课时不属于当前课程');return id;}
function chapterId(value,courseId){const id=integer(value,'章节',{min:1,nullable:true});if(id&&!db.prepare('SELECT id FROM course_chapters WHERE id=? AND course_id=?').get(id,courseId))invalid('章节不属于当前课程');return id;}
function courseFields(body,create=false){
 const result={};
 for(const [key,max,required] of [['title',120,true],['theme',120,false],['description',10000,false],['driving_question',1000,false],['story_line',10000,false],['materials_needed',10000,false]])if(own(body,key)||create&&required)result[key]=text(body[key],key,max,required);
 for(const [key,values] of [['presentation_theme',['campus','voyage']],['grade_level',['primary','junior','senior']],['difficulty',['basic','advanced','challenge']],['status',['draft','published','archived']]]){
  if(own(body,key)||create&&['grade_level','difficulty'].includes(key)){if(!values.includes(body[key]))invalid(`${key}选项无效`);result[key]=body[key];}
 }
 if(own(body,'total_hours'))result.total_hours=integer(body.total_hours,'总课时',{nullable:true,max:10000});
 if(own(body,'cover_image')){
  const covers=['','/assets/redesign-v2/web/campus-960.webp','/assets/redesign-v2/web/cosmos-960.webp'];
  if(!covers.includes(body.cover_image))invalid('请选择已有封面或通过专用入口上传图片');result.cover_image=body.cover_image||null;
 }
 return result;
}
module.exports={own,text,integer,lessonId,chapterId,courseFields,invalid};
