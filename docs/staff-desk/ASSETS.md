# 静态素材与组件交接

正常发布时，校园静态图片、字体、书桌 CSS 与像素 SVG 组件已随仓库和前端构建发布；**不需要数据库素材导入，也不需要额外解压**。

另生成本地离线核对包：`deliverables/工作台与使用指南-2026-10-20/校园静态素材与书桌组件.zip`。
SHA-256：`04dcc2a7113106aeabb4c71f81e44c9b86005279751db97cf7766c08f6e92742`。

包内 10 个白名单源文件，加 manifest.json 与说明：

- 原有 staff-campus 五张静态校园图，保持原文件与原画风。
- ChillReunion-Round 字体及 OFL/原说明。
- StaffPixelIcon.jsx 和 desk.css，供核对图标、书桌结构与色彩。

脚本逐文件登记长度、SHA-256，生成后重新打开 ZIP 校验 CRC 和各文件 SHA；实际生成验证通过。包内没有场景动效播放器、教学数据、上传文件、账号或密钥。JSX/CSS 需要匹配版本仓库与依赖，ZIP 不是可独立运行的网页或服务器安装器。

重建命令（全新输出文件，禁止覆盖）：

```powershell
python scripts/package-staff-desk-assets.py --output '<全新输出ZIP的绝对路径>'
```

[生成脚本](../../scripts/package-staff-desk-assets.py)。源素材和组件已在代码中，自己的仓库不需要提交重复二进制 ZIP；本地 ZIP 用于本次离线交接。
