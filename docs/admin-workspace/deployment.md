# 本地启动、迁移与恢复边界

本轮仅更新本地和自己的仓库，未部署公网、未向上游提 PR。只追加 `1029_course_workspace.sql`；不改已发布的 1027/1028，不清迁移历史，不 seed/reset。

## 本次已执行

- 基线：只读拉取上游 `b862a16e4c8b8ac24cd4a9cf82041bf7ea9a7b0a`，与自己的 `15df35d` 内容一致，在 `feat/admin-course-workspace` 开发。
- 停止原本地验收服务，联合备份到 `.local/acceptance-before-workspace-20261017`，包含数据库、上传、反馈附件和私有配置。原有 1 条缺失文件引用原样保留。
- 恢复两个隔离副本，一个升级并重复迁移，一个保持 1028 验证恢复。逐表逐旧列对比 85 表、165 行，所有原字段与文件哈希一致。
- 原验收环境为 `.local/acceptance-20261016`；升级后比较时仅排除正常轮换的 `refresh_tokens`，其余 84 表、160 行和附件保持一致。AI enabled=0。没有向其中导入本轮合成课程。
- 前两轮交接压缩包未覆盖；SHA256 分别仍为 `3017d49f462bd797cbb3abd1f0f799be507aa2f25db7564cbaddd07e00a4ee7a`、`b5ac0ad5b5c08c74c05246d2bf59e6abae723c191f4a5601608a5a62ae3c485f`。

## 迁移内容

`courses` 增加真实学习目标、自动地图标记、背景不透明度和主题修订计数；增加主题图片及当前用途绑定表。旧课程自动地图标记为 0、目标为空、图片绑定为空；原十关、课时 ID、图片、章节、教材、金币、徽章、礼品及订单不迁移。

新建课程由现有创建接口明确写入自动地图标记并保存草稿；新增/取消/排序课时在原服务事务中同步地图。没有自动新增教材或章节。模板是现有 presentation_type 枚举的表单引导。

主题图片为不可变文件，上传保存与用途绑定保存分开。更换/移除不删历史文件；旧封面入口更改封面时解除当前主题封面绑定，避免旧图被误显示为当前封面。

## 本机复验启动

工作目录：`C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`。复用当前锁文件和依赖。实际使用 Node 26.2.0，Windows/Edge；没有声称验证 Linux 正式服务器。

```powershell
$env:PATH='D:\NodeJS\node-v26.2.0-win-x64;'+$env:PATH
npm run build:teaching
node scripts/teaching.mjs start --data .local/acceptance-20261016
```

已运行服务时不要重复启动；使用现有 `http://127.0.0.1:4185`，API 为 `http://127.0.0.1:3155/api`。本地验收账号是原 `review_admin`、`review_student`；凭据保存在私有 `.local/acceptance-20261016/acceptance-accounts.json`，没有写入 Git。普通启动不会初始化教学数据。新建课程验收截图来自独立合成库，正式教材不在这些截图中。

## 将来部署前的明确步骤（本轮未执行正式站）

1. 取自己的验收提交，保留目标服务器原配置，按锁文件安装/构建，不复制本地教学库或密钥。
2. 停止业务写入，确认目标 DB/上传/反馈目录，做联合备份。不要把备份放进上传目录。
3. 用新代码中的原维护脚本先只读查看待迁移项：

```text
node scripts/lesson-maintenance/schema.cjs --db <目标库绝对路径> --dry-run
```

4. 将原库副本与附件副本放在隔离目录，演练追加迁移、重复执行、完整性检查及恢复。确认仅多出 1029，未变更旧内容。
5. 维护窗口内明确应用（备份目标必须是新的私有目录）：

```text
node scripts/lesson-maintenance/schema.cjs --db <目标库绝对路径> --uploads <上传目录绝对路径> --feedback <反馈目录绝对路径> --backup-dir <新的私有备份目录> --apply --maintenance-confirmed
```

6. 使用匹配新 schema 的后端启动，再发布前端。核对 `/api/health` schema_version=1029、管理员/学生权限、原课程文件与旧版本，以及新建草稿/主题/地图链路。
7. 若回滚应用，应同时恢复配套数据库和附件到新目录并核对路径，再人工切换；不要删迁移记录或用旧代码盲开新库。私有备份及恢复目标不得提交仓库。

迁移脚本从当前源码读取全部追加 SQL；旧压缩包内的脚本与代码仍是上一轮版本，不要只拿旧包期待出现本轮界面。本轮没有新的教材导入包，也不要求重导原课程。
