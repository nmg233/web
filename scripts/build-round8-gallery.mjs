import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = path.resolve(import.meta.dirname, '../docs/round-08');
const groups = [
  [
    "礼品与徽章",
    [
      [
        "01-gifts-demo-first",
        "礼品陈列架 · 默认首屏",
        "实际本地演示初始值 120；三种礼品沿用原数值，库存只属于本账号。"
      ],
      [
        "02-empty-records-demo-first",
        "首次进入 · 空兑换记录",
        "初始化没有虚构兑换记录。"
      ],
      [
        "03-ledger-initial-demo-first",
        "初始积分明细",
        "初始条目没有虚构发放时间或学习来源。"
      ],
      [
        "04-badges-demo-first",
        "两枚演示徽章",
        "获得状态保持配置中的一项已获得、一项未获得；图案为原创演示视觉稿。"
      ],
      [
        "05-badge-earned-demo-modal",
        "已获得徽章详情",
        "明确是预置演示状态，不代表真实学习评价。"
      ],
      [
        "05-badge-unearned-demo-modal",
        "未获得徽章详情",
        "正式获得条件仍待制定，没有虚构进度或日期。"
      ]
    ]
  ],
  [
    "兑换流程",
    [
      [
        "06-gift-detail-demo-modal",
        "礼品详情",
        "查看用途、需要的积分、本账号库存与限次；此时没有扣分。"
      ],
      [
        "07-confirm-demo-modal",
        "兑换确认",
        "单一弹窗流程；返回详情、关闭和 Esc 均可取消。"
      ],
      [
        "08-insufficient-demo-modal",
        "积分不足",
        "160 分模型当前还差 40 分，仍可查看详情。"
      ],
      [
        "09-out-of-stock-demo-modal",
        "库存不足",
        "演示贴纸库存为 0，保留具体原因。"
      ],
      [
        "10-write-failure-injected-modal",
        "写入失败 · 故障注入",
        "在隔离浏览器中让 setItem 抛异常；不扣分、不成功，重试复用同一编号。"
      ],
      [
        "11-success-demo-modal",
        "演示兑换成功",
        "实际保存到临时浏览器的本账号奖励键；不是发货或真实积分。"
      ],
      [
        "12-records-demo-first",
        "本次兑换记录",
        "成功后跳到兑换记录并标记本次记录。"
      ],
      [
        "13-ledger-demo-first",
        "兑换后的积分明细",
        "+120 初始值与 −40 演示消耗，时间统一为北京时间。"
      ],
      [
        "14-limit-demo-modal",
        "已达限次",
        "笔记本已兑换两次，原本账号限兑规则不变。"
      ]
    ]
  ],
  [
    "存储异常与重置",
    [
      [
        "15-storage-getter-injected-first",
        "无法获取存储 · 故障注入",
        "已登录奖励页模拟 localStorage getter 拒绝。顶栏显示 —，正文显示暂不可读取，列表保留但兑换暂停。"
      ],
      [
        "16-read-failure-injected-first",
        "读取失败 · 故障注入",
        "getItem 抛异常；恢复权限后重试可读取原记录。"
      ],
      [
        "17-corrupt-injected-first",
        "损坏数据 · 故障注入",
        "隔离奖励键写入损坏 JSON；不自动删除，重置必须确认。"
      ],
      [
        "18-reset-demo-modal",
        "重置确认",
        "只清除当前账号在本浏览器的奖励记录，不影响学习或其他账号。"
      ],
      [
        "19-reset-failure-injected-modal",
        "重置失败 · 故障注入",
        "removeItem 抛异常；保留弹窗和原因，恢复后可重试。"
      ],
      [
        "20-long-records-fixture-scrolled",
        "长标题与分页 · 布局夹具",
        "仅向隔离浏览器注入十一条历史记录验证换行与第二页；不是通过当前兑换规则生成的记录，不代表正式数据。"
      ]
    ]
  ]
];
const files = readdirSync(path.join(directory, 'screenshots')).filter((name) => name.endsWith('.png')).sort();
const sections=groups.map(([heading,items],i)=>`<section id="group-${i}"><h2>${heading}</h2>${items.map(([prefix,title,caption])=>{const matching=files.filter(f=>f.startsWith(prefix));if(matching.length!==3)throw Error(`Expected 3 sizes: ${prefix}`);return `<article><h3>${title}</h3><p>${caption}</p><div class="images">${matching.map(name=>{const png=readFileSync(path.join(directory,'screenshots',name)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);return `<figure data-size="${width}"><a href="screenshots/${name}" target="_blank" rel="noopener"><img src="screenshots/${name}" width="${width}" height="${height}" loading="lazy" alt="${title}，${width}×${height}"></a><figcaption>${width}×${height} · 原始视口截图</figcaption></figure>`;}).join('')}</div></article>`;}).join('')}</section>`).join('');
const assets=[['gift-notebook','探索笔记本'],['gift-model','飞行模型'],['gift-sticker','探索贴纸'],['badge-record','记录一次发现'],['badge-iterate','尝试再改进']];
writeFileSync(path.join(directory,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第八轮 · 积分、徽章与礼品兑换</title><style>
*{box-sizing:border-box}body{margin:0;background:#f0e5c8;color:#102d40;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}header{background:#102d40;color:#fff9e9;padding:32px max(24px,calc((100vw - 1260px)/2))}header p{max-width:1050px}h1{font-size:30px;margin:0}a{color:#08766e}header a{color:#bceadb}main{max-width:1308px;margin:auto;padding:24px}nav,.filters{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}button{font:inherit;padding:8px 16px;border:2px solid #102d40;color:#102d40;background:#fff9e9;cursor:pointer}button[aria-pressed=true]{background:#08766e;color:white}button:focus-visible,a:focus-visible{outline:3px solid #b36816;outline-offset:3px}h2{margin-top:40px;border-bottom:2px solid #baa984;padding-bottom:10px}article{padding:20px;background:#fff9e9;border:1px solid #c7b78e;margin:24px 0}h3{margin:0}article p{margin:6px 0 18px;color:#526974}.images{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;min-width:0;max-width:100%;flex:1 1 300px}figure[data-size="390"]{max-width:390px}figure[data-size="768"]{max-width:768px}figure[hidden],article[hidden],section[hidden]{display:none}img{display:block;max-width:100%;height:auto;border:1px solid #a4b4b2;background:white}figcaption{font-size:13px;color:#526974;margin-top:6px}footer{padding:30px 0;color:#526974}.asset-grid{display:flex;flex-wrap:wrap;gap:16px}.asset-grid a{flex:1 1 180px;background:#fff9e9;padding:20px;border:2px solid #102d40;display:flex;align-items:center;flex-direction:column;gap:12px}.asset-grid img{width:128px;height:128px;border:0;background:transparent;image-rendering:pixelated}.asset-grid small{color:#526974}@media(max-width:560px){main{padding:16px}article{padding:12px}h1{font-size:25px}}
</style></head><body><header><h1>积分、徽章与礼品兑换 · 第八轮视觉验收</h1><p>沿用「晴空观测站」。${files.length} 张 Edge 实际页面截图，覆盖三种尺寸、四个标签和关键弹窗。所有奖励仅为当前浏览器的本地演示，不代表真实积分、荣誉或发货。使用独立浏览器、合成账号和临时数据库；故障注入与历史布局夹具分别标注。截图未裁切或修图，旧轮次图集保留。</p><a href="../round-08.md">交付与验证说明</a> · <a href="../round-07/index.html">上一轮成长档案</a></header><main><section id="assets"><h2>五个原创像素图案 · 演示视觉稿</h2><p>128×128 SVG，整数坐标、阶梯轮廓、透明背景；不含文字与交互。点击查看可编辑素材源文件。</p><div class="asset-grid">${assets.map(([id,title])=>`<a href="../../frontend/public/assets/pixel-v1/rewards/${id}.svg"><img src="../../frontend/public/assets/pixel-v1/rewards/${id}.svg" alt="${title}演示图案" width="128" height="128"><strong>${title}</strong><small>项目原创 SVG · 演示</small></a>`).join('')}</div></section><nav aria-label="页面分类">${groups.map(([h],i)=>`<a href="#group-${i}">${h}</a>`).join('')}</nav><div class="filters" role="group" aria-label="截图尺寸"><button data-filter="1440" aria-pressed="true">桌面 1440×900</button><button data-filter="768" aria-pressed="false">平板 768×1024</button><button data-filter="390" aria-pressed="false">窄屏 390×844</button><button data-filter="all" aria-pressed="false">全部尺寸</button></div>${sections}<footer>重新采集：设置 ROUND8_CAPTURE_DELIVERY=1 后运行 npm run test:e2e:round8，再运行 node scripts/build-round8-gallery.mjs。普通回归只写 test-results，不更新此图集。</footer></main><script>function filter(size){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===size)));document.querySelectorAll('figure').forEach(f=>f.hidden=size!=='all'&&f.dataset.size!==size);}document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>filter(b.dataset.filter)));filter('1440');</script></body></html>\n`);
console.log(`Generated gallery with ${files.length} screenshots and 5 original SVGs.`);
