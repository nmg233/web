import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const directory = path.resolve(import.meta.dirname, '../docs/round-05');
const groups = [
  ['课时学习 · 回顾与卡片', [
    ['01-review-first-screen', '课堂回顾 · 首屏', '四阶段与锁定原因，回放失败可重试。'],
    ['02-card-first-screen', '知识卡片 · 首屏', '当前阶段与真实卡片顺序。'],
    ['02-card-reading-scrolled', '卡片阅读 · 滚动后', '摘要、正文、要点和误区，稳定浅色阅读底。'],
    ['03-exercise-feedback-scrolled', '练习反馈 · 滚动后', '已作答不可重复；答错后可阅读解析并继续。'],
    ['04-empty-cards-and-works', '无卡片与无作品任务 · 首屏', '不自动完成卡片阶段，不制造作品要求。'],
  ]],
  ['课时学习 · 报告与评审', [
    ['05-report-draft-first-screen', '报告草稿 · 首屏', '当前浏览器按账号与课时保存，保留全部原字段。'],
    ['06-report-failure', '报告提交失败 · 滚动后', '请求中断后文字仍保留，提示靠近提交动作。'],
    ['07-report-pending-first-screen', '报告待评审 · 首屏', '四阶段状态及当前浏览位置。'],
    ['07-report-pending-content-scrolled', '报告待评审 · 内容区', '说明可以回看卡片、报告或处理作品任务。'],
    ['08-report-returned-first-screen', '报告退回 · 首屏', '原反馈与原版字段恢复，允许提交新版本。'],
    ['08-report-returned-content-scrolled', '报告修改意见 · 内容区', '滚动查看导师意见及学习记录。'],
    ['15-report-confirm', '窄屏确认弹窗 · 滚动后', '学习伙伴展开时，确认与取消仍可点击。'],
  ]],
  ['作品 · 提交与版本', [
    ['09-work-upload-first-screen', '首次提交作品 · 首屏', '明确所属任务、作品名称、成果文字及单附件。'],
    ['10-work-upload-failure-scrolled', '附件校验失败 · 滚动后', '真实服务器拒绝无效 PDF，文字与已选附件保留。'],
    ['11-work-detail-returned-first-screen', '作品详情 · 首屏', '作品被退回，报告通过不隐藏作品修改入口。'],
    ['12-work-feedback-scrolled', '导师反馈 · 滚动后', '显示真实评语与修改建议，仅最新退回版可修改。'],
    ['13-work-attachment-failure', '作品附件缺失 · 滚动后', '404 局部提示，作品文字、版本和反馈仍可查看。'],
    ['14-historical-work-first-screen', '历史退回版本 · 首屏', '已有新版本时显示已修改，不再开放旧版提交。'],
    ['14-version-menu-scrolled', '切换版本 · 滚动后', '三种屏幕尺寸下，版本选项均可见、可点击。'],
    ['17-work-approved-feedback-scrolled', '作品通过 · 反馈区', '导师实际评分后的五项维度，三种屏幕宽度。'],
    ['18-work-access-invalid', '真实权限失效 · 首屏', '课程撤回后，原作品内容被清除。'],
    ['18-work-network-failure', '网络失败 · 首屏', '显示中文说明，可重新加载，不展示上次成功数据。'],
  ]],
  ['其他角色 · 兼容检查', [
    ['16-admin-original-review-first-screen', '管理员评审 · 首屏', '保留原界面和评审表单，学生视觉不渗入。'],
  ]],
];
const files = readdirSync(path.join(directory, 'screenshots')).filter((name) => name.endsWith('.png')).sort();
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const sections = groups.map(([heading, items], groupIndex) => `<section id="group-${groupIndex}"><h2>${heading}</h2>${items.map(([prefix, title, caption]) => {
  const matching = files.filter((name) => name.startsWith(prefix));
  if (!matching.length) throw new Error(`Missing screenshot: ${prefix}`);
  return `<article><h3>${title}</h3><p>${caption}</p><div class="images">${matching.map((name) => {
    const png = readFileSync(path.join(directory, 'screenshots', name));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    return `<figure data-size="${width}"><a href="screenshots/${escape(name)}" target="_blank" rel="noopener"><img src="screenshots/${escape(name)}" width="${width}" height="${height}" alt="${title}，${width}×${height}"></a><figcaption>${width}×${height} · 点击查看原始截图</figcaption></figure>`;
  }).join('')}</div></article>`;
}).join('')}</section>`).join('');

