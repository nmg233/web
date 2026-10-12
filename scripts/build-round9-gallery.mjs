
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory=path.resolve(import.meta.dirname,'../docs/round-09');
const entries=[
['01-login','统一品牌登录','真实页面 · 空表单；账号由管理员创建。','账号与密码'],
['02-login-error','账号或密码错误','真实登录接口返回；保留账号和本页输入。','账号与密码'],
['03-password-forced','强制改密','隔离账号真实 force_reset_password；无学习导航、伙伴或通知请求。','账号与密码'],
['04-password-normal','普通改密','原密码、新密码、确认三项；沿用至少 8 位和三类字符要求。','账号与密码'],
['05-password-saved-session-failed','密码已修改，会话保存失败','真实改密成功后注入 setItem 失败；明确使用新密码重新登录。','账号与密码'],
['06-storage-getter','无法获取登录存储','浏览器故障注入：localStorage getter 拒绝；仍可查看登录表单和原因。','账号与密码'],
['06-storage-read','无法读取登录存储','浏览器故障注入：getItem 抛错；恢复后可重新读取或登录。','账号与密码'],
['07-logout-cleanup-failed','退出时无法清理存储','浏览器故障注入：removeItem 拒绝；当前账号内容立即移除。','账号与密码'],
['08-notifications-empty','还没有通知','真实空列表，不以网络失败冒充空态。','通知'],
['09-notifications-list','通知列表','隔离库测试通知：分类、级别、阅读状态、分页及批量操作。','通知'],
['10-notification-detail','阅读通知','真实 GET 自动标为已读；正文与合法站内目标均为测试内容。','通知'],
['11-notifications-popover','最近通知弹层','真实接口最多 8 条；内部滚动、关闭与返回焦点。','通知'],
['12-notifications-clear-confirm','清理已读确认','操作当前账号全部未隐藏的已读通知，不局限筛选或当前页。','通知'],
['13-notification-count-failure','未读数读取失败','503 故障注入；显示读取失败，不能冒充 0。','通知'],
['14-notification-object-failure','切到不可读通知','A 切 B 后注入 404，不保留 A 的内容或操作。','通知'],
['15-notification-write-read-failure','全部已读成功，回读失败','真实写入成功 + 后续 GET 注入 503；重新读取不会重复执行写操作。','通知'],
['16-feedback-empty','还没有反馈','真实本人反馈列表；不调用管理员管理列表。','帮助与反馈'],
['17-feedback-form','提交反馈','真实 FormData 表单，选填联系方式与附件随提交上传。','帮助与反馈'],
['18-feedback-submit-failure','提交失败保留输入','503 故障注入；正文和所选文件仍保留在本页。','帮助与反馈'],
['19-feedback-detail','反馈与处理记录','真实创建后的测试反馈、编号、附件和回复入口。','帮助与反馈'],
['20-feedback-list','我的反馈','真实本人数据、类型/状态筛选与处理进展。','帮助与反馈'],
['21-feedback-attachment-missing','附件缺失，回复保留','隔离库指向缺失文件，真实下载返回 404；不清空回复。','帮助与反馈'],
['22-feedback-write-read-failure','回复已发送，回读失败','真实回复成功后注入 GET 503，重新读取不再次 POST。','帮助与反馈'],
['23-feedback-resolved','等待确认解决','隔离管理员通过原接口填写处理结果，学生可确认或申请重新处理。','帮助与反馈'],
['24-feedback-reopen-error','重新处理失败保留原因','503 故障注入；原因文本、弹窗和当前焦点仍可使用。','帮助与反馈'],
['25-feedback-forbidden','不能查看其他学生的反馈','真实对象级权限返回 403；不显示上一条内容。','帮助与反馈'],
['26-long-content','长标题与长内容','隔离测试数据，完整换行，无横向溢出。','帮助与反馈'],
['27-feedback-footer','表单底部与附件区','三尺寸实际滚动位置；操作不被学习伙伴遮挡。','帮助与反馈'],
];
const files=readdirSync(path.join(directory,'screenshots')).filter(name=>name.endsWith('.png')&&!name.startsWith('failure'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const cards=entries.map(([prefix,title,description,group])=>{
 const shots=files.filter(name=>name===prefix+'.png'||name.startsWith(prefix+'-'));
 return '<section data-group="'+group+'"><h2>'+title+'</h2><p>'+description+'</p><div class="shots">'+shots.map(name=>{
 const size=name.includes('mobile-390')?'mobile':name.includes('tablet-768')?'tablet':name.includes('desktop-1440')?'desktop':'extra';
 const label={mobile:'390 × 844',tablet:'768 × 1024',desktop:'1440 × 900',extra:'状态实拍'}[size];
 return '<figure data-size="'+size+'"><a href="screenshots/'+name+'" target="_blank" rel="noopener"><img loading="lazy" src="screenshots/'+name+'" alt="'+esc(title+' · '+label)+'"></a><figcaption>'+label+' · 点击查看原图</figcaption></figure>';
 }).join('')+'</div></section>';
}).join('');
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第九轮验收 · 登录、通知与反馈</title><style>'+
' *{box-sizing:border-box}body{margin:0;background:#f0e4c6;color:#102d40;font:16px/1.7 "Microsoft YaHei",sans-serif}header{background:#102d40;color:#fff9e9;padding:40px max(24px,calc((100vw - 1280px)/2))}header small{letter-spacing:2px;color:#bceadb}h1{font-size:32px;margin:12px 0}header p{max-width:900px;color:#d4e1df}header a{color:#bceadb;margin-right:20px}nav{position:sticky;top:0;z-index:2;background:#fff9e9;border-bottom:2px solid #102d40;padding:16px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}select{font:inherit;padding:6px;background:#fffdf5;color:#102d40}main{max-width:1320px;padding:24px;margin:auto}section{margin-bottom:40px}section>h2{margin-bottom:8px}section>p{color:#526974;margin:0 0 20px}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:24px}figure{margin:0;border:2px solid #102d40;background:#fff9e9;padding:12px;align-self:start}img{display:block;width:100%;height:auto}figcaption{padding:12px 0 0;font-size:14px;color:#526974}[hidden]{display:none!important}footer{padding:24px;text-align:center;border-top:1px solid #b6ae95}nav span{margin-left:auto;color:#526974}@media(max-width:600px){h1{font-size:25px}main{padding:16px}header{padding:28px 20px}nav{padding:12px;gap:8px}nav span{margin-left:0}}'+
'</style><header><small>STAR VOYAGE / ROUND 09</small><h1>登录、通知与反馈</h1><p>沿用晴空观测站，把登录、阅读消息和反馈沟通做成清楚的学生流程。以下均为 Edge 真实页面截图；所有账号与内容来自隔离测试库。密码输入区域已遮罩，未展示密码、token 或真实联系方式。</p><a href="../round-09.md">交付说明</a><a href="../../DESIGN.md">设计规范</a><a href="../round-08/index.html">上一轮图集</a></header>'+
'<nav><label>尺寸 <select id="size"><option value="desktop">桌面 1440</option><option value="tablet">平板 768</option><option value="mobile">窄屏 390</option><option value="extra">补充状态</option><option value="all">全部尺寸</option></select></label><label>页面 <select id="group"><option value="all">全部页面</option><option>账号与密码</option><option>通知</option><option>帮助与反馈</option></select></label><span id="count"></span></nav><main>'+cards+'</main><footer>第九轮 · '+files.length+' 张截图 · 后端、仿真、课程配置及奖励规则未修改</footer><script>'+
'const size=document.querySelector("#size"),group=document.querySelector("#group");function filter(){let count=0;document.querySelectorAll("section").forEach(section=>{let shown=0;section.querySelectorAll("figure").forEach(figure=>{const visible=(size.value==="all"||figure.dataset.size===size.value)&&(group.value==="all"||section.dataset.group===group.value);figure.hidden=!visible;if(visible)shown++});section.hidden=!shown;count+=shown});document.querySelector("#count").textContent="当前 "+count+" 张 / 共 '+files.length+' 张"}size.onchange=filter;group.onchange=filter;filter();'+
'</script></html>';
writeFileSync(path.join(directory,'index.html'),html);console.log('Round 09 gallery:',files.length,'screenshots');
