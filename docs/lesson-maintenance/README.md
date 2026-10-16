# 课时维护、关卡图片与学生文案交接

本轮以只读上游 `dc5aa36dd50f6a553b157e0b028237acac440414` 为基线，在自己的 `feat/lesson-maintenance-copy` 分支实现。原本地 `integration/real-gift-redemption@85b0c4d` 与真实礼品功能保留。仅推送自己的仓库；不创建/重开上游 PR，不修改正式数据库，不开启 AI。

- [管理员操作指南](admin-guide.md)：逐课时教材、上传、保存、就绪、版本，以及学生文案点选和发布
- [诊断结论与边界](diagnosis.md)：线上事实、本地复现、未核实项分列
- [服务器迁移与导入](server-guide.md)：备份、预检、新代码、schema、目标图片/文案导入、恢复
- [验证记录](verification.md)：实际执行、首次失败及复验
- [素材与浏览器截图入口](index.html)：同组参照、浅深底和真实页面，证据在本地 evidence 目录
- [拟提交上游的 PR 描述](PR-description.md)：供后续统一提交，本轮不代为提交
- 文案覆盖清单：`content/student-copy/pages.json`（29 个页面组）、`coverage.json`（源文件绑定）、`catalog.json`（管理界面检索 ID）

代码交付不等于正式站已经升级。正式站的 25 项内容身份、第四课时真实 ID 和部署 SHA 仍须服务器同学用只读预检确认；导入模板故意留空，不猜测目标。本轮截图中的账号、课程和教材均为隔离合成验收数据。

启动与复验（仓库根目录，依赖沿用锁文件）：

```sh
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run lint
npm test
npm run test:backend
npm run build:teaching
node --test tests/lesson-maintenance.browser.test.js
```

浏览器回归需要本机 Edge/Playwright 运行条件，自动创建独立 SQLite、随机测试凭据与本地端口 3394/4424，不连接教学旧库。不应对真实库运行 `db:init`、`db:reset` 或测试 fixture。

若启动隔离副本人工验收，先按服务器指南恢复到全新目录，显式配置 `DB_PATH`、`UPLOAD_PATH`、`FEEDBACK_UPLOAD_PATH` 及私有鉴权配置，再运行现有 server/dev；禁止让默认环境变量指向真实教学库。
