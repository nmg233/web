# PBL 科创育人平台

面向“大中小贯通科创育人”项目的 PBL（项目式学习）本地数字化管理平台。平台围绕学校、班级、用户、课程、课程回放、课后任务、作品与成长档案，提供执行导师/教师/管理员统一导入选课、学生查看课程回放并提交课后任务、教师与导师管理、成长记录、反思日志、灵境小智（规则式学习助手）、用户反馈闭环及站内通知等功能。

> 支持本地开发与服务器部署，部署步骤见文末“服务器部署”章节。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 8、Ant Design 6、React Router 7、Axios、Day.js |
| 后端 | Node.js、Express 4、REST API |
| 数据库 | SQLite、better-sqlite3 |
| 认证 | JWT、bcryptjs |
| 文件上传 | Multer、本地文件系统 |

前端使用 JavaScript/JSX；后端使用 CommonJS。项目已移除早期 EJS 版本的 `backend/views` 与 `backend/public` 遗留目录，当前只运行 React SPA 与 Express API。

## 环境要求

- Node.js 22.12 或更高版本
- npm 10 或更高版本
- Python 3.11+（仅“滑翔机模拟（学生科创）”需要，详见对应章节）

Node.js 18 不满足当前依赖要求：Vite 8 要求 Node.js 20.19+，`better-sqlite3` 13 要求 Node.js 22+。建议统一使用 Node.js 22 LTS 或更高版本。

## 项目结构

```text
project/
├── backend/
│   ├── app.js                  # Express API 入口
│   ├── config/database.js      # SQLite 连接与轻量迁移
│   ├── controllers/            # 业务控制器
│   ├── services/               # 反馈、通知等领域服务
│   ├── constants/              # 状态、类型与权限白名单
│   ├── routes/                 # API 路由
│   ├── middleware/             # JWT 鉴权和上传处理
│   ├── helpers/                # 公共辅助逻辑
│   ├── database/
│   │   ├── schema.sql          # 数据库表结构（规范最新形态）
│   │   ├── init.js             # 数据库初始化脚本
│   │   └── migrations/         # 版本化迁移（001 基线 / 002 报名留痕软删除…）
│   ├── uploads/                # 作品、课程资源与课程回放上传目录（不公开静态托管）
│   ├── private_uploads/        # 反馈附件等需要鉴权下载的文件
│   └── test/                   # Node.js 自动化测试
├── frontend/
│   ├── index.html              # HTML 入口
│   ├── vite.config.js          # Vite 配置
│   └── src/
│       ├── main.jsx            # React 入口
│       ├── App.jsx             # 前端路由
│       ├── api/                # Axios 请求封装
│       ├── components/         # 布局、反馈、通知等公共组件
│       ├── pages/              # 页面组件（含 glider/ 滑翔机模拟实验室）
│       ├── hooks/              # 通知等共享状态 Hooks
│       └── store/              # 认证与通知状态
├── simulation/                  # 滑翔机仿真（生产依赖，不再使用 test_ 前缀目录）
│   ├── glider/                  # 滑翔机气动仿真（Python）：aircraft/aero/sim_core/render/plot_flight
│   │   └── sim_service.py       # 供平台后端 spawn 调用的 headless 服务（结果图 + MP4 回放）
│   ├── docker/                  # novaPhy Docker 运行环境
│   └── wsl_setup.sh             # WSL novaPhy 环境准备脚本
├── scripts/                     # 部署辅助脚本（doctor/backup-db/health-check）
├── deploy.sh                    # 一键部署脚本（测试/演示环境）
├── 网站使用手册.docx
└── README.md
```

根目录的 `package.json` 不是应用启动入口。当前项目应分别在 `backend` 和 `frontend` 目录安装依赖、执行命令。

## 本地安装

### 1. 安装后端依赖

```powershell
cd backend
npm ci
```

### 2. 配置后端环境变量

可以复制模板后按需调整：

```powershell
Copy-Item .env.example .env
```

当前后端实际读取以下变量：

| 变量 | 是否必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 否 | `3000` | 后端端口 |
| `HOST` | 否 | `127.0.0.1` | 服务监听地址；生产保持 `127.0.0.1`，由 Nginx 反代对外 |
| `NODE_ENV` | 否 | 未设置 | 推荐本地设为 `development` |
| `JWT_SECRET` | 生产环境必需 | 开发时随机生成 | JWT 签名密钥；本地也建议固定设置，避免重启后 Token 失效 |
| `UPLOAD_PATH` | 否 | `uploads` | 相对于 `backend` 的上传目录 |
| `FEEDBACK_UPLOAD_PATH` | 否 | `private_uploads/feedback` | 反馈附件根目录（生产建议指向数据盘绝对路径） |
| `CORS_ORIGIN` | 否 | `http://localhost:5173` | 允许访问 API 的前端来源 |
| `API_PREFIX` | 否 | `/api` | API 路由前缀 |
| `DB_PATH` | 否 | `database/pbl_platform.db` | SQLite 路径；自动化测试会覆盖为临时数据库 |
| `GLIDER_PYTHON` / `GLIDER_BACKEND` | 否 | 见滑翔机章节 | 滑翔机引擎解释器与后端选择（三态配置见下文） |

本地 `.env` 示例：

```dotenv
PORT=3000
NODE_ENV=development
JWT_SECRET=replace_with_a_long_random_string
UPLOAD_PATH=./uploads
CORS_ORIGIN=http://localhost:5173
API_PREFIX=/api
DB_PATH=./database/pbl_platform.db
```

