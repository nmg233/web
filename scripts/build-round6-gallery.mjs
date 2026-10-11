import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const directory = path.resolve(import.meta.dirname, '../docs/round-06');
const groups = [
  ['实验选择与参数', [
    ['01-lab-real-first', '实验选择 · 首屏 · 真实页面', '只有已注册的滑翔机实验。使用隔离账号，无正式教学内容。'],
    ['02-parameters-real-first', '默认参数 · 首屏 · 真实接口', '七项原参数全部保留；进阶四项折叠并预挂载，提交时不遗漏。'],
    ['02-advanced-real-scrolled', '进阶参数 · 滚动后 · 真实表单', '四项机身与尾翼参数展开，数值随后折叠提交，七项映射实际通过验证。'],
    ['02-empty-history-real-desktop-scrolled', '空记录 · 滚动后 · 真实接口', '隔离账号第一次进入实验室，尚未提交任何试飞。'],
    ['08-course-source-real-first', '来源课程与课时 · 首屏 · 真实核验', '测试绑定精确到第二张知识卡片；固定来源可返回原阶段、原卡片。'],
  ]],
  ['运行与科学结果', [
    ['03-running-injected-scrolled', '运行中 · 滚动后 · 受控响应', '运行状态通过浏览器路由注入，以稳定验收布局；不代表真实引擎的运行耗时。'],
    ['04-success-reference-scrolled', '计算成功 · 滚动后 · 真实参考引擎', '记录 #1：重着陆。11.94 s、506.1 m 等数值均来自未修改的 reference 引擎。'],
    ['04-trajectory-reference-scrolled', '航迹与遥测 · 滚动后 · 真实引擎图', '科学结果原图，无像素化滤镜或美术替换，可放大查看。'],
    ['04-chart-preview-real-mobile-scrolled', '窄屏图表预览 · 弹层 · 真实引擎图', '键盘打开，支持缩放，Escape 关闭；弹层位于顶栏和伙伴之上。'],
    ['05-history-real-scrolled', '历史记录 · 滚动后 · 真实接口', '原生按钮可用键盘进入，同条重开会重新读取，编辑参数不被历史值覆盖。'],
  ]],
  ['局部失败与收尾', [
    ['06-file-404-injected-scrolled', '航迹文件 404 · 滚动后 · 故障注入', '只阻断航迹请求，真实数值和遥测图保留。重试已验证恢复，未重复创建试飞。'],
    ['07-timeout-injected-desktop-scrolled', '等待超时 · 滚动后 · 受控时钟', '运行响应注入，浏览器时钟推进 300 秒；切换记录与新试飞均清除旧超时。'],
    ['09-source-withdrawn-real-desktop-first', '来源撤回 · 首屏 · 真实 API', '仅在临时 SQLite 撤回测试课程，返回实验室并解释原因。'],
    ['10-rejected-real-desktop-first', '最新退回作品 · 首屏 · 真实 API', '正文前没有孤立 0，最新版本仍可修改，已有新版的历史退回版仍标已修改。'],
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
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第六轮 · 实验室与试飞验收</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f0e5c8;color:#102d40;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}header{background:#102d40;color:#fff9e9;padding:32px max(24px,calc((100vw - 1260px)/2))}header p{max-width:1000px}h1{font-size:30px;margin:0}a{color:#08766e}header a{color:#bceadb}main{max-width:1308px;margin:auto;padding:24px}nav{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.filters{display:flex;gap:10px;flex-wrap:wrap;padding:14px 0}button{font:inherit;padding:8px 16px;border:2px solid #102d40;color:#102d40;background:#fff9e9;cursor:pointer}button[aria-pressed=true]{background:#08766e;color:white}button:focus-visible,a:focus-visible{outline:3px solid #b36816;outline-offset:3px}section{scroll-margin-top:20px}h2{margin-top:44px;border-bottom:2px solid #baa984;padding-bottom:10px}article{padding:20px;background:#fff9e9;border:1px solid #c7b78e;margin:24px 0}h3{margin:0}article p{margin:6px 0 18px;color:#526974}.images{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;min-width:0;max-width:100%;flex:1 1 300px}figure[data-size="390"]{max-width:390px}figure[data-size="768"]{max-width:768px}figure[hidden],article[hidden],section[hidden]{display:none}img{display:block;max-width:100%;height:auto;border:1px solid #a4b4b2;background:white}figcaption{font-size:13px;color:#526974;margin-top:6px}footer{padding:30px 0;color:#526974}@media(max-width:560px){main{padding:16px}article{padding:12px}h1{font-size:25px}}
</style></head><body><header><h1>实验室与试飞 · 第六轮视觉验收</h1><p>沿用「晴空观测站」。${files.length} 张本地 Edge 实际截图，使用隔离临时 SQLite 与合成教学内容；不代表正式课程，未改动开发数据库或历史截图。真实参考引擎结果、故障注入与受控运行状态分别标注。首屏从顶部截取，内容区为操作、滚动后的视口；所有图片均未裁切或修图。</p><a href="../round-06.md">交付说明</a> · <a href="../round-04/index.html">第四轮首页与地图</a></header><main><nav aria-label="页面分类">${groups.map(([heading], i) => `<a href="#group-${i}">${heading}</a>`).join('')}</nav><div class="filters" role="group" aria-label="截图尺寸"><button data-filter="1440" aria-pressed="true">桌面 1440×900</button><button data-filter="768" aria-pressed="false">平板 768×1024</button><button data-filter="390" aria-pressed="false">窄屏 390×844</button><button data-filter="all" aria-pressed="false">全部尺寸</button></div>${sections}<footer>来自真实页面与交互，不使用整张图片代替页面。复现：npm run test:e2e:round6，再运行 node scripts/build-round6-gallery.mjs。</footer></main><script>
function filter(size){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===size)));document.querySelectorAll('figure').forEach(f=>f.hidden=size!=='all'&&f.dataset.size!==size);document.querySelectorAll('article').forEach(a=>a.hidden=!a.querySelector('figure:not([hidden])'));document.querySelectorAll('main section').forEach(s=>s.hidden=!s.querySelector('article:not([hidden])'));}document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>filter(b.dataset.filter)));filter('1440');
</script></body></html>\n`);
console.log(`Generated gallery with ${files.length} screenshots.`);
