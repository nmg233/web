# PBL 科创育人平台

面向“大中小贯通科创育人”项目的 PBL（项目式学习）本地数字化管理平台。平台围绕学校、班级、用户、课程、作品与成长档案，提供学生选课和作品提交、教师与导师管理、成长记录、反思日志、规则式学习助手、用户反馈闭环及站内通知等功能。

> 支持本地开发与服务器部署，部署步骤见文末“服务器部署”章节。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 8、Ant Design 6、React Router 7、Axios、Day.js |
| 后端 | Node.js、Express 4、REST API |
| 数据库 | SQLite、better-sqlite3 |
| 认证 | JWT、bcryptjs |
| 文件上传 | Multer、本地文件系统 |

前端使用 JavaScript/JSX；后端使用 CommonJS。`backend/views` 与 `backend/public` 是早期 EJS 版本遗留目录，不属于当前 React SPA 的主要运行链路。

## 环境要求

- Node.js 22.12 或更高版本
- npm 10 或更高版本

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
│   │   ├── schema.sql          # 数据库表结构
│   │   └── init.js             # 数据库初始化脚本
│   ├── uploads/                # 作品与课程资源上传目录（不公开静态托管）
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
│       ├── pages/              # 页面组件
│       ├── hooks/              # 通知等共享状态 Hooks
│       └── store/              # 认证与通知状态
├── deploy/
│   └── nginx.conf              # nginx 站点配置（HTTPS + 安全响应头 + 反代）
├── deploy.sh                   # 一键部署脚本
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
| `NODE_ENV` | 否 | 未设置 | 推荐本地设为 `development` |
| `JWT_SECRET` | 生产环境必需 | 开发时随机生成 | JWT 签名密钥；本地也建议固定设置，避免重启后 Token 失效 |
| `UPLOAD_PATH` | 否 | `uploads` | 相对于 `backend` 的上传目录 |
| `CORS_ORIGIN` | 否 | `http://localhost:5173` | 允许访问 API 的前端来源 |
| `API_PREFIX` | 否 | `/api` | API 路由前缀 |
| `DB_PATH` | 否 | `database/pbl_platform.db` | SQLite 路径；自动化测试会覆盖为临时数据库 |
| `ALLOW_REGISTRATION` | 否 | `false` | 是否开放学生自助注册；默认关闭，设为 `true` 才开放 |
| `REGISTER_RATE_LIMIT` | 否 | `5` | 注册接口同 IP 每分钟最大次数 |

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

仅在 `backend/database/pbl_platform.db` 不存在时执行：

```powershell
npm run db:init
```

如果数据库已经存在，初始化脚本会退出以保护现有数据。

```powershell
npm run db:reset
```

`db:reset` 会删除并重建数据库，清空全部现有数据，仅应在明确需要重置本地测试数据时使用。

### 4. 安装前端依赖

```powershell
cd ..\frontend
npm ci
```

## 本地运行

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

Vite 已配置 `/api` 与 `/uploads` 代理到 `http://localhost:3000`，前端请求同源 `/api`，本地开发无需跨域。生产环境由 nginx 将 `/api` 代理到后端。

## 常用命令

### 后端

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 使用 nodemon 启动本地开发服务 |
| `npm start` | 使用 Node.js 启动服务 |
| `npm test` | 使用 Node.js 内置测试框架执行后端测试 |
| `npm run db:init` | 在数据库不存在时创建数据库和测试数据 |
| `npm run db:reset` | 删除并重建本地数据库，会清空数据 |

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
| 管理员 `admin` | 学校、班级和用户管理；课程与作品管理；成长档案 |
| 执行导师 `executive_mentor` | 学生管理；本人创建课程的管理 |
| 学术导师 `academic_mentor` | 学生查看与评价；本人创建课程的管理 |
| 教师 `teacher` | 本校学生管理；作品查看和批改；成长记录 |
| 学生 `student` | 注册、选课、上传作品、反思日志、个人成长档案 |
| 新媒体 `media` | 预留角色，暂无独立功能入口 |

所有已登录角色均可提交反馈、查看自己的反馈、追加说明和确认处理结果，也可以通过顶部铃铛和通知中心接收、筛选及管理站内通知。管理员可查看全部反馈、设置优先级和状态、填写处理结果，并添加仅管理员可见的内部备注。

## 当前前端页面

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录 |
| `/register` | 注册 |
| `/dashboard` | 工作台 |
| `/dashboard/schools/:id` | 学校详情 |
| `/dashboard/ai` | 规则式学习助手 |
| `/courses` | 课程列表 |
| `/courses/create` | 创建课程 |
| `/courses/:id` | 课程详情 |
| `/courses/:id/edit` | 编辑课程 |
| `/students` | 学生与用户管理 |
| `/students/:id` | 学生详情 |
| `/works` | 作品列表 |
| `/works/upload` | 上传作品 |
| `/works/:id` | 作品详情 |
| `/archives` | 成长档案 |
| `/archives/reflection` | 反思日志 |
| `/feedback` | 我的反馈 |
| `/feedback/new` | 提交反馈 |
| `/feedback/:id` | 反馈详情与沟通记录 |
| `/feedback/manage` | 管理员反馈管理 |
| `/notifications` | 通知中心、筛选与批量操作 |
| `/notifications/:id` | 通知详情 |

前端目前存在指向 `/dashboard/schools/add` 和 `/students/import` 的按钮，但 `App.jsx` 尚未注册对应页面路由。这两项属于待完成的前端迁移功能，不应视为当前可用页面。