`SESSION_SECRET` 和 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 不被当前 JWT + SQLite 实现读取。

### 3. 初始化数据库

首次本地运行时，在 `backend` 目录执行（先停止已运行的后端）：

```powershell
npm run db:init
```

初始化脚本读取 `backend/.env` 的 `DB_PATH`，与后端连接同一个数据库；默认是 `backend/database/pbl_platform.db`。数据库不存在，或只是先启动后端生成了尚未使用的空表时，都会创建下文的测试账号和演示数据，并正确记录迁移版本。

如果数据库已有业务数据或使用记录，初始化脚本会退出，保留账号、密码和学习数据。重复执行不会覆盖旧密码。生产环境禁止执行本脚本，应使用 `db:provision`。

```powershell
npm run db:reset
```

`db:reset` 会删除并重建数据库，清空全部现有数据，仅应在明确需要重置本地测试数据时使用。

> **数据库迁移在服务启动时自动执行**（`backend/database/migrations/`，版本记录于 `schema_migrations` 表）：新建库直接按 `schema.sql` 建表并批量标记已应用版本；既有库按序应用未执行的增量迁移（如 `002_enrollment_management.sql` 为报名表补充软删除与导入人留痕字段）。升级前建议先用 `sqlite3 <db> ".backup <文件>"` 备份。

### 4. 安装前端依赖

```powershell
cd ..\frontend
npm ci
```

## 本地运行

### Windows 一键启动（开发用）

完成上面的首次安装和数据库初始化后，双击仓库根目录的 `start-dev.bat`，或在 PowerShell 中执行 `.\start-dev.bat`。看到“启动成功”后打开 http://localhost:5173/login 。在启动窗口按 **Ctrl+C 或 Q** 可一起停止本次启动的前后端。

脚本沿用前后端各自的 `npm run dev`、后端 `.env` 和原有数据库，不自动安装依赖、初始化或重置账号。端口被占用时会提示先停止旧服务；不会自动换端口或关闭其他服务。前端和 API 都就绪后才提示启动成功，失败日志显示在同一窗口。此脚本仅用于本地开发，服务器部署仍使用下文的部署方式。

只检查环境而不启动，可执行 `.\start-dev.bat --check`。也可以继续使用下面的手动启动方式。

分别打开两个 PowerShell 终端。

终端一，启动后端：

```powershell
cd backend
npm run dev
```

后端默认地址：

- API：`http://localhost:3000/api`
- 健康检查：`http://localhost:3000/api/health`

终端二，启动前端：

```powershell
cd frontend
npm run dev
```

前端默认地址：`http://localhost:5173`

浏览器打开 `http://localhost:5173/login`，使用下文“默认本地测试账号”中的**登录账号**（不是姓名）登录，例如 `adminpbl / admin123`。日常再次启动只需上述两个 `npm run dev`，不用重复初始化。

若健康检查成功但测试账号无法登录，请确认后端启动日志中的数据库路径与 `.env` 的 `DB_PATH` 一致，且执行过 `npm run db:init`；仅启动后端会自动建表，不会自动创建测试账号。端口被占用时先停止重复启动的服务，避免前端连接到另一套后端。

Vite 已配置 `/api` 与 `/uploads` 代理到 `http://localhost:3000`，前端请求同源 `/api`，本地开发无需跨域。生产环境由 nginx 将 `/api` 代理到后端。

#### 启动滑翔机模拟（可选）

滑翔机模拟是 Python 物理仿真，需要一套含 `numpy`、`matplotlib`、`imageio-ffmpeg` 的 Python 3 环境（Windows 直接使用系统 Python 即可，参考后端不依赖 novaPhy）：

```powershell
# 本机 Windows（无 WSL）：安装参考后端所需依赖
pip install numpy matplotlib imageio imageio-ffmpeg
```

```bash
# Linux / WSL（真 novaPhy）：另需 Python 3.11 + novaPhy wheel，
# 可执行 simulation/wsl_setup.sh 一键准备（wheel 路径见脚本头部注释，支持 WHEEL 变量覆盖）
```

然后在 `backend/.env` 声明引擎并正常启动后端：

```dotenv
# 方案一：本机无 WSL/无 novaPhy —— 纯 numpy 参考后端（结果与真 novaPhy 等价）
GLIDER_PYTHON=python
GLIDER_BACKEND=reference

# 方案二：有 WSL 的 Linux novaPhy 环境 —— 跑真 novaPhy（推荐）
# GLIDER_PYTHON=wsl:Ubuntu-24.04:/opt/novaphy/bin/python
# GLIDER_BACKEND=novaphy
```

学生登录后进入 `/glider`：填机翼上反角、重心、初始速度 → 开始试飞 → 等待约 30 秒~2 分钟（真 novaPhy 渲染全程回放较慢），可查看 3D 航迹、遥测曲线与固定机位的 MP4 飞行回放。结果文件保存在 `backend/uploads/glider/<id>/`。非学生角色进入该页面为只读视图：**管理员可查看全部试飞记录，其余角色仅可见本人记录（通常为空）**。引擎不可用时（能力探测失败）前端“开始试飞”按钮置灰，直接调用接口会得到 503 快速失败。原理与环境变量详见“滑翔机模拟（学生科创）”章节。

## 常用命令

### 后端

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 使用 nodemon 启动本地开发服务 |
| `npm start` | 使用 Node.js 启动服务 |
| `npm test` | 使用 Node.js 内置测试框架执行后端测试 |
| `npm run db:init` | 在数据库不存在时创建数据库和测试数据 |
| `npm run db:reset` | 删除并重建本地数据库，会清空数据（仅测试环境） |
| `npm run db:provision` | 幂等初始化正式库：建表 + 创建正式管理员（无测试数据，生产用） |

