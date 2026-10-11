const fs=require('fs');
const path=require('path');
const JSZip=require('jszip');
const XLSX=require('xlsx');
const mime={
 '.jpg':['image/jpeg'],'.jpeg':['image/jpeg'],'.png':['image/png'],'.gif':['image/gif'],'.webp':['image/webp'],
 '.pdf':['application/pdf'],'.doc':['application/msword'],'.docx':['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 '.ppt':['application/vnd.ms-powerpoint'],'.pptx':['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
 '.txt':['text/plain'],'.md':['text/markdown','text/x-markdown','text/plain'],'.csv':['text/csv','application/csv','text/plain','application/vnd.ms-excel'],
 '.xls':['application/vnd.ms-excel','application/x-excel'],'.xlsx':['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
 '.mp4':['video/mp4'],'.webm':['video/webm'],'.zip':['application/zip','application/x-zip-compressed'],
 '.obj':['model/obj','text/plain'],'.glb':['model/gltf-binary'],'.gltf':['model/gltf+json','application/json'],'.stl':['model/stl','application/sla','text/plain']
};
const ai=new Set(['.pdf','.docx','.pptx','.txt']);
const formats=Object.entries(mime).map(([ext,mimes])=>({ext,mimes,limitMB:50,upload:true,download:true,preview:['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)?'维护端授权图片预览；学生按原课时展示':ext==='.pdf'?'维护端隔离 PDF 预览（浏览器支持时），可下载': '仅下载（视频回放使用专用入口）',ai:ai.has(ext)?'可提取文字；扫描 PDF 无 OCR':'不支持文字索引'}));
function fail(message){throw Object.assign(new Error(message),{status:400});}
function filter(req,file,cb){
 const ext=path.extname(file.originalname).toLowerCase(),allowed=mime[ext];
 if(!allowed||(!allowed.includes(file.mimetype)&&file.mimetype!=='application/octet-stream'))return cb(Object.assign(new Error('资料格式或 MIME 不支持：'+ext),{status:400}),false);
 cb(null,true);
}
function utf8(b){
 let s;try{s=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{fail('文本资料必须使用有效 UTF-8 编码');}
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s)||/^\s*<(?:!doctype\s+html|html|script)\b/i.test(s))fail('文件不是有效的文本资料');return s;
}
function csv(s){let quoted=false,atStart=true,closed=false;for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"')i++;else{quoted=false;closed=true;}}}else if(c==='"'){if(!atStart)fail('CSV 引号结构无效');quoted=true;atStart=false;}else if(c===','||c==='\n'||c==='\r'){atStart=true;closed=false;}else{if(closed&&!/\s/.test(c))fail('CSV 引号后必须是分隔符');atStart=false;}}if(quoted)fail('CSV 引号未闭合');}
async function validate(file){
 const ext=path.extname(file.originalname).toLowerCase(),b=fs.readFileSync(file.path);
 if(['.txt','.md','.csv'].includes(ext)){const s=utf8(b);if(ext==='.csv')csv(s);return;}
 if(ext==='.xlsx'){
  if(b.subarray(0,4).toString('hex')!=='504b0304')fail('XLSX 必须是工作簿包');
  let zip;try{zip=await JSZip.loadAsync(b);}catch{fail('XLSX 工作簿包损坏');}
  const entries=Object.values(zip.files);if(entries.length>5000||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>100*1024*1024)fail('工作簿展开体积过大，请拆分');
  try{await JSZip.loadAsync(b,{checkCRC32:true});}catch{fail('XLSX 工作簿包损坏');}
  if(!zip.file('[Content_Types].xml')||!zip.file('xl/workbook.xml')||!entries.some(e=>/^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)))fail('文件不是 XLSX 工作簿，不能仅将 ZIP 改名');
  try{const book=XLSX.read(b,{type:'buffer',bookSheets:true});if(!book.SheetNames.length)fail('工作簿没有工作表');}catch{fail('XLSX 工作簿结构无效');}return;
 }
 if(ext==='.xls'){
  if(b.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')fail('XLS 必须是旧版二进制工作簿');
  try{const book=XLSX.read(b,{type:'buffer',bookSheets:true});if(!book.SheetNames.length)fail('工作簿没有工作表');}catch{fail('XLS 工作簿结构无效');}
 }
}
async function validateResource(req,res,next){try{if(req.file)await validate(req.file);next();}catch(error){if(req.file?.path)try{fs.unlinkSync(req.file.path);}catch{/* app cleanup */}next(error);}}
module.exports={formats,filter,validateResource,validate};