writeFileSync(path.join(directory, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第五轮 · 学习与作品视觉验收</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f0e5c8;color:#102d40;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}header{background:#102d40;color:#fff9e9;padding:32px max(24px,calc((100vw - 1260px)/2))}header p{max-width:1000px}h1{font-size:30px;margin:0}a{color:#08766e}header a{color:#bceadb}main{max-width:1308px;margin:auto;padding:24px}nav{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.filters{display:flex;gap:10px;flex-wrap:wrap;padding:14px 0}button{font:inherit;padding:8px 16px;border:2px solid #102d40;color:#102d40;background:#fff9e9;cursor:pointer}button[aria-pressed=true]{background:#08766e;color:white}button:focus-visible,a:focus-visible{outline:3px solid #b36816;outline-offset:3px}section{scroll-margin-top:20px}h2{margin-top:44px;border-bottom:2px solid #baa984;padding-bottom:10px}article{padding:20px;background:#fff9e9;border:1px solid #c7b78e;margin:24px 0}h3{margin:0}article p{margin:6px 0 18px;color:#526974}.images{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;min-width:0;max-width:100%;flex:1 1 300px}figure[data-size="390"]{max-width:390px}figure[data-size="768"]{max-width:768px}figure[hidden],article[hidden],section[hidden]{display:none}img{display:block;max-width:100%;height:auto;border:1px solid #a4b4b2;background:white}figcaption{font-size:13px;color:#526974;margin-top:6px}footer{padding:30px 0;color:#526974}@media(max-width:560px){main{padding:16px}article{padding:12px}h1{font-size:25px}}
</style></head><body><header><h1>学习与作品 · 第五轮视觉验收</h1><p>沿用「晴空观测站」。${files.length} 张本地 Edge 实际截图，使用隔离临时 SQLite 与合成教学内容；不代表正式课程，未改动开发数据库或历史截图。首屏从顶部截取，内容区为操作、滚动后的视口；所有图片均未裁切或修图。</p><a href="../round-05.md">交付说明</a> · <a href="../round-04/index.html">第四轮首页与地图</a></header><main><nav aria-label="页面分类">${groups.map(([heading], i) => `<a href="#group-${i}">${heading}</a>`).join('')}</nav><div class="filters" role="group" aria-label="截图尺寸"><button data-filter="1440" aria-pressed="true">桌面 1440×900</button><button data-filter="768" aria-pressed="false">平板 768×1024</button><button data-filter="390" aria-pressed="false">窄屏 390×844</button><button data-filter="all" aria-pressed="false">全部尺寸</button></div>${sections}<footer>来自真实页面与交互，不使用整张图片代替页面。复现：npm run test:e2e:round5，再运行 node scripts/build-round5-gallery.mjs。</footer></main><script>
function filter(size){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===size)));document.querySelectorAll('figure').forEach(f=>f.hidden=size!=='all'&&f.dataset.size!==size);document.querySelectorAll('article').forEach(a=>a.hidden=!a.querySelector('figure:not([hidden])'));document.querySelectorAll('main section').forEach(s=>s.hidden=!s.querySelector('article:not([hidden])'));}document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>filter(b.dataset.filter)));filter('1440');
</script></body></html>\n`);
console.log(`Generated gallery with ${files.length} screenshots.`);