### 前端

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm run build` | 构建到 `frontend/dist` |
| `npm run preview` | 预览构建结果 |

## 功能与角色

| 角色 | 主要能力 |
| --- | --- |
| 管理员 `admin` | 学校、班级和用户管理；选课导入与异常修正（移除报名）；课程与作品管理；成长档案；反馈管理；滑翔机试飞记录（只读，可查看全部） |
| 学术导师 `academic_mentor` | 课程全流程管理；选课导入（全平台学生）；可作为课时授课人；课程资料与回放上传管理；任务总览（自己管理课程）；作品批改；学生与成长档案管理 |
| 教师 `teacher` | 本校学生管理；为**自己授课课时**所在课程导入本校学生；任务总览（自己授课课时）；我授课的课程；查看课程回放；查看公开发布作品；本校成长档案 |
| 学生 `student` | 我的课程（仅已报名课程）与课程回顾（摘要/回放/资料/任务/我的提交）、完成课后任务并提交作品、反思日志（每日一篇）、个人成长档案、滑翔机模拟试飞 |
| 新媒体 `media` | 课程浏览（只读）、帮助与反馈、通知中心 |

> 学生选课由**执行导师/教师/管理员统一导入**（教师仅限自己授课课程的本校学生），学生端已彻底移除自助选课；**一经选课不可退课**，误导入仅管理员可经异常修正通道移除（该生已产生作品/评价/反思时禁止移除，操作留痕并通知学生）。**公开注册已关闭**，学生账号由管理员导入/创建（默认密码姓名拼音@123，首登强制改密）。作品上传仅限学生本人（从课后任务入口提交），教师与导师均不参与作品上传；教师仅能查看公开发布（已通过批改）的作品，不参与批改。
> 新课程默认创建为草稿，管理者在课程详情点击「发布课程」后才对学生可见（可随时撤回为草稿）；已发布/已归档课程禁止物理删除，有报名历史（含已移除）的草稿亦不可删除，需留存请归档。
> 学生端一级导航为 6 项（工作台/我的课程/课后任务/我的作品/实验工具/成长档案）；反思入口在成长档案页、灵境小智入口在已选课程详情、反馈走顶栏按钮、通知走铃铛。移动端侧边栏自动折叠，表格支持横向滚动。

所有已登录角色均可提交反馈、查看自己的反馈、追加说明和确认处理结果，也可以通过顶部铃铛和通知中心接收、筛选及管理站内通知。管理员可查看全部反馈、设置优先级和状态、填写处理结果，并添加仅管理员可见的内部备注。

## 选课与报名规则

- **导入权限**：执行导师（academic_mentor）、教师（teacher）、管理员均可导入学生；教师仅能为自己授课课时所在课程导入**本校**学生，执行导师/管理员可导入全平台学生；已归档课程不可导入。
- **不可退课**：一经选课不可退课，任何角色都没有日常退课入口；唯一例外是管理员的**异常修正通道**——仅当该生在该课程内没有作品/评价/反思数据时可移除，移除为软删除（`enrollments.status='removed'`），记录移除人/时间/原因，写入成长档案审计并站内通知学生；误移除后重新导入即“复活”报名。
- **留痕**：`enrollments.enrolled_by` 记录导入人；课程详情“选课学生”页签展示导入人，并支持按学校/班级筛选导入。
- **学生视角**：学生课程列表/首页/任务/作品/AI 上下文只包含**有效报名**（status='active'）且已发布的课程；撤回或移除后即不可见。

## 当前前端页面

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录 |
| `/change-password` | 修改密码（含强制改密） |
| `/dashboard` | 工作台（学生视图含下一节课与待办；平台统计仅管理员/导师可见） |
| `/dashboard/schools/:id` | 学校详情 |
| `/dashboard/ai` | 灵境小智（规则式学习助手；教师端暂不开放） |
| `/glider` | 滑翔机模拟实验室（学生试飞；其余角色只读，管理员可查看全部记录） |
| `/courses` | 课程列表 |
| `/courses/create` | 创建课程 |
| `/courses/:id` | 课程详情（课时/课程回放/资源/选课学生；课时含线下场次时间、地点与授课教师；选课学生页签支持导入学生，管理员可移除报名） |
| `/courses/:id/edit` | 编辑课程 |
| `/courses/:id/learn` | 课程回顾页（摘要/回放/资料/任务/我的提交） |
| `/tasks` | 任务总览（学生/教师/导师） |
| `/tasks/:id` | 任务详情 |
| `/students` | 学生与用户管理 |
| `/students/:id` | 用户详情（学生=成长档案；教师/导师/管理员=角色资料与授课/管理课程） |
| `/works` | 作品列表 |
| `/works/upload` | 上传作品 |
| `/works/:id` | 作品详情 |
| `/archives` | 成长档案 |
| `/archives/reflection` | 反思日志（仅学生本人，关联课程与课时，每日一篇按北京时间零点计） |
| `/feedback` | 我的反馈 |
| `/feedback/new` | 提交反馈 |
| `/feedback/:id` | 反馈详情与沟通记录 |
| `/feedback/manage` | 管理员反馈管理 |
| `/notifications` | 通知中心、筛选与批量操作 |
| `/notifications/:id` | 通知详情 |

学校添加与学生批量导入均以弹窗形式在对应管理页内完成，不设独立路由页面。

## API 概览

| 模块 | 默认前缀 | 说明 |
| --- | --- | --- |
| 认证 | `/api/auth` | 登录、当前用户、学校和班级（公开注册已关闭） |
| 工作台 | `/api/dashboard` | 统计、学校管理、灵境小智 |
| 课程 | `/api/courses` | 课程、课时、任务、资源、回放、选课导入（执行导师/教师/管理员）与管理员移除报名 |
| 课程回放 | `/api/courses/:id/replays` | 回放列表、上传、编辑、删除与鉴权播放（`/stream` 支持签名 URL + HTTP Range 流式拖动） |
| 学生 | `/api/students` | 用户、学校、班级和批量导入 |
| 作品 | `/api/works` | 上传、查看、批改和版本管理 |
| 档案 | `/api/archives` | 成长档案、反思、评价和成长记录 |
| 滑翔机 | `/api/glider` | 提交参数、运行模拟、查看试飞记录与结果图/视频 |
| 反馈 | `/api/feedback` | 提交、列表、详情、回复、状态、优先级、统计和私有附件 |
| 通知 | `/api/notifications` | 列表、最近通知、未读数、详情、已读/未读和隐藏操作 |
| 健康检查 | `/api/health` | 服务状态 |

## 用户反馈机制

反馈模块提供以下 MVP 能力：

- 用户提交功能建议、程序错误、使用咨询、内容问题或其他反馈
- 用户查看自己的反馈和完整公开沟通记录
- 管理员查看、筛选并处理全部反馈
- 状态流转：待处理、处理中、待用户补充、已处理、已关闭、无效或重复
- 管理员设置低、普通、高、紧急优先级
- 管理员公开回复和仅管理员可见的内部备注
- 用户确认解决或申请重新处理
- 最多上传 3 个 PNG、JPG、WEBP 或 PDF 附件，单个不超过 10 MB

反馈附件保存在 `backend/private_uploads/feedback`，不通过 Express 静态目录公开。只有反馈提交人和管理员可以通过鉴权接口下载附件。

## 站内通知

通知模块当前提供以下 MVP 能力：

- 顶部通知铃铛显示未读数量并展示最近 8 条通知
- 登录期间每 60 秒刷新未读数量，浏览器窗口重新获得焦点时立即刷新
- 通知中心支持按阅读状态、分类和级别筛选，并支持分页
- 支持单条已读/未读、打开详情自动已读、全部已读、隐藏单条和清理已读
- 收件人只能读取和操作自己的通知；服务端不接受前端指定其他用户
- 通过唯一幂等键避免同一业务事件重复创建通知
- 反馈提交、公开回复、状态变化、处理完成、用户确认和重新打开会触发通知
- 作品提交、重新提交、评审通过、打回修改和删除会触发通知

通知是业务操作成功后的辅助信息。通知写入异常会记录服务端错误，但不会回滚已经成功的反馈或作品操作。当前采用前端轮询，不依赖 WebSocket、SSE 或外部消息服务。

通知 API 均要求 JWT 登录：

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/notifications` | 获取当前用户通知列表 |
| `GET /api/notifications/recent` | 获取最近通知 |
| `GET /api/notifications/unread-count` | 获取未读数量 |
| `GET /api/notifications/:id` | 获取详情并自动标记已读 |
| `PATCH /api/notifications/:id/read` | 标记已读 |
| `PATCH /api/notifications/:id/unread` | 标记未读 |
| `PATCH /api/notifications/:id/hide` | 隐藏单条通知 |
| `POST /api/notifications/read-all` | 全部标记已读 |
| `POST /api/notifications/hide-read` | 隐藏全部已读通知 |

