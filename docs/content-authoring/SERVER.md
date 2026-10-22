# 服务器交接：先部署代码，再按需执行；本轮未操作正式站

## 是否需要导入

**不需要导入课程、学生、金币或徽章数据，也没有正式素材替换包。**本轮内置主题素材沿用仓库现有文件，随前端构建发布；新上传的文章和图片保存在服务器UPLOAD_PATH，必须保留整个目录。私有验收文章ZIP只是可选内容输入，不自动导入任何真实课程。

必须先部署本分支配套后端和前端，再使用新填写接口/文章块/实验室设置。Node须≥22.12.0（本轮实际26.2.0），沿用锁文件 `npm --prefix backend ci`、`npm --prefix frontend ci` 并构建前端。不要只复制几个脚本后直接在旧版本运行；代码依赖命名扩展和新文章渲染器。

## 维护窗口顺序

1. 在服务器确认真实DB_PATH、UPLOAD_PATH、反馈上传目录、当前Git SHA与Node版本。保留环境变量、JWT及密钥，不发到公开日志或ZIP。
2. 停止旧服务写入。用SQLite在线备份API或运维SQLite `.backup` 生成独立数据库备份；不要只复制仍有WAL的主文件。对上传目录、反馈目录、用户覆盖素材、环境配置做私有备份，记录哈希与时间。
3. 在隔离副本部署新代码，先运行已有核心兼容迁移至当前基线1036，再检查完整性和外键。`backend/database/migrate.js` 会在现有数字迁移后幂等应用 `content-authoring-v1`。本轮没有预占数字迁移编号，没有改名洗掉记录、清空migration表或重建教学库。
4. 核对隔离副本教学表、附件与旧记录，再进入真实库维护窗口。确认备份可恢复后才启动配套新后端。前端同时发布同一构建；不要让旧前端维护新的rich文章。
5. 管理员验收登录、课程/课时保存、有效报名学生读取、卡片报告与金币；核对原上传文件下载。无需导入测试数据。
6. 如果星海远航实际主题仍正确，不执行主题修复。若被覆盖，先按下面指定ID预演并人工核对，再选择执行。

## 命名扩展工具

```text
node scripts/content-authoring-migrate.cjs --db /absolute/private/teaching.db
node scripts/content-authoring-migrate.cjs --db /absolute/private/teaching.db --apply --offline-confirm --backup /private/backup/before-authoring.sqlite
node scripts/content-authoring-migrate.cjs --db /private/backup/before-authoring.sqlite --restore-copy /private/rehearsal/restored.sqlite
```

默认只读，旧库低于1036时拒绝跳过核心升级；`--apply`只负责命名扩展，不修改数字迁移记录。`--backup`与恢复副本必须是不存在的新文件。扩展仅新增可空 `lessons.cards_required`、`course_lab_settings` 和命名标记表；旧字段与旧记录保留。已有同名字段类型/值或表结构不兼容会停止，不自行改写数据。

应用启动也会幂等运行此扩展，因此备份必须在首次启动新代码**之前**完成。工具内备份是额外防线，不能替代部署前整环境备份。

## 存量远航专属主题定向恢复

先查明服务器真实课程ID与完整标题，不照抄验收库9001。默认只读：

```text
node scripts/restore-voyage-theme.cjs --db /private/teaching.db --course-id <真实ID> --expected-title "<精确标题>" --plan /private/plans/voyage.json
```

工具验证课程ID/标题、当前或审计中的旧voyage配置。若当前已被改成公共主题且审计无旧证据，需提供从可信旧包/备份导出的证据JSON：`{"courseId":实际ID,"presentation_theme":"voyage","sourceCommit":"核对过的提交SHA"}`，并同时传 `--legacy-evidence /private/evidence.json --evidence-sha256 <实际SHA256>`。不接受凭课程名称猜绑定。

默认保留所有自定义图片。**仅当确认桌面/手机自定义图覆盖了专属星空时**，在生成计划时额外传 `--use-built-in-backgrounds`；这只解除这两个绑定，不删除图片文件，不改封面、标识、关卡图和教学内容。

```text
node scripts/restore-voyage-theme.cjs --db /private/teaching.db --apply /private/plans/voyage.json --offline-confirm --backup /private/backup/before-theme.sqlite
node scripts/restore-voyage-theme.cjs --db /private/teaching.db --rollback /private/plans/voyage.json.receipt.json --offline-confirm --backup /private/backup/before-theme-rollback.sqlite
```

执行前后校验源散列与修订；配置已变化则拒绝覆盖。回执路径已存在则停止，避免重复执行。回滚只恢复主题字段和绑定，继续提升主题修订号；封面、内容、报名、学习与奖励不动。计划和回执含课程配置，只私有保存。

本机两份持久库备份里9001均已为voyage，未发现自定义覆盖，因此没有改原库。工具在隔离旧库验证了新课程拒绝、重复执行拒绝、备份恢复及主题回滚。

## 回滚与备份恢复

- 主题问题优先使用定向回执回滚，不恢复整库。
- 命名扩展是可空加列与独立表，不提供破坏式DROP/down迁移。若在新版本尚未产生任何写入时要完全回退，可停止服务，在新路径恢复部署前数据库及配套上传/配置，核验后切换旧代码与路径；不要覆盖在线DB。
- 一旦有新图文、实验室设置或新任务配置写入，不能直接切旧前端/旧库，否则会丢失新写入或无法显示rich文章。应保留新库，先修复问题；如必须回退，先备份新库和新上传，人工核对导出新写入，制定恢复窗口。
- 恢复副本先 `integrity_check=ok`、`foreign_key_check`无结果，再比较教学/报告/作品/金币/徽章表及附件哈希；从恢复副本启动隔离服务验证后才切实际路径。

## 复验命令

```text
npm run lint
npm test
npm --prefix frontend run build -- --outDir ../build/content-authoring
node --test --test-concurrency=1 tests/content-authoring.api.test.js tests/content-authoring-tools.test.js
node --test tests/content-authoring.browser.test.js
node scripts/preview-content-authoring.mjs
```

浏览器测试需Playwright与Edge，设置 `PBL_REGRESSION_DIST=build/content-authoring`。新文章接口测试需本机用户原文章目录；在不含私有材料的机器请自行提供等价授权文章，不将真实图片提交仓库。详细实际结果、首次失败与修复见VALIDATION.md。

已有课程包v1保持原结构化文章格式；本轮不扩展课程包格式以输出rich文章或实验室设置。不要把新的rich块强塞进旧manifest；请用新文章导入入口。此限制不影响现有课程包及旧教学数据恢复。
