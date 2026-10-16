# 服务器迁移、诊断与局部导入

本轮不执行生产写入。以下示例由服务器负责人在测试服务器先演练，再约定正式维护窗口。路径、真实课程/课时/学生/管理员 ID 均需自行核对；示例不是可直接盲跑的生产配置。

## 文件与运行前提

| 脚本 | 何时可运行 | 默认行为 |
| --- | --- | --- |
| `inspect.cjs` | 旧版也可；使用现有 backend 的 better-sqlite3 | 只读目标库；零写入，不加载 app/config、不迁移 |
| `backup-only.cjs` | 旧版也可；停止业务写入并确认维护窗口 | SQLite backup API + uploads + 可选私有反馈附件；不修改源库 |
| `verify-backup.cjs` | 旧版也可，或离线备份目录 | 校验 SHA、清单、完整性/外键；仅显式 `--restore-copy` 才创建全新隔离副本 |
| `schema.cjs` | 必须部署本分支完整新代码，backend 依赖已安装；服务先保持停写 | 默认只列 applied/pending；`--apply` 才联合备份并执行原迁移器 |
| `apply-plan.cjs` | 本分支完整新代码 + 1027/1028 成功之后 | 默认 dry-run；`--apply` 才联合备份和事务执行明确计划 |
| `audit-copy.cjs` | 开发环境有 frontend 依赖 | 更新绑定清单，不修改数据库，不是生产文案导入 |

独立交接包没有 node_modules。旧版只读/备份工具可在包内运行，设置 `LESSON_MAINT_APP_ROOT` 指向现有应用根目录来复用已安装的 SQLite 依赖；只解析依赖，不载入旧应用配置。`schema/apply-plan` 必须从部署后的新应用根目录运行，不能只拷贝两个 SQL/一个脚本到旧版就执行。

交接包包括脚本、两个新迁移、素材母版/发布变体、SHA 清单、空目标计划模板和本指南；不含真实学生、数据库、上传照片、密码、JWT、生产配置或 AI 密钥。代码另由自己的分支交付。PR 合入和部署是两回事；本轮只提供拟 PR 描述，不代为提交上游。

## 先备份，再只读预检

Linux 示例，先替换真实绝对路径。`DB` 要指向 SQLite 主库，不能选 `.db-wal`；`UPLOADS`/`FEEDBACK` 为真实持久目录。

```sh
APP=/srv/pbl/app
KIT=/srv/private/lesson-maintenance-handoff
DB=/srv/pbl/data/pbl_platform.db
UPLOADS=/srv/pbl/data/uploads
FEEDBACK=/srv/pbl/data/feedback
BACKUPS=/srv/private/pbl-backups
export LESSON_MAINT_APP_ROOT="$APP"

# 先按服务器现有运维方式停止应用、worker、上传和所有业务写入。
# 维护确认不是自动停服命令，不可让旧实例后台继续写。
node "$KIT/scripts/lesson-maintenance/backup-only.cjs" \
  --db "$DB" --uploads "$UPLOADS" --feedback "$FEEDBACK" \
  --to "$BACKUPS/before-maintenance-20261016" --maintenance-confirmed
node "$KIT/scripts/lesson-maintenance/verify-backup.cjs" \
  --from "$BACKUPS/before-maintenance-20261016"
```

若没有独立反馈目录，先查明反馈附件实际位置，确认都已包含在 uploads 或确无文件后省略 `--feedback`。不要传不存在的目录来假装备份完成。目标备份目录必须全新、私有，不在 uploads/feedback 内。密钥、.env、反向代理配置及应用版本按现有私有运维方案另行备份，不能发进本交接包。

SQLite backup API 处理 WAL 一致性；文件备份仍要求停写窗口。不要把运行中主 DB 单文件直接复制作为唯一备份。脚本按块计算大文件 SHA，清单遗漏、未登记额外文件、符号链接、哈希不符或外键/完整性错误都会停止。