## 灵境小智（规则式学习助手）

平台内置“灵境小智”（原“AI 学习助手”）尚未连接大语言模型或外部 AI API。后端根据 PBL、月球、无人机、火星、VR 和反思等关键词返回预设内容，并可附带有限的课程上下文。对外介绍时宜称为“规则式学习助手”。教师端暂不开放（教师不参与课程建设，无课程上下文）；学生仅可对**已报名且已发布**的课程提问。

## 默认本地测试账号

数据库初始化脚本会创建以下测试账号：

| 身份 | 姓名 | 登录账号 | 密码 |
| --- | --- | --- | --- |
| 管理员 | 管理员 | `adminpbl` | `admin123` |
| 学术导师 | 张导师 | `mentor_zhang` | `mentor123` |
| 教师 | 李老师 | `teacher_li` | `teacher123` |
| 学生 | 王小明 | `student_wang` | `student123` |
| 学生 | 陈小红 | `student_chen` | `student123` |
| 学生 | 刘小宇 | `student_liu` | `student123` |

### 登录账号（账号整改第一批）

- 登录接口 `POST /api/auth/login` 使用 `{ "username": "账号", "password": "密码" }`，不再接受姓名登录；登录限流和锁定同步按账号计数。
- 账号区分大小写，登录时忽略首尾空格。姓名可以重复，包括同校同名；数据库继续使用已有的唯一 `username`，不迁移、不重新编号、不修改旧账号密码。
- 管理员添加用户、添加学生及 CSV / Excel / JSON 导入支持可选 `username`（文件表头“登录账号”，也支持 `login_id`）。新账号为 4–64 位字母、数字、下划线或连字符，以字母或数字开头，例如 `BJFX-2026-0001`、`T-BJFX-001`、`M-0001`。登录旧账号不受新建格式规则限制。
- 账号留空时自动生成 `S-` / `T-` / `M-` 加随机标识的唯一账号；学校缩写尚无统一配置，因此学校编号由管理员填写。账号创建后保持不变，修改姓名或组织归属不改账号。
- 旧导入模板仍可使用；重复账号（包括禁用账号）会逐行报错并跳过，同名不同账号正常导入。**没有账号的文件重复导入会创建新用户**；需要防重复导入时，请在文件中填写固定账号。
- 管理员“用户管理”新增登录账号清单，可复制账号、按姓名/账号搜索，导出当前筛选结果或勾选用户的 CSV；导入结果也可导出本次成功账号。导出只含姓名、账号、身份、学校、班级，不含密码。
- 部署前可从旧版管理员用户详情或数据库只读查询 `SELECT username, real_name FROM users` 获取账号并分发。前后端需一起更新；已有库无需运行 `db:init` / `db:reset`。正式管理员使用初始化时配置的 `ADMIN_USERNAME`。

