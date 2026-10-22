# 1036 升级、备份与恢复

本轮没有操作正式站或持久教学库。下列步骤供获准发布时使用，不能把本地预览测试当作正式部署完成。

## 变化与兼容

新增 `1036_staff_desk_school_grants.sql`：直接学校授权表及工作台查询索引。不修改、清空或重建旧表，不更改上游已发布迁移编号，不清空 schema_migrations。历史学校申请授权与直接授权是两个可核对的来源，原申请及审计记录继续保留。新表初始为空，不给任何 mentor 自动发权。

从 1034 升级时须连同上游 1035 的发布审批迁移一起执行；1035 旧库只需新增 1036。原 migrationBridge 和身份一致性检查继续执行，编号同义核验失败必须停下核对备份。空库、1034、1035、重复升级、备份与隔离恢复均有自动化验证。

本轮无需导入学校、课程、人工文案、上传文件、正式礼品或素材；**不要运行 database/init.js 来升级旧库**。预览账号及测试课程绝不能导入正式库。

## 维护窗口操作（尚未在正式环境执行）

1. 运维先确认实际部署制品源码 SHA、数据库路径、UPLOAD_PATH 与 FEEDBACK_UPLOAD_PATH。公开 health 的旧 release 标记与 UI 存在差异，不能仅凭该标记选择回滚代码。
2. 停止业务写入，保存原部署代码/配置，备份数据库和两类附件到全新的私有目录。备份禁止放到 uploads/反馈附件目录内，不能位于可公开下载的网站目录。
3. 在匹配本轮源码与锁文件依赖的目录执行以下命令。示例中的路径必须替换为真实绝对路径；没有私有反馈目录时应人工核对实际配置，不能盲目忽略反馈附件。

```powershell
$databaseFile='<数据库绝对路径>'
$uploadsRoot='<UPLOAD_PATH绝对路径>'
$feedbackRoot='<FEEDBACK_UPLOAD_PATH绝对路径>'
$backupRoot='<全新私有备份目录>'
node scripts/lesson-maintenance/backup-only.cjs --db "$databaseFile" --uploads "$uploadsRoot" --feedback "$feedbackRoot" --to "$backupRoot" --maintenance-confirmed
node scripts/lesson-maintenance/verify-backup.cjs --from "$backupRoot"
node scripts/lesson-maintenance/schema.cjs --db "$databaseFile" --dry-run
```

4. 阅读 dry-run 的 pending 与迁移身份；只在已完成备份并停止写入时应用。`--backup-dir` 必须是另一个全新私有目录，脚本会再生成一致性备份，不覆盖第 3 步备份。

```powershell
$migrationBackup='<另一个全新私有迁移备份目录>'
node scripts/lesson-maintenance/schema.cjs --db "$databaseFile" --uploads "$uploadsRoot" --feedback "$feedbackRoot" --backup-dir "$migrationBackup" --maintenance-confirmed --apply
node scripts/lesson-maintenance/verify-backup.cjs --from "$migrationBackup"
node scripts/lesson-maintenance/schema.cjs --db "$databaseFile" --dry-run
```

5. 第二次 dry-run 应无 pending；完整性与外键校验通过。确认原课时、人工正文、报名、成绩、金币、附件校验摘要及原迁移记录未被改写，直接授权表初始为空。发布前端构建和匹配后端后，health 应为 database ready、schema_version ≥1036，并报告准确 release SHA。部署健康脚本的模拟回归也随之更新到 1036；本轮未执行该脚本部署正式站。
6. 手动核验管理员、mentor、学生、教师权限与原课程后再结束维护。需要新学校授权时由管理员在界面逐条输入，不通过迁移自动填充。

## 回滚与恢复

失败时保持停止业务写入，保留失败库、审计及附件，禁止清空迁移记录后重跑。备份校验和恢复副本命令：

```powershell
$restoreRoot='<全新私有恢复副本目录>'
node scripts/lesson-maintenance/verify-backup.cjs --from "$backupRoot" --restore-copy --to "$restoreRoot"
```

此命令仅创建隔离恢复副本，核验 DB/文件摘要并把附件绝对路径映射到恢复副本，不替换源数据库、不切换正式服务。使用与备份 schema 匹配的原部署代码，以显式 DB_PATH/UPLOAD_PATH/FEEDBACK_UPLOAD_PATH 在隔离端口验证；经运维批准后才进行实际切换。本轮没有执行正式切换。

仅退回前端会留下新授权业务，旧后端又不识别直接学校授权，因此不能把“删掉1036文件”当回滚。完整回滚应在维护窗口使用代码与联合备份的一致快照；维护期间若发生新写入，先清点和保全增量，不能直接覆盖以免丢数据。迁移不提供破坏性 down.sql。

## 验证边界

真实执行的是合成 1034/1035 旧库、空库和临时附件副本测试。备份恢复验证包括 schema 版本、课程原文、旧迁移记录、重复升级、SQLite integrity_check 和 foreign_key_check；原教学环境没有升级、重建或导入。服务器实际目录、进程管理器及线上制品 SHA 仍需运维确认。

脚本源码：[备份](../../scripts/lesson-maintenance/backup-only.cjs) · [校验/隔离恢复](../../scripts/lesson-maintenance/verify-backup.cjs) · [只读预检/升级](../../scripts/lesson-maintenance/schema.cjs)。这些脚本依赖完整的匹配源码、迁移目录与锁文件对应运行时，不能只复制一个 SQL 或脚本就覆盖正式环境。
