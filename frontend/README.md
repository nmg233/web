# PBL 科创育人平台前端

本目录是 PBL 科创育人平台的 React 单页应用，使用 Vite 开发和构建。

## 技术栈

- React 19
- Vite 8
- Ant Design 6
- React Router 7
- Axios
- Day.js
- ESLint 10

## 环境要求

- Node.js 22.12 或更高版本
- npm 10 或更高版本

## 安装

```powershell
cd frontend
npm ci
```

## 本地运行

请先在另一个终端启动 `backend` 服务，然后执行：

```powershell
npm run dev
```

前端默认运行在 `http://localhost:5173`。

Vite 已配置 `/api` 与 `/uploads` 代理到 `http://localhost:3000`，Axios 默认请求同源 `/api`；如需覆盖，可通过 `VITE_API_BASE` 环境变量指定。

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm run build` | 构建生产文件到 `dist` |
| `npm run preview` | 本地预览构建结果 |

## 入口与目录

```text
index.html
└── src/main.jsx
    └── src/App.jsx
        ├── api/          # Axios 客户端与模块 API
        ├── components/   # 布局、反馈、通知等公共组件
        ├── constants/    # 反馈与通知字典
        ├── hooks/        # 通知等共享状态 Hooks
        ├── pages/        # 页面组件
        └── store/        # 认证与通知状态
```

## 当前页面路由

路由定义以 `src/App.jsx` 为准，主要包括：

- `/login`、`/register`
- `/dashboard`、`/dashboard/schools/:id`、`/dashboard/ai`
- `/courses`、`/courses/create`、`/courses/:id`、`/courses/:id/edit`
- `/students`、`/students/:id`
- `/works`、`/works/upload`、`/works/:id`
- `/archives`、`/archives/reflection`
- `/feedback`、`/feedback/new`、`/feedback/:id`
- `/feedback/manage`（仅管理员）
- `/notifications`、`/notifications/:id`

反馈页面支持提交、筛选、分页、公开回复、私有附件下载、用户确认、重新处理以及管理员状态、优先级、处理结果和内部备注。

通知功能对所有已登录角色开放。顶部铃铛每 60 秒更新未读数，窗口重新获得焦点时也会刷新；展开铃铛可查看最近通知。通知中心支持阅读状态、分类和级别筛选，以及全部已读、清理已读、单条隐藏和已读/未读切换。当前通知仅通过站内轮询获取，不包含浏览器推送、邮件、短信、WebSocket 或 SSE。

`/dashboard/schools/add` 和 `/students/import` 暂无对应的 React 路由，虽然部分按钮仍会导航到这两个地址。

## 已知限制

- API 地址通过 `VITE_API_BASE` 环境变量配置，默认使用同源 `/api`。
- ESLint 当前仍有未处理的 Hooks 和未使用导入问题。
- 尚无前端自动化测试；反馈、通知与安全相关后端测试位于 `backend/test`。
- `src/assets/vite.svg`、`public/icons.svg` 等模板资源目前未被页面使用。
