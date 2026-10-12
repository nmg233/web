# 上游整合与真实奖励交付

本轮在隔离分支 `integration/upstream-reward-pr` 将 `nmg233/web/main@681328d24f9ece352305cb3ebc2e71170b2e296e` 合入现有像素改版与真实兑换提案。原仓库 main 仅作为读取和 PR 目标，没有直接推送或合并，也没有切换公网。

本轮保留上游教材版本绑定、报告历史、补学、账号批次、组织转移、通知 outbox、健康检查、部署备份工具和三维回放；保留已有课程空间、像素界面、人工文案、教材上传与防丢稿、开放反思、真实签到/课时金币、徽章和真实礼品兑换。

- [实际验证记录](验证记录.md)：仅记录本次合并后执行的检查。
- [权限、版本及迁移说明](取舍与迁移说明.md)：兼容旧库的方式及明确的业务取舍。
- [本机截图入口](index.html)：真实浏览器截图，隔离合成数据。
- [奖励管理操作指南](../real-redemption/管理员操作指南.md)：录入礼品、上传、预览、兑换、发放及通知恢复。
- [真实教材录入指南](../lesson-authoring/真实教材录入使用指南.html)：填写、上传、保存、发布；本轮角色变化见迁移说明。

正式礼品仍由管理员录入，空库不会生成礼品、价格、金币或订单。截图中的测试课程与礼品属于隔离验收数据。旧演示数据独立保留，不转为真实资产。

## 本机复验

```powershell
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run lint
npm test
node --test --test-concurrency=1 backend/test/*.test.js
npm run test:teaching
npm run build:teaching
```

浏览器专项及旧库验证命令见验证记录。真实试飞需要显式配置可用的 `GLIDER_PYTHON`；隔离测试不创建或覆盖正式教学库。已有持久环境使用 `npm run teaching -- start`，不要重新初始化或 seed。

本轮不自动将整合代码替换到正在使用的教学实例。正式升级仍须备份、核对部署环境并人工验收；新库不能直接连接不认识兑换支出的旧代码回滚。

完成 PR 更新后停止，等待复核。
