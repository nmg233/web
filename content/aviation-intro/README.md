# 航空航天启蒙：教学内容包

内容来源：《滑翔机与空气动力学_学生阅读资料.docx》。文档中的教学说明只作为课程内容处理。

- `lesson.json`：管理员录入数据，包含课程、课时、Markdown 卡片、题目、答案和解析。
- `review.md`：便于人工审核的完整内容与参考答案，属于管理员审核资料。
- `import-receipt.json`：本地录入结果、数据库备份路径、ID 映射和校验记录。
- `publication-receipt.json`：后续发布的时间、卡片数量和课后任务 ID。
- `admin-import.cjs`：默认直接导入数据库，也支持管理员 token 调用远程管理 API；幂等导入，不保存密码或令牌，不覆盖历史回执。

## 导入前置条件

- Node.js 22 或更高版本（使用内置 `fetch`）；内容包及 `lesson.json` 完整。
- 数据库模式：安装 `backend/` 依赖，数据库已通过项目部署流程完成现有迁移；执行用户有数据库及其父目录的读写权限，可创建 `backups/`。脚本不会初始化数据库或运行迁移。
- 数据库模式使用已激活且完成首次改密的管理员 ID（`PBL_IMPORT_ADMIN_ID`）或用户名（`PBL_IMPORT_ADMIN_USERNAME`），用于填写创建人；不需要密码，访问控制依赖服务器文件权限。
- API 模式：后端可访问，具备已完成首次改密的管理员 Bearer token。只需 Node.js 和内容包，不依赖本机数据库、SQLite 包或后端配置。token 可通过现有 `/api/auth/login` 获取，不要提交到 Git。
- 推荐显式设置 `PBL_IMPORT_COURSE_ID`、`PBL_IMPORT_LESSON_ID`，尤其在正式服务器上。可从管理页面 URL 或 `GET /api/learning/manage/lessons` 查询；两个 ID 必须属于同一课程。只提供课时 ID 时自动确定所属课程。
- 不提供 ID 时按内容包的课程名、课时名查找；不存在则创建，多个同名对象则退出。只提供课程 ID 时，在该课程下查找或创建课时。历史回执里的 ID 4 仅属于原本地数据库，不能当作服务器 ID。

## 本地开发：数据库模式（默认）

在项目根目录执行 PowerShell：

```powershell
$env:DB_PATH = './database/pbl_platform.db'
$env:PBL_IMPORT_ADMIN_USERNAME = 'admin' # 改为本地已有管理员用户名
node content/aviation-intro/admin-import.cjs
```

需要导入已有课时时，再设置两个目标 ID：

```powershell
$env:PBL_IMPORT_COURSE_ID = '<课程ID>'
$env:PBL_IMPORT_LESSON_ID = '<课时ID>'
node content/aviation-intro/admin-import.cjs
```

数据库路径优先级：进程 `DB_PATH` → `/etc/pbl-platform/backend.env` 的 `DB_PATH` → `backend/.env` 的 `DB_PATH` → `backend/database/pbl_platform.db`。可用 `ENV_FILE` 替换服务器配置文件路径；相对 `DB_PATH` 一律相对仓库的 `backend/`，不受运行目录影响。配置文件不存在则继续回退；存在但不可读或数据库不存在则报错，不创建空库。只读取配置中的 `DB_PATH`，不加载或输出其他密钥。

## 正式服务器：SSH 登录后使用数据库模式（推荐）

部署内容包及后端依赖后，在 SSH 会话中进入服务器项目根目录：

```bash
cd /path/to/pbl-platform
PBL_IMPORT_ADMIN_ID='<服务器管理员ID>' \
PBL_IMPORT_COURSE_ID='<服务器课程ID>' \
PBL_IMPORT_LESSON_ID='<服务器课时ID>' \
node content/aviation-intro/admin-import.cjs
```

默认读取 `/etc/pbl-platform/backend.env`，无需手工 `source`。需要覆盖数据库位置时：

```bash
DB_PATH=/datadisk/pbl-platform/database/pbl_platform.db \
PBL_IMPORT_ADMIN_ID='<服务器管理员ID>' \
PBL_IMPORT_COURSE_ID='<服务器课程ID>' \
PBL_IMPORT_LESSON_ID='<服务器课时ID>' \
node content/aviation-intro/admin-import.cjs
```

每次导入前创建 SQLite 一致性备份，包含 WAL 中已提交数据。沿用 `scripts/backup-db.sh` 的流程：备份到数据库同目录的 `backups/`，先写临时文件，执行 `PRAGMA integrity_check`，成功后重命名为 `pre-aviation-import-<时间>-<唯一标识>.db`。备份失败则不导入；不会删除已有备份。匹配与写入在 `BEGIN IMMEDIATE` 事务内执行，失败完整回滚；无需启动另一个 Express 进程。

