# 第 2 步迁移、本地预览和恢复

## 本轮追加结构

只新增 `1030_course_managers_schools.sql`；未修改 1029 或更早迁移，不改迁移记录、不 seed/reset，不重建课程或学校。新增课程管理关系/审计、学校申请/管理关系/审计、导师建号幂等记录共 6 张表，以及自建课程初始授权触发器。

旧课程创建导师、任一课时授课导师按旧合法规则一次性去重回填；不改创建者、授课人、课时/卡片 ID、教材、成绩、金币、徽章和礼品。`legacy_creator` 优先于同课程同人的 `legacy_instructor`，两者都保留明确来源；无关导师不增加管理权。后续调整授课人/创建者不自动授权，重复迁移不复活已撤销关系。新自建课程触发器在创建事务内建立显式初始授权并审计，之后同样可以由管理员撤销。

学校管理关系初始为空；没有自动认领现有学校、自动批准申请或合成教学内容。

## 本次实际数据保护

先停本任务原预览服务，再联合备份数据库、uploads、feedback、私有配置到 `.local/acceptance-before-authorization-20261017`。保留原 1 条缺失附件引用，不造文件补齐。

恢复到 `.local/authorization-upgrade-rehearsal-20261017` 和 `.local/authorization-restore-rehearsal-20261017` 两个独立目录。升级、重复迁移和恢复比较均保留原 87 张表、166 行的所有旧字段及所有附件哈希；原 AI enabled=0。

对原验收环境先执行维护脚本 dry-run，确认只待追加1030，再用 `--apply --maintenance-confirmed` 执行；脚本额外联合备份到 `.local/authorization-cli-backup-20261017`。本地旧字段/文件逐项对比一致，正常会话轮换表除外的 86 表、161 行保持。前两轮交接压缩包原件及其 SHA256 未变。

只读兼容清单输出在本地私有 `.local/authorization-legacy-inventory.json` 和 `.local/authorization-explicit-inventory.json`，未提交；也可在管理员授权审计中核对。只读工具不加载应用配置、不触发迁移：

```text
node scripts/course-manager-audit.cjs --db <旧库或升级库路径>
```

输出包含内部账号关系，应保存在私有目录，不公开上传。

## 已启动本地预览

原教学验收环境仍为 `.local/acceptance-20261016`，前端 `http://127.0.0.1:4185`，API3155；原账号/凭据未改。

另有操作验收副本 `.local/authorization-review-20261017`，前端 `http://127.0.0.1:4186`，API3156。它来自本轮备份，独立数据库/附件/密钥，额外建立两位未授权导师供界面验收；没有预建学校申请、班级、学生或替用户批准。账号密码只保存在该目录私有 `acceptance-accounts.json`，不要提交或共享到公开仓库。操作副本的变化不回写原教学环境。

工作目录：`C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`，Node26.2.0、原锁文件。服务已运行时直接访问，不重复启动。需要复启：

```powershell
$env:PATH='D:\NodeJS\node-v26.2.0-win-x64;'+$env:PATH
npm run build:teaching
node scripts/teaching.mjs start --data .local/acceptance-20261016
# 独立操作验收副本：
node scripts/teaching.mjs start --data .local/authorization-review-20261017
```

普通启动不初始化/seed；两个服务均只监听本机，其他电脑不能直接用此127.0.0.1地址访问。

## 将来服务器部署顺序（本轮未部署）

1. 取本轮验收提交，先核对目标 schema、旧关系清单与真实 DB/上传/反馈目录；不要复制本地账号、数据库、私有日志和密钥到服务器。
2. 停业务写入，保留服务端配置。使用匹配代码先 dry-run：`node scripts/lesson-maintenance/schema.cjs --db <目标库> --dry-run`。
3. 用联合备份恢复到隔离副本，验证1030升级、重复执行、外键/完整性、旧导师来源、撤销不复活和原文件可读。目标库若另有迁移编号或结构先核对，不直接改编号。
4. 维护窗口明确执行：`node scripts/lesson-maintenance/schema.cjs --db <目标库> --uploads <上传目录> --feedback <反馈目录> --backup-dir <新的私有备份目录> --apply --maintenance-confirmed`。备份目录不可存在或位于上传目录内部。
5. 先启动匹配1030的后端，再发布前端；核对 health=ready/schema1030、管理员授权、旧导师课程、下载、旧令牌撤销、学校申请和新学生强制改密。AI维持原启用状态。
6. 需回退时停写，恢复配套备份的数据库与附件到新目录核对后人工切换应用；不能仅回退前端、删除迁移记录或用旧代码盲开新库。原账号/授课信息没有改写，恢复1029联合备份可恢复原权限模型。

本轮没有新的教材导入包。第 3 步课程奖励归属及可选勋章仍待安排，不应把本轮代码当作第三步完成版。