第一批对应《账号与权限体系整改方案》第 3 条及第 15 条第 1 项。第二批临时密码整改见下节；学生写权限及生命周期进度见文末“账号权限整改进度”，课程/学校 Policy 仍属于后续批次。

这些账号用于本地开发和测试部署。测试环境可保留默认账号便于验收；公网正式发布前应修改或删除默认密码，并设置固定、强随机的 `JWT_SECRET`。

### 随机临时密码（账号整改第二批：第 4、5 条）

- 用户创建、学生创建、批量导入和管理员重置密码统一调用 `backend/services/tempPasswordService.js`：使用 Node `crypto.randomInt` 生成 12 位随机密码，包含大写、小写、数字、特殊字符；首位为字母或数字，方便 CSV 原样分发。
- 创建、导入、重置仅在操作成功的当次响应返回 `temp_password`，并设置 `Cache-Control: no-store`。数据库只保存 bcrypt hash；姓名拼音密码、固定默认密码和 6 位重置密码不再用于这些入口。
- 创建和重置弹窗显示姓名、登录账号、可复制的临时密码；关闭后清除结果。教师、导师详情也提供管理员重置入口。密码遗失后只能重新重置，不能查询原明文。
- 导入结果的“导出本次临时密码”生成 `姓名,登录账号,临时密码` CSV。请关闭弹窗前保存并线下分发，妥善保管已下载文件；关闭弹窗会清除内存结果，浏览器不将临时密码写入 localStorage/sessionStorage。普通账号清单导出仍不含密码。
- 创建时不再接受手填初始密码。旧客户端给 `POST /api/students`、`POST /api/students/users` 传非空 `password` 会返回 400；编辑用户接口 `PUT /api/students/users/:id` 同样不再接受非空 `password`，应调用 `POST /api/auth/admin/reset-password`。空值仍兼容。
- 管理员重置密码在同一事务中更新 hash、设置 `force_reset_password = 1`、撤销旧 refresh token；任一步失败都会回滚。用户必须用临时密码完成首次改密后再访问业务功能，自助改密策略仍为至少 8 位、至少三类字符。
- 无数据库结构变更，不批量重置现有账号，也不修改本地测试种子账号或正式管理员初始化流程。前后端应一起部署。上述种子账号的默认密码仅用于本地演示。

## 本地数据

- SQLite 数据库：`backend/database/pbl_platform.db`
- SQLite WAL 文件：`backend/database/pbl_platform.db-wal`
- SQLite 共享内存文件：`backend/database/pbl_platform.db-shm`
- 作品与课程资源上传文件：`backend/uploads/`（不公开静态托管）
- 课程回放视频：`backend/uploads/course-replays/`（经签名 URL 鉴权流式播放）
- 滑翔机模拟结果（3D 航迹图 / 遥测图 / CSV / MP4 回放）：`backend/uploads/glider/`
- 文件清理失败队列：`backend/uploads/.cleanup-queue.json`（删除文件/目录失败时记录，可由运维手动重试）
- 私有反馈附件：`backend/private_uploads/feedback/`
- 环境变量：`backend/.env`

以上内容均被 Git 忽略。数据库的 `-wal` 和 `-shm` 文件可能包含运行状态或尚未检查点的数据，不应在服务运行时单独删除。

## 滑翔机模拟（学生科创）

学生可在 `/glider`（工作台卡片或侧边栏“滑翔机模拟实验室”）提交三组参数，后端用**真实气动仿真**试飞：

- 机翼上反角（°）—— 越大横向越稳；
- 重心位置（沿机头方向前移量，m）—— 靠前更稳但滑翔差，靠后易失速翻滚；
- 初始投放速度（m/s）—— 需高于失速（约 20 m/s）。

数据链路：前端提交 → `POST /api/glider/simulate`（限学生）→ 后端 `spawn` 调用
`simulation/glider/sim_service.py` → 物理积分 → 输出 `backend/uploads/glider/<id>/`
（`summary.json`、CSV、3D 航迹图、遥测图、`flight_replay.mp4` 回放）→ 前端轮询详情、经鉴权接口拉取结果图与视频播放。历史试飞记录仅本人（管理员可看全部）可见，结果文件也仅本人/管理员可下载，**无需** nginx 额外暴露 `/uploads`。

任务可靠性：后端启动时会清扫历史遗留的 `running` 记录（服务中断不再永久占满并发）；提交模拟前先做引擎能力探测（结果缓存 60 秒，探测回调有防双响应守卫），不可用时快速失败；单次模拟有硬超时（`GLIDER_TIMEOUT` + 120 秒缓冲，超时强制终止）；前端轮询超过 5 分钟未完成会提示疑似卡住并停止轮询。

### 引擎双后端（本地 = 服务器一致）

