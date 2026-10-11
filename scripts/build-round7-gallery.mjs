import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const directory = path.resolve(import.meta.dirname, '../docs/round-07');
const groups = [
  ['成长概况与成果浏览', [
    ['01-overview-real-first', '档案概览 · 首屏 · 真实 API', '隔离账号的两门同名课程按 ID 区分；缺失学校、班级如实显示。桌面首屏同时看到概况与课程记录。'],
    ['02-archive-works-real-scrolled', '档案作品摘要 · 滚动后 · 真实 API', '四个项目、一次迭代；历史退回版已修改，最新退回版保留反馈和修改入口。'],
    ['07-works-real-first', '我的作品 · 首屏 · 真实 API', '课程范围查询、搜索、筛选、版本、真实提交时间与反馈入口。作品使用通用图标。'],
    ['07-many-versions-real-scrolled', '多版本分页 · 滚动后 · 真实 API', '临时库加入同一项目的十个合成版本。十五条提交仍是四个项目；第二页可查看历史版。'],
  ]],
  ['课时报告、反馈与足迹', [
    ['03-report-real-scrolled', '无作品任务课时的报告 · 滚动后 · 真实 API', '选择课程和课时后才加载学习包。最新报告第 2 版，真实分数 0 保留；进入原学习页报告与评审阶段。'],
    ['04-report-locked-real-scrolled', '报告未解锁 · 滚动后 · 真实规则', '区分尚未选择、尚未提交和未解锁，没有新增学习进度。'],
    ['04-report-error-injected-scrolled', '报告读取失败 · 滚动后 · 故障注入', '只阻断所选课时读取，失败不冒充未提交；重试和更换课时可用，迟到响应被丢弃。'],
    ['05-feedback-real-scrolled', '导师反馈 · 滚动后 · 真实 API', '课程过程/成果评价、报告评审与作品评审分开；未评分显示暂无评价。'],
    ['05-aggregate-limited-real-scrolled', '汇总范围不一致 · 滚动后 · 真实 API', '原汇总包含未发布课程作品，明确暂不可汇总；有效作品仍可逐件查看反馈。'],
    ['05-aggregate-zero-contract-desktop-scrolled', '汇总零分与缺失 · 滚动后 · 契约边界注入', '受控返回数值 0 与 null；用于展示边界验证。原 SQL 五维评分不接受新写入 0，不代表正式评分数据。'],
    ['06-trail-real-scrolled', '成长足迹 · 滚动后 · 真实 API', '按作品 ID 去重，保留个人导师记录；无对象关联的系统文本隐藏详情并说明原因。'],
  ]],
  ['独立反思与错误状态', [
    ['11-reflection-real-first', '独立反思 · 首屏 · 真实表单', '原四字段，课程必填、课时可选。文字仅在本页保留，提交成功后才保存到服务端。'],
    ['11-reflection-submit-real-scrolled', '反思提交区 · 滚动后 · 真实表单', '实际通过键盘提交，随后在真实档案读取到新记录。小智不遮挡操作。'],
    ['12-daily-limit-real-scrolled', '报告反思触发日限额 · 滚动后 · 真实 API', '当天反思按北京时间由服务器计数，收到原限额错误，四个输入均保留。'],
    ['13-reflection-invalid-real-first', '课程撤回后保留文字 · 首屏 · 真实 API', '临时库撤回所选课程，课程和课时关联清除；已有文字不丢失，提示重新选择。'],
    ['15-reflection-no-course-real-first', '反思无可选课程 · 首屏 · 真实 API', '隔离账号报名移除，提交禁用并说明原因。'],
    ['08-partial-failure-injected-first', '档案部分读取失败 · 首屏 · 故障注入', '档案摘要 503，课程范围仍核验成功；统计显示破折号，仍可按需浏览课程报告。'],
    ['09-scope-failure-injected-desktop-first', '归属核验失败 · 首屏 · 故障注入', '报名映射读取失败，旧档案和统计停止显示，提供重试。'],
    ['10-withdrawn-real-first', '课程与报名失效 · 首屏 · 真实 API', '确认撤回或移除后，相关作品、反思、评价和统计及时清除。'],
    ['14-empty-real-first', '新学生无作品 · 首屏 · 真实 API', '课程参与不等于成果，项目、迭代、反思、评价为真实零计数。'],
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
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第七轮 · 成长档案与成果浏览</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f0e5c8;color:#102d40;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}header{background:#102d40;color:#fff9e9;padding:32px max(24px,calc((100vw - 1260px)/2))}header p{max-width:1000px}h1{font-size:30px;margin:0}a{color:#08766e}header a{color:#bceadb}main{max-width:1308px;margin:auto;padding:24px}nav{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.filters{display:flex;gap:10px;flex-wrap:wrap;padding:14px 0}button{font:inherit;padding:8px 16px;border:2px solid #102d40;color:#102d40;background:#fff9e9;cursor:pointer}button[aria-pressed=true]{background:#08766e;color:white}button:focus-visible,a:focus-visible{outline:3px solid #b36816;outline-offset:3px}section{scroll-margin-top:20px}h2{margin-top:44px;border-bottom:2px solid #baa984;padding-bottom:10px}article{padding:20px;background:#fff9e9;border:1px solid #c7b78e;margin:24px 0}h3{margin:0}article p{margin:6px 0 18px;color:#526974}.images{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;min-width:0;max-width:100%;flex:1 1 300px}figure[data-size="390"]{max-width:390px}figure[data-size="768"]{max-width:768px}figure[hidden],article[hidden],section[hidden]{display:none}img{display:block;max-width:100%;height:auto;border:1px solid #a4b4b2;background:white}figcaption{font-size:13px;color:#526974;margin-top:6px}footer{padding:30px 0;color:#526974}@media(max-width:560px){main{padding:16px}article{padding:12px}h1{font-size:25px}}
</style></head><body><header><h1>成长档案与成果浏览 · 第七轮视觉验收</h1><p>沿用「晴空观测站」。${files.length} 张本地 Edge 实际截图，使用隔离临时 SQLite 与合成教学内容；不代表正式课程，未改动开发数据库或历史截图。真实 API、故障注入和汇总契约边界分别标注。首屏从顶部截取，内容区为操作、滚动后的视口；所有图片均未裁切或修图。</p><a href="../round-07.md">交付说明</a> · <a href="../round-04/index.html">第四轮首页与地图</a></header><main><nav aria-label="页面分类">${groups.map(([heading], i) => `<a href="#group-${i}">${heading}</a>`).join('')}</nav><div class="filters" role="group" aria-label="截图尺寸"><button data-filter="1440" aria-pressed="true">桌面 1440×900</button><button data-filter="768" aria-pressed="false">平板 768×1024</button><button data-filter="390" aria-pressed="false">窄屏 390×844</button><button data-filter="all" aria-pressed="false">全部尺寸</button></div>${sections}<footer>来自真实页面与交互，不使用整张图片代替页面。重新采集先设置 ROUND7_CAPTURE_DELIVERY=1，再运行 npm run test:e2e:round7 和 node scripts/build-round7-gallery.mjs。</footer></main><script>
function filter(size){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===size)));document.querySelectorAll('figure').forEach(f=>f.hidden=size!=='all'&&f.dataset.size!==size);document.querySelectorAll('article').forEach(a=>a.hidden=!a.querySelector('figure:not([hidden])'));document.querySelectorAll('main section').forEach(s=>s.hidden=!s.querySelector('article:not([hidden])'));}document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>filter(b.dataset.filter)));filter('1440');
</script></body></html>\n`);
console.log(`Generated gallery with ${files.length} screenshots.`);
