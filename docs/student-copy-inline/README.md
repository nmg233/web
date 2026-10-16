# 学生效果预览原位编辑补修

基线：自己的 `feat/lesson-maintenance-copy@b3611dc`。本轮只补修管理员原位编辑、保存与学生读取，不操作生产，不更改奖励、课程分配、学习完成规则或 AI 配置。

- [管理员操作指南](admin-guide.md)
- [验证记录及待办边界](verification.md)
- [截图验收入口](index.html)
- [服务器部署增量说明](deployment.md)
- [后续统一 PR 描述](PR-description.md)

本地验收入口：`http://127.0.0.1:4185/student-copy`。管理员 `review_admin`，学生 `review_student`；密码继续使用本机私有 `.local/acceptance-20261016/acceptance-accounts.json`，未复制到仓库或交付包。该环境是独立合成验收环境，原有人工修改保留，普通启动不初始化。仅本机访问，不是公网部署。

源码工作树：`C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`。启动、停止：

```sh
npm run build:teaching
node scripts/teaching.mjs start --data .local/acceptance-20261016
node scripts/teaching.mjs stop --data .local/acceptance-20261016
```

原服务器交接包、计划模板、第四课时素材和导入脚本保持不动。本轮没有新增 SQL 迁移，不需要重新导入课时。完整源码更新与前后端一同部署后才具有新界面与接口。