交付的 `novaphy` 物理引擎 wheel 仅支持 **Linux x86_64 + CPython 3.11**。`sim_service.py` 与气动代码（`aircraft/aero/sim_core`）平台无关，差异只在“调用哪个解释器”，用 `GLIDER_PYTHON` 一个变量表达三种环境：

| 环境 | `GLIDER_PYTHON` | 说明 |
| --- | --- | --- |
| 服务器(Linux) | `/opt/novaphy/bin/python` | 原生调用，跑真 novaPhy |
| 本地 Windows + WSL | `wsl:Ubuntu-24.04:/opt/novaphy/bin/python` | 经 `wsl.exe` 调 WSL 内 novaPhy（`/mnt/d` 与 `D:` 同盘互通） |
| 无 WSL 的 Windows | `python` + `GLIDER_BACKEND=reference` | 纯 numpy 参考后端，物理结果等价 |

`GLIDER_BACKEND` 支持 `auto`（默认，可加载 novaPhy 则优先）/ `novaphy` / `reference`。

### Python 依赖

- 本机 Python 3（Windows 参考后端）：`numpy matplotlib imageio imageio-ffmpeg`。
- Linux novaPhy 环境（服务器 `/opt/novaphy` 或 WSL）：Python 3.11 venv，安装
  `novaphy-0.4.0-cp311-cp311-linux_x86_64.whl` + `numpy matplotlib Pillow imageio imageio-ffmpeg`；
  可用 `simulation/wsl_setup.sh` 一键准备（wheel 默认取脚本目录下交付包目录，也可用 `WHEEL` 环境变量指定）。
  注意：WSL 中该 venv 若由 root 创建，需 `wsl -d <发行版> -u root -- bash -lc '/opt/novaphy/bin/pip install imageio imageio-ffmpeg'`。
  缺失 `imageio-ffmpeg` 时视频自动跳过（`files.video=null`），不影响模拟结果。

### 相关环境变量（均写入 `backend/.env` 或生产 `EnvironmentFile`）

```dotenv
GLIDER_PYTHON=python                      # 解释器（见上表三态）
GLIDER_BACKEND=reference                  # auto / novaphy / reference
GLIDER_MAX_ACTIVE=2                       # 同时运行模拟上限
GLIDER_TIMEOUT=100                        # 单次最长仿真秒数（150m 稳定滑翔约 70s 才落地）
GLIDER_VIDEO=1                            # 0 关闭 MP4 回放
GLIDER_VIDEO_FPS=10                       # 回放帧率
GLIDER_VIDEO_MAX=300                      # 回放时长上限秒（默认不截断，覆盖全程含着陆）
```

### 结果说明

- 结果标签：`正常滑翔` / `成功着陆` / `横滚失控坠毁` / `失速下坠` / `超时结束`，对应引擎结束原因（`ok`/`landed`/`crashed(roll)`/`stalled/slow`/`timedout`…）。
- 视频为**固定世界机位**（高度朝上、地面在下方、全程可见），飞机盒体为便于全景观察而放大示意；真实气动数据看 HUD、遥测曲线与 3D 航迹图。
- 引擎默认关闭横滚/偏航自动保持（考察上反角/重心对被动稳定性的影响）；典型稳定组合例如上反角 6°、重心 +0.1 m、速度 36 m/s 可平稳着陆约 70 s。

## 已知限制

- 学校添加与学生批量导入以弹窗实现，无独立路由页面。
- 灵境小智为关键词规则匹配，不是真实生成式 AI。
- 一经选课不可退课：日常无退课入口，误导入仅管理员可异常修正（该生有作品/评价/反思时禁止移除）。
- 课程删除仅限“草稿 + 无报名历史 + 无作品”；发布/归档课程需先撤回，有报名记录的草稿建议归档保留。
- 反思日志仅限学生本人（教师/导师/管理员不可代写），每日一篇的边界为北京时间零点（UTC 存储 +8 小时换算）。
- 待办任务以“是否存在有效提交”为准，不再区分是否要求附件（纯文字任务同样进入待办）。
- 通知目前仅支持站内消息和 60 秒轮询，不含管理员公告编辑、定时发布、邮件、短信、WebSocket/SSE 或移动端推送。
- 课程学习页已重定位为“课程回顾页”（摘要/回放/资料/任务/我的提交），不再提供手动进度标记。
- 后端现有 45 个自动化测试（安全隔离、选课闭环、一致性接口、反馈与通知服务）；前端路由守卫、移动端抽屉导航、统一搜索防抖等体验项与部分业务模块测试仍在规划批次中。
- CI 已接入（`.github/workflows/ci.yml`：push/PR 触发后端测试 + 前端 lint/构建）；**main 分支保护需在 GitHub 仓库 Settings → Branches 中开启**（建议勾选 Require pull request + Require status checks 的 CI）。当前 `xzx-2` 分支承载本轮选课闭环与数据一致性修复，合并前建议按“测试站完整回归 → 新 PR → CI 绿 → 合并”流程推进。

## 服务器部署

部署分两档：**快速一键部署**（`deploy.sh`，适合测试/演示环境）与 **正式生产发布**（推荐：以 Git Release Tag 为基线，目录规范 + systemd + nginx + 独立数据目录 + 正式库初始化）。正式环境请遵循三条铁律：

1. **代码 / 数据 / 配置分离**：代码可删重建，用户文件与数据库必须持久在数据盘，配置含密钥不进仓库；
2. **迁移 ≠ 重置**：正式库用 `db:provision` 幂等初始化，严禁 `db:reset` / `db:init`；
3. **引擎与上传安全**：滑翔机引擎按上文三态配置解释器；所有上传文件与模拟结果都走鉴权 API，不需要对公网开放 `/uploads`。

