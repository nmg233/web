# 管理端校园像素视觉交接

**课程标题错位已单独补修**：[修复后首屏/滚动截图与回归记录](title-patch/index.html)。本页及原图集保留为47de933历史交付；原检查漏查了相对标题与信息卡的重叠，本次布局验收以补修目录为准。

基线：`82b021bfbb23a31da21190e302f703fc747001ee`。分支：`feat/staff-campus-visual`。本轮承接原未提交草稿，仅提交自己的 `shrrrrrrrr/web-frontend-test`；不向上游提PR、不部署公网。

验收入口：[真实截图与前后对照](index.html) · [场景素材](art/index.html) · [17枚图标](icons.html) · [详细验证](verification.md) · [逐项结果](verified-scenes.json)

## 操作预览

- 新页面：<http://127.0.0.1:4192/dashboard>（浏览器安全端口，代理到原4190）
- 基线对照：<http://127.0.0.1:4191/dashboard>
- 隔离API：`127.0.0.1:3190`。服务均仅绑定本机，不是正式站，也不提供公网访问。
- 当前工作区：`C:/Users/shr/Desktop/nmg前端/.local/staff-campus-visual`
- 私有账号文件：`C:/Users/shr/Desktop/nmg前端/.local/staff-campus-visual/.local/staff-campus-review/acceptance-accounts.json`。`accounts.admin`为管理员、`accounts.mentor`为执行导师。密码从该文件读取；凭据不进入Git或本交付文档。
- 两个前端连接同一份隔离合成数据。请优先在4190操作；基线用于对照。真实教学环境、正式学校和旧4187服务未用于测试写入。

服务当前已启动。后续重新启动前，先用`Get-NetTCPConnection`确认3190、4190、4191、4192及对应进程；不要按端口盲目结束其他进程。依赖沿用本地已有junction，没有升级或重新安装。

```powershell
Set-Location -LiteralPath 'C:\Users\shr\Desktop\nmg前端\.local\staff-campus-visual'
$env:Path = 'D:\NodeJS\node-v26.2.0-win-x64;' + $env:Path
npm --prefix frontend run build -- --outDir ../build/staff-campus
# 仅在确认上述三个服务均未运行时启动：
Start-Process -FilePath 'D:\NodeJS\node-v26.2.0-win-x64\node.exe' -ArgumentList '.local/staff-campus-review/serve.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.local/staff-campus-review/preview.log' -RedirectStandardError '.local/staff-campus-review/preview-error.log'
# 仅在确认4192未运行时，另启安全端口别名：
Start-Process -FilePath 'D:\NodeJS\node-v26.2.0-win-x64\node.exe' -ArgumentList '.local/staff-campus-review/safe-preview.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.local/staff-campus-review/safe-preview.log' -RedirectStandardError '.local/staff-campus-review/safe-preview-error.log'
```

私有`serve.mjs`复用现有`private.json`和合成库，不重置它们。3190库和凭据、4190/4191构建及该本机服务脚本均不进Git。全新克隆可运行下面的自动回归创建独立临时验收库；不能拿正式数据库替代测试库。若系统临时目录被清理，先核查私有配置引用的库是否存在，再重新准备一个新的合成环境，不对教学库执行初始化。

4191原白屏已查明并修复：Windows路径分隔符导致静态文件未命中，JS请求获得HTML。已从基线提交只读导出前端、content和原渲染器，构建到本工作区`build/staff-campus-baseline`，私有服务改用规范化的`path.join`绝对目录；未修改上游或产品服务器。

4190原服务保留，但该端口在Fetch/浏览器安全端口表中会被拦截（直接HTTP返回200，Fetch报`bad port`）；因此最终给用户的入口为4192。代理只连本机原服务，不改API或数据。4192真实网页登录、五入口和校园类名已验证，3190/4191/4192健康检查均返回200。此前巡检和截图仍准确记录来源4190，不事后改写证据URL。

## 视觉和组件

