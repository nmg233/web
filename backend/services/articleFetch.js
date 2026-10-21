const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const IMAGE_HOSTS=new Set(['mmbiz.qpic.cn','mmbiz.qlogo.cn']);
function target(value,kind='article') {
  let u;try{u=new URL(value);}catch{invalid('文章或图片地址无效');}
  const allowed=kind==='article'?u.hostname==='mp.weixin.qq.com':IMAGE_HOSTS.has(u.hostname);
  if(u.protocol!=='https:'||!allowed||u.username||u.password||u.port&&u.port!=='443'||u.hash)invalid('只允许微信公众号 HTTPS 文章及指定腾讯图片域，不允许其他主机或端口');
  if(kind==='article'&&!/^\/s(?:\/[^/]+)?$/.test(u.pathname))invalid('请填写 mp.weixin.qq.com/s/… 或 /s?… 的文章地址');
  return u;
}
function publicAddress(ip) {
  if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]>0&&p[0]!==10&&p[0]!==127&&p[0]!==169&&p[0]!==172&&p[0]!==192&&p[0]!==100&&p[0]<224&&p[0]!==198;}
  // Keep IPv6 global unicast only; mapped IPv4, private, link-local and loopback are excluded.
  return net.isIP(ip)===6&&/^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0?db8|0{1,4}):/i.test(ip)&&!/^2002:/i.test(ip);
}
async function fetchBytes(value,kind='article',remaining=2) {
  const u=target(value,kind);let dnsTimer,answers;
  try { answers=await Promise.race([dns.lookup(u.hostname,{all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Object.assign(Error('文章域名解析超时，可使用 HTML＋图片包'),{status:400})),12000);})]); }
  finally { clearTimeout(dnsTimer); }
  if(!answers.length||answers.some(a=>!publicAddress(a.address)))invalid('目标 DNS 包含非公网地址，已阻止抓取');
  const address=answers[0],limit=kind==='article'?2*1024*1024:5*1024*1024;
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{agent:false,headers:{'User-Agent':'PBL-Article-Importer/1.0','Accept-Encoding':'identity'},
      lookup:(_hostname,options,cb)=>options.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!remaining)return reject(Object.assign(Error('文章重定向次数超限'),{status:400}));let next;try{next=new URL(res.headers.location,u);target(next.href,kind);}catch(e){return reject(e);}return fetchBytes(next.href,kind,remaining-1).then(resolve,reject);}
      if(res.statusCode!==200){res.resume();return reject(Object.assign(Error('文章或图片抓取失败（HTTP '+res.statusCode+'），可改用 HTML＋图片 ZIP 导入'),{status:400}));}
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();return reject(Object.assign(Error('不接受压缩远程响应，请使用 HTML＋图片包'),{status:400}));}
      if(Number(res.headers['content-length'])>limit){res.destroy();return reject(Object.assign(Error('远程内容超过体积限制'),{status:400}));}
      let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>limit)res.destroy(Object.assign(Error('远程内容超过体积限制'),{status:400}));else chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
    });
    const deadline=setTimeout(()=>req.destroy(Object.assign(Error('远程抓取总时限20秒，已终止'),{status:400})),20000);req.once('close',()=>clearTimeout(deadline));
    req.setTimeout(12000,()=>req.destroy(Object.assign(Error('文章抓取超时，可改用 HTML＋图片 ZIP 导入'),{status:400})));
    req.on('error',reject);
  });
}
module.exports={target,publicAddress,fetchBytes};