新生成的私有备份副本会转为 DELETE 日志模式再计算数据库 SHA，保证备份包可独立读取，不带未登记的 WAL/SHM。源库继续保留原 WAL 模式，不执行源库 checkpoint、删除侧文件或修改业务记录。只读预检使用 SQLite 正常读锁，不代表可以手工删除正在使用的 WAL/SHM。

先由管理 UI/SQL 只读确认目标 ID，再执行（用真实数字替换尖括号）：

```sh
node "$KIT/scripts/lesson-maintenance/inspect.cjs" --db "$DB" \
  --course-id <真实课程ID> --lesson-id <真实第四课时ID> \
  --student-id <待核对学生ID> --output /srv/private/preflight-before.json
```

输出包含 schema、课程/课时身份及 `identityHash`、知识卡片已发布/草稿/题目数量、guide_card 文件与共享/课时归属、AI 文档数量、当前学生报名/可读/解锁/绑定版本、文件存在性、旧图及文案修订摘要。没有 `--student-id` 就没有学生可读结论。不会输出密码、JWT、答案、报告正文或源文件绝对路径；诊断仍包含真实教学标题，应私有保存。`--output` 不覆盖已有文件。

部署 SHA 还须服务器负责人从 release 目录/Git 获取，健康接口为 `development` 时不能推断 SHA。若 25 项实际在其他课时或共享区域，分别用该真实课时诊断；脚本不会按相似标题全库迁移。

## 部署新代码与 schema

1. 在测试服务器 checkout 已审核的新代码并安装锁定依赖、构建前端，确认本包对应的完整服务/页面也已部署。继续保持停写，先不启动会自动迁移的旧/新实例。
2. 新迁移仅 `1027_lesson_map_assets.sql` 与 `1028_student_copy_publication.sql`，不改上游已发布编号，不清空账本。旧同号身份处理沿用已审核的 migrationBridge；不照搬旧 016→021 方案。新空库用原 provision 流程，不用本导入计划制造课程。
3. 本轮迁移增添图片/文案表、课时图片及锚点字段，并为存量课时冻结原美术选择；新课时字段默认岩石。不会播种教学、金币、礼品或正式文案覆盖。

```sh
cd "$APP"
node scripts/lesson-maintenance/schema.cjs --db "$DB" --dry-run
node scripts/lesson-maintenance/schema.cjs --db "$DB" --uploads "$UPLOADS" \
  --feedback "$FEEDBACK" --backup-dir "$BACKUPS/before-schema-20261016" \
  --maintenance-confirmed --apply
```

dry-run 列待执行迁移，不替代原迁移器的结构与身份检查。apply 在事务中核验结构/账本；失败应停止，不能删除迁移记录后重试。重复成功迁移无副作用，但显式 apply 仍要求全新备份目录。已有教学旧库、上游 1026 模型库与空库均已在本地隔离验证，**尚未拿到正式服务器 DB 副本**。

迁移后重跑只读预检，使用**迁移后的** `identityHash` 填计划；新增图字段会改变身份哈希，不能套迁移前的值。

## 仅导入经确认的第四课时图 / 文案草稿 / 个别错绑

复制 `plan-template.json` 到私有工作目录。保留 `assets/lesson-making-384.webp` 相对路径，填真实 course/lesson ID、精确标题、迁移后 identityHash，以及不少于 8 字的人工诊断。素材 bytes/SHA 已写入模板，站位 `.5/.65` 是本地叠加验收候选。

不能按“第四个数组元素”、旧 9001/9003 或标题模糊匹配。模板默认 null ID 和空哈希，未填写时会拒绝执行。