### 0. 服务器前置依赖（首次）

- Node.js 22 LTS（建议独立安装到 `/opt/node-v22`，避免覆盖系统 Node 12）；
- `better-sqlite3` 需本地编译工具链：

```bash
# Ubuntu / Debian 系
sudo apt-get update && sudo apt-get install -y build-essential python3 nginx sqlite3
# Alibaba Cloud Linux / RHEL 系
sudo dnf install -y gcc gcc-c++ make python3 nginx
```

- 滑翔机引擎 Python 环境（仅需要该功能时）：见“滑翔机模拟（学生科创）”章节，例如 `/opt/novaphy`（Python 3.11 + novaphy wheel + numpy/matplotlib/imageio-ffmpeg）。

### 1. 快速一键部署（测试/演示环境）

```bash
cd 项目根目录
./deploy.sh main            # 部署 main 分支
RESET_DB=1 ./deploy.sh main # 重置数据库并恢复默认测试账号（仅测试环境）
```

脚本会依次完成：`git pull` → 后端 `npm ci` + 强制本机编译 `better-sqlite3` 并移除不兼容的 linux-x64 prebuild →（可选）`db:reset` → 前端 `npm ci && npm run build` → `rsync dist` 到站点目录 → 重启服务 → `curl /api/health`。

- 默认对应当前 ECS 测试环境：前端目录 `/var/www/pbl-platform`、systemd 服务 `pbl-backend.service`；
- 可覆盖的环境变量：`NGINX_ROOT`、`SERVICE`、`SYNC_DELETE=1`（同步删除旧文件）、`HEALTH_URL`。

### 2. 正式生产发布（推荐）

#### 2.1 发布基线：用 Release Tag，不直接部署 main

```bash
# 本地：测试通过后打正式版本号并推送
git checkout main && git pull
git tag -a v1.0.0 -m "PBL production v1.0.0"
git push origin v1.0.0
```

生产服务器只部署固定 Tag，保证“现在跑的是哪一版”永远可回答。

#### 2.2 首次服务器目录规范（示例，可按团队约定调整）

```text
代码：   /opt/pbl-platform/releases/<版本号>   # 每版本独立目录
运行软链：/opt/pbl-platform/current           # -> releases/<版本号>，升级时指回新版本
数据：   /datadisk/pbl-platform/{database,uploads,private_uploads/feedback,backups}
配置：   /etc/pbl-platform/backend.env        # root:pbl 640
```

```bash
sudo mkdir -p /opt/pbl-platform/releases /datadisk/pbl-platform/{database,uploads,backups} \
             /datadisk/pbl-platform/private_uploads/feedback /etc/pbl-platform
sudo useradd --system --create-home --home-dir /home/pbl --shell /usr/sbin/nologin pbl
sudo chown -R pbl:pbl /opt/pbl-platform /datadisk/pbl-platform
sudo chmod 750 /etc/pbl-platform
```

#### 2.3 拉取固定版本并构建

```bash
export PATH=/opt/node-v22/bin:$PATH
cd /opt/pbl-platform/releases
git clone --depth 1 --branch v1.0.0 <你的仓库地址> v1.0.0
sudo ln -sfn /opt/pbl-platform/releases/v1.0.0 /opt/pbl-platform/current

# 后端
cd /opt/pbl-platform/current/backend
npm ci --omit=dev
BETTER_DIR="node_modules/better-sqlite3"
PYTHON_BIN="${PYTHON:-/usr/bin/python3.11}"
NODE_GYP="${NODE_GYP:-$(command -v node-gyp || true)}"
if [ -z "$NODE_GYP" ]; then
  NODE_GYP="/usr/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js"
fi
(
  cd "$BETTER_DIR"
  PYTHON="$PYTHON_BIN" node "$NODE_GYP" rebuild --release --force_build=1
  if [ -f prebuilds/linux-x64.node ]; then
    mv prebuilds/linux-x64.node prebuilds/linux-x64.node.incompatible
  fi
)
npm test                       # 必须 PASS，失败即停止发布

# 前端（API 走同源 /api，由 nginx 反代）
cd /opt/pbl-platform/current/frontend
npm ci
VITE_API_BASE=/api npm run build
test -f dist/index.html && echo "frontend build OK"
```

#### 2.4 生产配置 `/etc/pbl-platform/backend.env`

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
API_PREFIX=/api

JWT_SECRET=<openssl rand -hex 64 生成，勿入库>
CORS_ORIGIN=https://你的正式域名

DB_PATH=/datadisk/pbl-platform/database/pbl_platform.db
UPLOAD_PATH=/datadisk/pbl-platform/uploads
FEEDBACK_UPLOAD_PATH=/datadisk/pbl-platform/private_uploads/feedback

# 滑翔机引擎（真 novaPhy）
GLIDER_PYTHON=/opt/novaphy/bin/python
GLIDER_BACKEND=auto

