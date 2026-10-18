# mentor版本提交前验证

2026-10-18。应用功能基线为6271ba421ef56fc7aacac21c25fc5e119c41d8ed；本次随后只补交接资料、只读预检脚本和文档勘误，不改功能、锁文件、正式数据库或现有预览服务。

## 上游与合并检查

- 目标：nmg233/web的main；提交前读取为1d0de08fa16befeb25969978c71add0db38efd04，上轮管理员PR47已合并。
- 功能分支与目标共同基线为328353d1908b227e949ae6bb37e0c40936c964f1。
- `git merge-tree --write-tree refs/remotes/pr-upstream/main HEAD`演算无冲突；没有推送或合并上游main。
- 数据库只新增1032/1033/1034。已发布迁移、依赖清单和锁文件未改；不从本机导入账号、教材、金币、订单或真实附件。
- 审核新增路径和高置信密钥模式：未发现数据库、WAL、配置秘密、账号凭据、uploads或构建产物误提交。SQL审阅副本位于docs，不能被后端迁移器当成额外迁移执行。

## 本次实际运行

|检查|结果|
|---|---|
|`npm run lint`|通过|
|`npm test`|139通过、0失败、0跳过|
|`npm --prefix frontend run build -- --outDir ../build/pr-mentor-submit-20261018-131742`|通过；独立输出，没有替换现有教学预览构建|
|`node --test --test-concurrency=2 backend/test/*.test.js`|60个测试文件；463通过、0失败、0跳过|
|三套真实Edge浏览器回归|19个业务场景通过；Node22项含3个父测试；0失败、0跳过|
|交接预检、备份、恢复及迁移演练|33个核验场景通过；1031合成库恢复副本升级1034；93张原表旧列摘要不变|
|交接清单/迁移参考|清单10项大小与SHA256一致，3份SQL与后端实际文件相同|
|`node --check docs/mentor-workspace/server-handoff/scripts/preflight.cjs`及`--help`|通过|
|`git diff --check`|通过|

后端测试在PowerShell中枚举60个测试文件后传入Node。首轮因沙箱禁止本机HTTP连接（EACCES）失败；在获准的本地测试环境原样重跑通过，未通过修改产品或测试规避失败。

浏览器使用新独立构建，设置`PBL_REGRESSION_DIST=build/pr-mentor-submit-20261018-131742`、`PBL_PATCH_RUN=pr-submit-20261018`，清空各场景筛选变量，然后执行：

```text
node --test --test-concurrency=1 tests/mentor-patch.browser.test.js tests/observation-revocation.browser.test.js tests/lesson-authoring-patch.browser.test.js
```

三套分别覆盖教材/队列草稿与五尺寸预览9场景、反馈/申请/主题及教师权限8场景、旧观察关系撤销及迁校2场景。临时Express/SQLite与生成凭据均隔离，不读取本机验收账号或操作4187教学库。

## 交接和限制

本机完整输出保存在ignored目录`.local/pr-submit-20261018/`，不把原始测试产物或数据库提交Git。构建仍有原有大包及Login/Lab静态和动态混用导入提示。

正式服务器版本、路径、配置、缺失附件和学校/课程授权仍须现场核对，先按`server-handoff/部署步骤.md`在正式库恢复副本演练。1034暂存课程包异地恢复的staging_dir限制仍在；没有验证生产部署、Linux现场、正式AI、真机软键盘或生产负载。

本次只提交PR供审核，不自动合并、迁移正式库、部署公网或开启AI。
