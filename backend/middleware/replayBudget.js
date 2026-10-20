const fs=require('fs');
const {UPLOAD_ROOT}=require('./upload');
const policy=require('../../shared/uploadPolicy.json');
let active=0;
module.exports=(req,res,next)=>{
 if(active>=policy.replayConcurrentUploads)return res.status(429).json({error:'当前视频上传较多，请稍后重试'});
 try{
  fs.mkdirSync(UPLOAD_ROOT,{recursive:true});
  const stats=fs.statfsSync(UPLOAD_ROOT,{bigint:true});
  if(stats.bavail*stats.bsize<BigInt((active+1)*policy.replayMaxBytes+256*1024*1024))return res.status(507).json({error:'视频存储可用空间不足，请联系管理员'});
 }catch(error){return next(error);}
 active++;let released=false;
 const release=()=>{if(!released){released=true;active--;}};
 res.once('finish',release);res.once('close',release);
 next();
};
