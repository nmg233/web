const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const db=require('../config/database'), html=require('./articleHtml'), remote=require('./articleFetch');
const images=require('./lessonMapImages'), {contentRevision}=require('../helpers/contentRevision');
const {invalid}=require('./courseContentValidation');
function managed(actor,courseId,lessonId,expected){
  images.managed(db,actor,courseId,true);
  const lesson=db.prepare('SELECT * FROM lessons WHERE id=? AND course_id=?').get(lessonId,courseId);
  if(!lesson)invalid('课时不属于当前课程',404);
  require('../helpers/lessonPublication').assertEditable(db,lessonId);
  if(typeof expected!=='string'||contentRevision(lesson)!==expected)invalid('课时已变化，请保留输入并核对服务器修订',409);
  return lesson;
}
function localName(value){
  let name;try{name=decodeURIComponent(value.split(/[?#]/)[0]);}catch{invalid('文章图片路径编码无效');}
  if(!name||name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(x=>x==='..'||x==='.')||/[\x00-\x1f]/.test(name))invalid('文章包图片路径无效');
  return name;
}
async function prepare({url,file}){
  let text,entries,map={},sourceUrl=null;
  if(url){remote.target(url);sourceUrl=url;text=(await remote.fetchBytes(url)).toString('utf8');}
  else if(file){
    if(path.extname(file.originalname).toLowerCase()==='.zip'){
      entries=require('./coursePackageFormat').unzip(file.buffer);
      if([...entries.keys()].some(n=>! /\.(?:html?|json|png|jpe?g|webp)$/i.test(n)))invalid('文章包只接受 HTML、图片与映射 JSON，不接受脚本、程序或样式文件');
      const htmlFiles=[...entries.keys()].filter(n=>/\.html?$/i.test(n));
      if(htmlFiles.length!==1)invalid('文章包应包含唯一的 HTML 正文及图片，可选 image-map.json');
      text=new TextDecoder('utf-8',{fatal:true}).decode(entries.get(htmlFiles[0]));
      if(entries.has('image-map.json')){try{map=JSON.parse(entries.get('image-map.json').toString('utf8'));}catch{invalid('image-map.json 格式无效');}if(!map||typeof map!=='object'||Array.isArray(map)||Object.values(map).some(v=>typeof v!=='string'))invalid('图片映射应为“原地址：包内相对路径”的对象');}
    }else if(/\.html?$/i.test(file.originalname))text=new TextDecoder('utf-8',{fatal:true}).decode(file.buffer);
    else invalid('只接受文章 HTML 或 HTML＋图片 ZIP，不接受程序包');
  }else invalid('请填写文章地址或选择 HTML＋图片包');
  text=html.source(text,Boolean(sourceUrl));
  const sources=html.imageSources(text);if(sources.length>40)invalid('每次最多导入40张图片');
  const blobs=[];let total=0;
  // Bounded batches; resolve every image before any database/file write.
  for(let i=0;i<sources.length;i+=3){
    const batch=await Promise.all(sources.slice(i,i+3).map(async source=>{
      const buffer=sourceUrl?await remote.fetchBytes(source,'image'):(()=>{const name=localName(map[source]||source);const b=entries?.get(name);if(!b)invalid('文章缺少图片 '+name+'，未写入正文；请补齐图片包');return b;})();
      const checked=images.imageBytes(buffer);return {source,buffer,...checked};
    }));
    for(const b of batch){total+=b.buffer.length;if(total>40*1024*1024)invalid('图片总大小超过40MB');blobs.push(b);}
  }
  return {text,blobs,sourceUrl};
}
async function importArticle(actor,courseId,lessonId,{url,file,expected_revision,requestKey}){
  managed(actor,courseId,lessonId,expected_revision);
  if(!/^[\w-]{8,100}$/.test(requestKey||''))invalid('文章导入请求编号无效');
  const prepared=await prepare({url,file}),created=[];
  try{return db.transaction(()=>{
    managed(actor,courseId,lessonId,expected_revision);
    const mapped=new Map(),resources=[];
    for(const [index,b]of prepared.blobs.entries()){
      const token='article:'+requestKey+':'+index;
      let row=db.prepare('SELECT * FROM resources WHERE course_id=? AND lesson_id=? AND upload_by=? AND upload_token=?').get(courseId,lessonId,actor.id,token);
      if(row&&row.upload_digest!==b.digest)invalid('导入编号已用于不同文章图片，请重新选择文件',409);
      if(!row){
        const root=path.resolve(__dirname,'..',process.env.UPLOAD_PATH||'uploads','article-images');fs.mkdirSync(root,{recursive:true});
        const filePath=path.join(root,crypto.randomUUID()+b.ext);fs.writeFileSync(filePath,b.buffer,{flag:'wx'});created.push(filePath);
        const id=db.prepare(`INSERT INTO resources(course_id,lesson_id,resource_type,title,file_path,file_name,file_type,file_size,upload_by,upload_token,upload_digest)
          VALUES(?,?,'other',?,?,?,?,?,?,?,?)`).run(courseId,lessonId,'文章图片 '+(index+1),filePath,'article-'+(index+1)+b.ext,b.ext.slice(1),b.buffer.length,actor.id,token,b.digest).lastInsertRowid;
        row=db.prepare('SELECT * FROM resources WHERE id=?').get(id);
      }
      mapped.set(b.source,'pbl-resource:'+row.id);resources.push(require('../helpers/fileDto').toFileDto(row));
    }
    const result=html.clean(prepared.text,s=>mapped.get(s));
    return {...result,block:{id:'article-'+crypto.createHash('sha256').update(requestKey).digest('hex').slice(0,40),type:'rich',html:result.html,resourceIds:result.resourceIds},resources,sourceUrl:prepared.sourceUrl,
      saved:false,message:'图片已保存本站；正文已放入当前课时草稿，请预览并保存课时。未发布或改变学习记录。'};
  }).immediate();}catch(e){for(const f of created)try{fs.unlinkSync(f);}catch{}throw e;}
}
module.exports={importArticle,prepare,managed,localName};