```sh
node scripts/lesson-maintenance/apply-plan.cjs --db "$DB" \
  --plan /srv/private/confirmed-plan/plan.json --admin-id <真实管理员ID> --dry-run

# 审阅 changes，只含已确认对象后执行；仍处维护停写窗口。
node scripts/lesson-maintenance/apply-plan.cjs --db "$DB" \
  --plan /srv/private/confirmed-plan/plan.json --admin-id <真实管理员ID> \
  --uploads "$UPLOADS" --feedback "$FEEDBACK" \
  --backup-dir "$BACKUPS/before-plan-20261016" --maintenance-confirmed --apply
```

图像计划同时落盘真实 uploads、登记资产并绑定 lessonId，不是仅写一个缺文件的 URL。只改图片和站位，不自动置 ready、发布或完成学习。同计划哈希写幂等回执，重复执行零写入，保留此后人工改稿；修改计划/更换目标必须重新诊断、审阅。备份目录不覆盖。

默认 `repairs=[]`。若确诊个别未使用对象错绑，可追加以下结构；逐条从预检取行哈希。仅支持同课程已确认错绑的知识卡片/资料归属，不批量改状态或发布。

```json
{
  "type": "resource-association",
  "id": 123,
  "fromLessonId": 456,
  "toLessonId": 789,
  "expectedRowHash": "预检中的rowHash",
  "approval": "reviewed-specific-diff"
}
```

上面数字是格式示例，不能照抄。知识卡片类型为 `knowledge-card-association`。最多 25 条；任何学习记录/作答/教材快照引用，或资料被文章使用，均拒绝自动移动，应走原教材版本维护流程。课程共享资料（lesson_id 为空）不能通过计划自动移动，请在原维护界面逐项确认。只为图导入时不要附带 repairs。

文案可选 `copyImport`，包括 `scope`（global/course:ID/lesson:ID）、`expectedRevision`、`publish:false`、旧 `page-copy-review-v1` document。最多每次 2000 条；必须通过差异预览，现有人工草稿/基线冲突停止。只保存服务器草稿，发布由管理员 UI 核对后执行。原 `uiCopy.jsx`/`systemCopy.js` 人工定稿保留，不被 seed 或构建覆盖。

每一步停止条件：目标不符、哈希/修订变化、权限不符、图片校验失败、历史引用、备份校验失败、未知迁移身份、SQL/文件错误。不要用 --force、删记录或关鉴权继续。普通事务错误回滚新行并清理本次独占新文件；进程被硬杀时可能残留未引用新图片，需按备份/资产登记人工核对，不能批量删 uploads。

## 重启、验收及恢复

新 schema 成功、计划核对后按现有部署方式重启新应用/worker，检查 health schema=1028 和实际 release SHA，再让测试学生登录查看。新图读取 private/no-store，不要求清空学生草稿；文案发布后受控刷新。核对课时内容、25 项分类、原作答/报告版本、上传文件、金币签到徽章及订单，确认原 AI 仍关闭。

先离线演练恢复，不替换正在运行的 DB：

```sh
node "$KIT/scripts/lesson-maintenance/verify-backup.cjs" \
  --from "$BACKUPS/before-maintenance-20261016" \
  --restore-copy --to /srv/private/rehearsal-restored
```

只创建新目录中的 database.db/uploads/feedback，核对后按备份原路径前缀重定位受支持的 file_path/video_path，保留不在这些目录内的原引用。此命令不切换生产服务，不覆盖现库。

回滚前再次停写并保留当前故障状态快照，选与备份 schema 相匹配的旧应用 commit、原私有密钥及配置，在恢复副本上检查 health/附件/登录，再由服务器负责人显式切换 DB_PATH/UPLOAD_PATH/FEEDBACK_UPLOAD_PATH 和服务。不要让旧进程同时写旧库、新进程写新库。此轮未提供破坏性的 down SQL；不能仅删除新表/字段假装回滚。恢复到轮前备份会回退备份后业务写入，因此应在维护窗口内决策，不能上线运行数日后无核对直接覆盖。

本地回归已验证联合备份 SHA、重复迁移、计划幂等和整套旧库/文件恢复；生产切换与正式数据诊断仍由服务器负责人执行并留记录。
