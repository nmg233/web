// 本地 UI 验收专用：临时数据库，禁止连接正式数据；不输出任何真实凭据。
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-account-ui-'));
Object.assign(process.env,{DB_PATH:path.join(dir,'test.db'),UPLOAD_PATH:path.join(dir,'uploads'),
  FEEDBACK_UPLOAD_PATH:path.join(dir,'feedback'),JWT_SECRET:'local-account-ui-fixture',NODE_ENV:'test'});
fs.writeFileSync(process.env.DB_PATH,'');
const db=require('../config/database');
const bcrypt=require('bcryptjs');
db.exec("INSERT INTO schools(id,name) VALUES(1,'验收学校'); INSERT INTO classes(id,name,school_id,grade) VALUES(1,'一班',1,'一年级');");
db.prepare("INSERT INTO users(username,real_name,role,password_hash) VALUES('ui-admin','验收管理员','admin',?)").run(bcrypt.hashSync('UiVerify!123',4));
const app=require('../app');
const express=require('express');
const frontend=express();
frontend.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
frontend.get('*',(_req,res)=>res.sendFile(path.resolve(__dirname,'../../frontend/dist/index.html')));
const api=app.listen(3000,'127.0.0.1');
// 5173 保持 Vite 同源 /api 约定，但直接服务构建产物并转发 API。
const http=require('node:http');
const web=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')) {
    const upstream=http.request({hostname:'127.0.0.1',port:3000,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    upstream.on('error',()=>{res.statusCode=502;res.end();});req.pipe(upstream);
  } else frontend(req,res);
}).listen(5173,'127.0.0.1',()=>console.log(`UI 验收已启动：http://localhost:5173；隔离数据目录 ${dir}`));
async function close(){await Promise.all([new Promise(r=>web.close(r)),new Promise(r=>api.close(r))]);db.close();fs.rmSync(dir,{recursive:true,force:true});}
process.once('SIGINT',()=>close().then(()=>process.exit()));
process.once('SIGTERM',()=>close().then(()=>process.exit()));
