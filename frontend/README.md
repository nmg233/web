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
| `npm test` | 运行前端工具、组件渲染及会话乱序回归测试 |
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

- `/login`、`/change-password`（公开注册已关闭）
- `/dashboard`、`/dashboard/schools/:id`、`/dashboard/ai`
- `/courses`、`/courses/create`、`/courses/:id`、`/courses/:id/edit`
- `/courses/:courseId/lessons/:lessonId/learn`：学生三阶段课后学习
- `/courses/:courseId/lessons/:lessonId/content`：管理员/负责课程导师编排
- `/courses/:courseId/lessons/:lessonId/preview`：按授权只读预览
- `/mentor/reviews`、`/mentor/reviews/:reportId`：报告评审
- `/observer`、`/observer/students`、`/observer/students/:studentId`：教师只读学情
- `/tasks`、`/tasks/:id`、`/glider`：课后任务与独立实验工具
- `/students`、`/students/:id`
- `/works`、`/works/upload`、`/works/:id`
- `/archives`、`/archives/reflection`
- `/feedback`、`/feedback/new`、`/feedback/:id`
- `/feedback/manage`（仅管理员）
- `/notifications`、`/notifications/:id`

反馈页面支持提交、筛选、分页、公开回复、私有附件下载、用户确认、重新处理以及管理员状态、优先级、处理结果和内部备注。

通知功能对所有已登录角色开放。顶部铃铛每 60 秒更新未读数，窗口重新获得焦点时也会刷新；展开铃铛可查看最近通知。通知中心支持阅读状态、分类和级别筛选，以及全部已读、清理已读、单条隐藏和已读/未读切换。当前通知仅通过站内轮询获取，不包含浏览器推送、邮件、短信、WebSocket 或 SSE。

学校新建、账号导入使用页面弹窗，不导航到不存在的 `/dashboard/schools/add` 或 `/students/import`。导师单独的预览侧栏入口已移除，仍可从对应课时进入；AI、实验、独立成果和历史回放保留。手机宽度使用抽屉导航、学生课程卡片，不等同于 Android/iOS 真机验收。

## 已知限制

- API 地址通过 `VITE_API_BASE` 环境变量配置，默认使用同源 `/api`。
- ESLint、组件渲染与工具回归用上述命令检查；后端闭环测试位于 `backend/test`，本地全绿不代表生产已验收。
- 生产构建仍有大分块提示，部分 Ant Design 旧组件存在弃用提示，尚需性能/组件迁移验收。
- 视频支持短期播放地址续期、失败手动重试、上传停止与按请求标识查询结果；不提供断点续传/后台上传，近500MB弱网和长视频尚待实测。
- 其余真实设备、生产部署、AI及数据恢复门禁见根目录的 `本轮整改进度与验收_2026-10-11.md`。
- `src/assets/vite.svg`、`public/icons.svg` 等模板资源目前未被页面使用。