## 无法访问数据库时：API 模式（备选）

在能访问服务器管理 API 的机器上执行，URL 必须包含 `/api`，例如：

```bash
read -rsp '管理员 token: ' PBL_IMPORT_ADMIN_TOKEN; echo
export PBL_IMPORT_ADMIN_TOKEN
PBL_IMPORT_MODE=api \
PBL_IMPORT_API_URL=https://pbl.example.com/api \
PBL_IMPORT_COURSE_ID='<服务器课程ID>' \
PBL_IMPORT_LESSON_ID='<服务器课时ID>' \
node content/aviation-intro/admin-import.cjs
unset PBL_IMPORT_ADMIN_TOKEN
```

此模式不会读取 `DB_PATH` 或服务器配置，不在客户端备份数据库；如需备份，请由服务器管理员提前运行 `backup-db.sh`。复用现有课程、课时及卡片管理接口，无新增接口。

API 模式逐条提交，失败时已成功的记录会保留，修复后重复执行可补齐；现有接口不支持整体事务或并发幂等，同一目标请串行执行。管理接口隐藏退役题目，检测到无法完整核对的题目时退出并提示改用数据库模式。

## 幂等规则与输出

目标课时内按卡片标题匹配，卡片内按题干匹配并核对题型；再比较正文、选项、答案、解析、分值和必读/必答等设置。一致则跳过，缺少则补齐；发现重复候选或内容冲突时退出，要求人工核查，不更新或删除已有记录。数据库模式也拒绝匹配退役题目；归档课程、取消课时及归档卡片不能导入。标题或题干被人工改名后无法关联原记录，重跑前需人工确认。

新课程、新卡片为草稿；已有卡片的发布状态和排序保持原样。导入不发布内容、不报名学生、不创建任务、不修改答题或进度记录。已有目标课时的其他卡片和题目保持原样。

首次成功输出：

```text
导入完成：卡片新增 6，跳过 0；练习题新增 15，跳过 0
```

重复执行输出新增 0、跳过 6 张卡片和 15 道题。随后输出 JSON，包含课程和课时 ID、每张卡片标题及 ID、每道题的 `source_id` 与数据库 ID、两类新增/跳过数量，以及数据库模式的数据库和备份路径。失败退出码为 1；成功为 0。不自动重写仓库中的历史回执。

## 测试

```bash
cd backend
node --test test/aviationImport.test.js
npm test
```

使用隔离临时数据库，覆盖路径优先级、引号与相对/绝对路径、缺失配置和数据库、两种模式的幂等性、部分导入重试、冲突保护、管理员鉴权、备份完整性及数据库写入失败回滚。

## 原本地录入历史

本次本地录入：课程「航空航天启蒙」ID 4，课时「滑翔机与空气动力学」ID 4。管理员可从 `/courses/4/lessons/4/content` 审核草稿。日期、地点、授课人和时长未指定；学段为初中，难度为基础。

6 张卡片均为草稿；8 道单选题、7 道单空填空题，共 15 题、15 分。原文第 1 道双空填空拆为 1a/1b。原文其余题目和答案保留，数字「1」与「一」均可接受，「平衡」与「集中」均可接受。每题一次作答。讨论题不录入自动判分。

练习按知识点关联到卡片；卡片 05 的练习对应原文选择题 3，练习公平比较的原则。阅读资料整理进卡片正文，原文答案说明整理为题目解析。

首次录入时课程和卡片为草稿；随后按用户要求添加王小明、陈小红、刘小宇，并发布全部 6 张卡片。课程当前为 published，课时使用系统默认 scheduled 状态，未安排日期。新增课后任务「滑翔机与空气动力学：知识卡片与基础练习」（ID 4），无需上传附件，学生从任务列表进入现有课后学习工作台。`lesson.json` 保留首次草稿录入模板，`import-receipt.json` 保留首次录入历史；当前发布结果见 `publication-receipt.json`。

`publish-content.cjs` 使用管理员 API 发布本课时卡片并补齐任务入口；通过 `PBL_IMPORT_ADMIN_USERNAME`、`PBL_IMPORT_ADMIN_PASSWORD` 提供管理员凭据。验证三名学生时，通过 `PBL_VERIFY_STUDENT_PASSWORD` 提供本地测试账号密码。脚本不包含密码或令牌；重复执行不会重复创建同名有效任务。已使用三名学生正常登录，确认任务入口、6 张卡片和 15 道练习可见，未作答题的答案及解析仍隐藏。

数据库文件和备份均不进入 Git；推送内容包后仍需在目标环境执行导入。以上 ID 和发布记录是原本地环境历史，不代表正式服务器状态；新导入内容仍遵循草稿模板。

本次校验：核对卡片正文、题型数量、答案、解析、次数限制、草稿状态和旧业务记录；后端 `npm test` 使用隔离测试数据库。