# 登录安全
LOGIN_RATE_LIMIT_IP=10
LOGIN_RATE_LIMIT_USER=5
ACCOUNT_LOCK_THRESHOLD=10
ACCOUNT_LOCK_DURATION=15
```

> `UPLOAD_PATH` / `DB_PATH` / `FEEDBACK_UPLOAD_PATH` 支持绝对路径（平台按绝对路径直接使用），务必指向数据盘，避免用户文件随代码 Release 一起被删除。

#### 2.5 正式库初始化（只执行一次；安全、幂等、无测试种子）

```bash
cd /opt/pbl-platform/current/backend
DB_PATH=/datadisk/pbl-platform/database/pbl_platform.db \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD='<至少 12 位强密码>' \
ADMIN_REAL_NAME=系统管理员 \
npm run db:provision
```

- 只建表 + 创建正式管理员（首登强制改密），**不会**写入 `admin123` 等测试账号；
- 之后学校的组织/课程通过平台界面导入维护；正式环境**严禁** `npm run db:reset` 与 `npm run db:init`。

#### 2.6 systemd 服务（`/etc/systemd/system/pbl-backend.service`）

```ini
[Unit]
Description=PBL Production Backend
After=network.target

[Service]
Type=simple
User=pbl
Group=pbl
WorkingDirectory=/opt/pbl-platform/current/backend
EnvironmentFile=/etc/pbl-platform/backend.env
ExecStart=/opt/node-v22/bin/node app.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/datadisk/pbl-platform

[Install]
WantedBy=multi-user.target
```

#### 2.7 Nginx（`/etc/nginx/sites-available/pbl-platform`）

```nginx
server {
    listen 80;
    server_name 你的正式域名;
    root /opt/pbl-platform/current/frontend/dist;
    index index.html;
    # 课程回放视频单文件最大 500MB，上限需大于该值
    client_max_body_size 520M;

    location / {
        try_files $uri $uri/ /index.html;   # SPA 路由
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并检查：`ln -s /etc/nginx/sites-available/pbl-platform /etc/nginx/sites-enabled/`，`nginx -t`；按域名/入口决定 HTTPS（网关或本机 443 + 证书）。

#### 2.8 上线检查与回滚

```bash
# 四层健康检查
curl -fsS http://127.0.0.1:3000/api/health   # 直接访问后端
curl -fsS http://127.0.0.1/api/health          # 经 nginx
curl -I  http://127.0.0.1/                     # 前端静态
curl -I  http://127.0.0.1/login                # SPA fallback
```

正式发布前完成业务冒烟（管理员/学术导师/教师/学生登录、执行导师/教师/管理员选课导入与管理员异常修正移除、课程回放上传与流式播放、课后任务提交、作品上传/下载、批改、成长档案、反思日志、反馈附件、通知、滑翔机试飞、未登录 401 / 无权限 403），并先做数据库备份（`sqlite3 <db> ".backup <文件>"` 后 `PRAGMA integrity_check`）。

**回滚**：`sudo ln -sfn /opt/pbl-platform/releases/<上一版本> /opt/pbl-platform/current && sudo systemctl restart pbl-backend`；数据库回滚需先停服、恢复 pre-deploy 备份、校验后再启动。

#### 2.9 备份规划（建议）

| 类型 | 策略 |
| --- | --- |
| 每日数据库备份 | 保留 7 天 |
| 每周完整备份 | 保留 4 周 |
| 每次部署前 | 强制备份 |
| 数据盘 uploads/private_uploads | 与数据库一起备份，并另存异机/NAS/对象存储 |

### 3. 服务器部署滑翔机引擎（如需该功能）

- 创建 Linux Python 3.11 环境并安装 novaPhy wheel 与渲染依赖（命令同“滑翔机模拟（学生科创）”章节）；
- `backend.env` 中 `GLIDER_PYTHON=/opt/novaphy/bin/python`（`GLIDER_BACKEND=auto` 即可）；
- 模拟结果图/视频写入 `UPLOAD_PATH/glider/<id>/`（即数据盘），随备份一起持久化。

## 账号权限整改进度

- 学生账号的创建、资料修改、学校/班级分配、导入和删除仅限管理员；教师和执行导师的学生列表不再显示添加、删除按钮。
- 学生删除、通用用户删除及批量删除统一检查学习记录。存在课程参与记录（含已移除选课）、进度、作品、反思、评价、成长记录、实验或小组参与记录时拒绝删除，并返回原因；批量删除跳过受保护账号。检查不依赖当前角色，避免变更角色后丢失历史档案。
- 第 6 条账号写权限及第 7 条删除数据保护已实施；空测试账号身份判定、导师/教师读取范围仍待后续整改。

### 学生账号停用、归档与恢复（方案第 7 条）

管理员在“用户管理”点击学生姓名，进入详情后可以操作：

| 操作 | 效果 |
| --- | --- |
| 停用账号 | 暂停登录和新选课，立即使旧登录会话失效，保留全部历史学习记录 |
| 归档账号 | 标记为已归档并记录归档时间，禁止登录和新选课，仍可通过管理列表及授权档案查询找到历史资料 |
| 恢复账号 | 恢复停用或归档学生的使用资格，清除当前归档标记；需要重新登录，原密码和首次改密要求保持不变 |

每次操作必须填写原因，管理员可在详情查看操作人、时间、原因和历史状态操作。教师、执行导师、学生、新媒体均不能操作。当前仅提供学生生命周期管理，不扩展到教师或导师账号。归档不删除原选课或作品，也不撤销工作人员原有的档案查阅权限。

后端启动时自动执行增量迁移 `003_student_lifecycle.sql`，新增归档时间、会话版本及状态历史表；新库初始化包含相同结构。继续双击 `start-dev.bat` 或按上文手动启动即可，**不需要运行 db:reset 或重新初始化数据库**。升级前请备份原数据库；若要回退代码，也需保留此次迁移和会话校验，避免旧代码忽略停用历史。

## License

本项目仅供“大中小贯通科创育人”项目组内部使用，仓库目前未包含独立的开源许可证文件。
