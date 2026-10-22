const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const express=require('express');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-video-boundary-'));
process.env.UPLOAD_PATH=path.join(scratch,'uploads');
const policy=require('../../shared/uploadPolicy.json');
const {uploadReplay,uploadResource,uploadCover,uploadWork,validateUploadedFiles}=require('../middleware/upload');
after(()=>fs.rmSync(scratch,{recursive:true,force:true}));

test('视频实际Multer上限为1.5GB，其他入口不扩大',()=>{
 assert.equal(policy.replayMaxBytes,1_500_000_000);
 assert.equal(uploadReplay.limits.fileSize,policy.replayMaxBytes);
 assert.equal(uploadResource.limits.fileSize,50*1024*1024);
 assert.equal(uploadCover.limits.fileSize,5*1024*1024);
 assert.equal(uploadWork.limits.fileSize,100*1024*1024);
 assert.equal(uploadReplay.limits.files,1);
});

test('真实multipart边界：恰好等于上限可上传，多一个字节拒绝并清理文件',async t=>{
 // Scale only the byte budget, keeping the real replay filter, disk storage,
 // Multer/Busboy and signature validation. No 1.5GB network transfer is claimed.
 const maxBytes=16,scaled=Object.create(uploadReplay);
 scaled.limits={...uploadReplay.limits,fileSize:maxBytes+uploadReplay.limits.fileSize-policy.replayMaxBytes};
 const app=express();
 app.post('/upload',scaled.single('file'),validateUploadedFiles,(req,res)=>{
  const size=req.file.size;fs.unlinkSync(req.file.path);res.json({size});
 });
 app.use((err,_req,res,_next)=>res.status(400).json({code:err.code||err.message}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 for(const [extension,mime,signature] of [
  ['mp4','video/mp4',Buffer.from('0000ftypisom')],
  ['webm','video/webm',Buffer.from([0x1a,0x45,0xdf,0xa3])],
 ])for(const size of [maxBytes-1,maxBytes,maxBytes+1])await t.test(`${extension}: ${size} bytes`,async()=>{
  const bytes=Buffer.alloc(size);signature.copy(bytes);
  const body=new FormData();body.append('file',new Blob([bytes],{type:mime}),'synthetic.'+extension);
  const response=await fetch(`http://127.0.0.1:${server.address().port}/upload`,{method:'POST',body});
  const result=await response.json();
  assert.equal(response.status,size<=maxBytes?200:400,JSON.stringify(result));
  if(size<=maxBytes)assert.equal(result.size,size);else assert.equal(result.code,'LIMIT_FILE_SIZE');
  const directory=path.join(process.env.UPLOAD_PATH,'course-replays');
  assert.deepEqual(fs.existsSync(directory)?fs.readdirSync(directory):[],[]);
 });
});