## API 概览

| 模块 | 默认前缀 | 说明 |
| --- | --- | --- |
| 认证 | `/api/auth` | 登录、注册、当前用户、学校和班级 |
| 工作台 | `/api/dashboard` | 统计、学校管理、学习助手 |
| 课程 | `/api/courses` | 课程、课时、任务、资源和选课 |
| 学生 | `/api/students` | 用户、学校、班级和批量导入 |
| 作品 | `/api/works` | 上传、查看、批改和版本管理 |
| 档案 | `/api/archives` | 成长档案、反思、评价和成长记录 |
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

## 规则式学习助手

当前“AI 学习助手”尚未连接大语言模型或外部 AI API。后端根据 PBL、月球、无人机、火星、VR 和反思等关键词返回预设内容，并可附带有限的课程上下文。对外介绍时宜称为“规则式学习助手”。

## 默认本地测试账号

数据库初始化脚本会创建以下测试账号：

| 身份 | 姓名 | 密码 |
| --- | --- | --- |
| 管理员 | 管理员 | `admin123` |
| 执行导师 | 张导师 | `mentor123` |
| 教师 | 李老师 | `teacher123` |
| 学生 | 王小明 | `student123` |

这些账号用于本地开发和测试部署。测试环境可保留默认账号便于验收；公网正式发布前应修改或删除默认密码，并设置固定、强随机的 `JWT_SECRET`。

> 学生自助注册默认**关闭**（`ALLOW_REGISTRATION=false`）。测试服务器如需验收「注册」流程，可临时设为 `true`；对外公开前建议保持关闭，改为管理员创建账号。

## 本地数据

- SQLite 数据库：`backend/database/pbl_platform.db`
- SQLite WAL 文件：`backend/database/pbl_platform.db-wal`
- SQLite 共享内存文件：`backend/database/pbl_platform.db-shm`
- 作品与课程资源上传文件：`backend/uploads/`（不公开静态托管）
- 私有反馈附件：`backend/private_uploads/feedback/`
- 环境变量：`backend/.env`

以上内容均被 Git 忽略。数据库的 `-wal` 和 `-shm` 文件可能包含运行状态或尚未检查点的数据，不应在服务运行时单独删除。

## 已知限制

- `/dashboard/schools/add` 与 `/students/import` 前端路由尚未实现。
- 学习助手为关键词规则匹配，不是真实生成式 AI。
- 前端 ESLint 当前仍有未处理的问题。
- 通知目前仅支持站内消息和 60 秒轮询，不含管理员公告编辑、定时发布、邮件、短信、WebSocket/SSE 或移动端推送。
- 反馈、通知与安全相关模块已有自动化测试；作品等部分业务模块仍缺少完整测试，项目尚无 CI。
- 后端仍保留早期 EJS 页面、静态资源和部分未使用依赖。

## 服务器部署

1. 安装 better-sqlite3 本地编译所需依赖：

Alibaba Cloud Linux / RHEL 系（当前测试服务器）：

```bash
sudo dnf install -y gcc gcc-c++ make python3
```

Ubuntu / Debian 系：

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

2. 配置后端环境变量，生产环境必须设置 `JWT_SECRET`：

```bash
cd backend
cp .env.example .env
```

3. 执行一键部署脚本（默认部署 main 分支）：

```bash
./deploy.sh main
```

如需重置数据库并恢复默认测试账号：

```bash
RESET_DB=1 ./deploy.sh main
```

脚本会依次完成依赖安装、better-sqlite3 本地编译、前端构建、同步 `dist`、重启服务并做健康检查。nginx 需将 `/api` 代理到后端，并用 `try_files $uri $uri/ /index.html;` 支持 SPA 路由。仓库提供了现成的 `deploy/nginx.conf`，见下节。

脚本默认对应当前 ECS 环境：前端目录 `/var/www/pbl-platform`、systemd 服务 `pbl-backend.service`。如需调整，可通过 `NGINX_ROOT`、`SERVICE` 环境变量覆盖；需要同步删除旧文件时设置 `SYNC_DELETE=1`。

### nginx 配置与 HTTPS

仓库 `deploy/nginx.conf` 提供了完整的 nginx 站点配置，包含：

- HTTP → HTTPS 跳转（启用证书后打开 `return 301`）
- TLS 1.2/1.3、HSTS
- 安全响应头（`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy` 等，用于防点击劫持与 MIME 嗅探）
- `/api` 反向代理到 `127.0.0.1:3000`，以及对齐后端 multer 上限的 `client_max_body_size 110m`

部署步骤：

1. 将 `deploy/nginx.conf` 放到 `/etc/nginx/conf.d/`（http 上下文），替换其中的 `your.domain.com` 与证书路径：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/pbl-platform.conf
sudo nginx -t && sudo systemctl reload nginx
```

2. 申请证书（裸 IP 无法申请免费证书，需域名）：

```bash
# Let's Encrypt（需域名已解析到本机）
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

> 阿里云免费 DV 证书或 CDN/WAF 边缘 HTTPS 亦可；测试环境临时可用自签名证书（浏览器会告警）。

3. 确认安全头生效：

```bash
curl -sI https://your.domain.com/ | grep -iE 'Strict-Transport|X-Frame|X-Content|Referrer'
```

## License

本项目仅供“大中小贯通科创育人”项目组内部使用，仓库目前未包含独立的开源许可证文件。