- `StaffShell`仅为admin、academic_mentor挂载校园作用域；外壳始终校园。退出、切换角色时清除portal标志。teacher、新媒体和学生保持原样。
- `staff-campus.css`统一海军蓝、奶油阅读层、青绿主操作、金色强调、硬边、表格/表单/上传/页签/通知/下拉/弹窗/抽屉。背景、遮罩和内容分层，文字不随背景淡化。长表格在容器内滚动。
- `StaffPixelIcon`保留既有图标容器契约，17枚原生SVG仅作装饰。侧栏仍是原五模块，顺序、路由及收起/唤起不变；工作台仍为原十类业务入口。
- `Header`实测顶栏高度写入CSS变量，课程维护吸顶位置随换行调整。未移除sticky功能。
- 已有寒蝉团圆体真实加载，`font-synthesis:none`；不增加字体依赖。`StaffHeadingText`只替换目标角色标题中已知系统emoji装饰，仍使用原实时文案和编辑ID；手工文案存储未改。
- 点击目标保留hover、按下、键盘焦点反馈；禁用/loading不缩放，输入框、文本域、滑条及表格不整体缩放；reduced-motion取消位移，保留焦点和状态色。没有增加持续动画。
- CSS作用域在`.teaching-preview`和`.course-theme-preview`边界停止，独立学生预览仍显示课程自己的主题。为当前主题预览已有图片组件增加`priority`，保证预览移至折叠线下后仍及时加载；未改主题选择、上传和保存逻辑。

## 素材与官方通道

复用了草稿已有的两张原创横/竖校园母版，查看真实图片和校园参照后接入，没有追加生图。前端使用5个无损WebP变体；17枚图标是原生SVG。没有把整张图片作为页面或把文字、按钮烘焙进图里。

母版、提示词、来源、用途、尺寸、SHA及发布脚本在[art/manifest.json](art/manifest.json)。模型版本维持`null`，固定逻辑像素网格未获证明，不声称已验证固定网格。参考图只作风格/题材参考，不覆盖原件，也不将学校校徽加入画面。[素材校验](asset-verification.json)记录2母版、5发布图和17图标的实际SHA检查；5个WebP逐像素等于母版等比最近邻缩放结果，无滤镜造像素。

本机客户端核验：Codex的`ChatGPT.exe`和`codex.exe`数字签名有效，发行方/签名人为`OpenAI OpCo, LLC`；本机`auth_mode=chatgpt`，存在ChatGPT登录凭据，未配置API key、自定义提供方或`base_url`。未输出任何令牌或完整私有配置。本轮没有调用中转API、第三方模型或本机API key。此记录证明本机客户端及配置情况，不是特定模型计费账单的证明，也不补作对历史生图扣费来源的保证。

## 实际检查与边界

- lint通过；139项前端单测通过，0失败/跳过；产品构建和独立4190构建通过。
- 6个现行Edge浏览器套件共34个业务场景通过；Node计数40项包含6个父包装，0失败、0跳过。包含真实教材上传/保存、发布、学习与评审链路、409/503恢复、学校/观察权限、跨角色样式隔离及portal交互。
- 内置Browser实际巡检118条页面/尺寸组合；这不是118个业务测试。主图1440/768/390，补查1920、360和844×390横屏；发布36张代表截图，尺寸与SHA见[清单](screenshot-manifest.json)。
- 课时维护前后54个内容区按钮及链接、字段、六页签数组一致。仅该代表页面做了完整数组对照，未声称所有页面按钮都逐一数组比对。
- **旧管理员套件未通过**：`tests/admin-workspace.browser.test.js`仍使用基线前的主题Select，并预期“远航”为公共选项。当前基线是四个公共主题按钮；其旧发布数据也缺学校范围。原文件和场景保留，没有为了测试改生产权限。失败、局部适配试验和后续处理边界详见[验证记录](verification.md)。不能据此声称仓库所有历史测试已全绿。

未进行真机软键盘、Safari/Firefox或旧浏览器的视觉验收；当前`@scope`在本轮所用浏览器验收，其他浏览器待专项验证。AI页面只验收现有配置/界面，没有调用正式AI。后端和仿真无改动，本轮未运行全部后端/仿真套件；没有把历史通过数量当作本轮结果。

## 数据与回退

无数据库迁移、无数据导入、无正式教学材料或人工文案写入。后端、API、权限、奖励和金币规则、依赖及锁文件未改。代码仍使用原保存、上传、发布和评审事件；隐藏菜单从未代替后端授权。

需要回退视觉时，以本次提交为单位`git revert <本次提交>`，重新构建前端即可；不回滚数据库或教学数据。提交号及远端核验记录在对应deliverables交付说明中。到此停止，等待视觉验收，不进入上游PR或部署阶段。
