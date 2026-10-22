const db=require('../config/database'),{managed}=require('./lessonMapImages'),{invalid,text}=require('./courseContentValidation');
function read(courseId){const row=db.prepare('SELECT * FROM course_lab_settings WHERE course_id=?').get(courseId);if(!row)return {experimentId:'glider',title:'',introduction:'',cover:null,background:null,revision:0};const image=id=>{const i=id&&db.prepare('SELECT * FROM course_theme_images WHERE id=? AND course_id=?').get(id,courseId);return i?require('./courseThemeImages').dto(i):null;};return {experimentId:'glider',title:row.title||'',introduction:row.introduction||'',cover:image(row.cover_image_id),background:image(row.background_image_id),revision:row.revision};}
function save(actor,courseId,body){return db.transaction(()=>{
  managed(db,actor,courseId,true);
  if(!body||Object.keys(body).some(k=>!['title','introduction','coverId','backgroundId','expectedRevision','request_key'].includes(k)))invalid('实验室填写字段无效');
  const requests=require('../helpers/requestResults'),identity=requests.identity(actor,'lab-settings:'+courseId,body),old=read(courseId);
  const prior=requests.existing(db,identity);if(prior)return prior;
  if(body.expectedRevision!==old.revision)invalid('实验室已由其他维护者修改，请核对修订；当前草稿保留',409);
  for(const [key,purpose]of[['coverId','cover'],['backgroundId','desktop']])if(body[key]!=null&&!db.prepare('SELECT 1 FROM course_theme_images WHERE id=? AND course_id=? AND purpose=?').get(body[key],courseId,purpose))invalid('实验室图片不属于当前课程或用途',404);
  const title=text(body.title,'实验室名称',120),intro=text(body.introduction,'实验室介绍',10000);
  db.prepare(`INSERT INTO course_lab_settings(course_id,title,introduction,cover_image_id,background_image_id,updated_by) VALUES(?,?,?,?,?,?)
    ON CONFLICT(course_id) DO UPDATE SET title=excluded.title,introduction=excluded.introduction,cover_image_id=excluded.cover_image_id,background_image_id=excluded.background_image_id,updated_by=excluded.updated_by,revision=revision+1,updated_at=CURRENT_TIMESTAMP`).run(courseId,title,intro,body.coverId??null,body.backgroundId??null,actor.id);
  const result={saved:true,...read(courseId)};requests.save(db,identity,result);return result;
}).immediate();}
module.exports={read,save};
