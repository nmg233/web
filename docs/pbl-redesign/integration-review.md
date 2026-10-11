> 更新：本文保留首轮提案历史。当前真实礼品兑换、验证结果及尚存整合边界以 [最新交付](../real-redemption/README.md) 为准；旧文中的“尚无正式兑换”和迁移编号阻断描述已过期。

# 合并前整合检查

目标核对点 681328d；源码复制基线49c179e。以下是实际差异，不是已完成的合并结果

## 数据库：阻断直接部署

| 编号 | upstream main | 本提案 |
| --- | --- | --- |
| 016 | replay_summary | course_avatar_preferences |
| 017 | account_batches | course_content_maintenance |
| 018 | learning_versions | course_plan_templates_account_avatar |
| 019 | operations_safety | course_plan_detach_lesson |
| 020 | release_closure | open_reflections |

本提案还新增021徽章/演示事件、022金币、023课时可视化维护。两边迁移器按数字版本记录；同号异义可能导致跳过必要建表/字段，不能仅靠Git解决冲突或提高MAX(version)判断可用

维护者需分配统一迁移版本，核对schema与迁移名/真实列，制定本地旧库和upstream已升级库两条兼容路径。不能只改SQL文件名后启动正式库。应在隔离备份副本验证升级、重复执行、外键/完整性、原业务记录和附件保持、恢复/前向修复；不reset或覆盖正式数据

## 接口与业务

- 学习版本：upstream已增加教材版本绑定、报告历史/替换等语义；同源教材编辑的保存/发布/冲突应与其统一。已提交报告对应教材版本不能被当前编辑覆盖
- 账号/组织：保留upstream批次导入、临时密码、组织转移与维护期保护。普通教师仍仅观察负责学生，不因共享编辑UI获得写权限
- 权限：将课程空间适配与现有服务端对象授权统一；检查退课/撤回/旧链接/私有附件/AI资料，不用前端隐藏替代鉴权
- 奖励：共同确认最新有效报告、原全部任务完成与版本变化的判据；历史缺分不伪造分数；真实账本一次结算且与演示余额隔离
- 通知：演示兑换的管理员提示与upstream持久outbox/幂等/重试机制统一；尚无正式兑换扣款、库存或领取闭环
- 资料：统一文件类型/签名/大小/MIME、私有下载、AI索引更新和上传幂等，不把UI列出的格式等同于都能解析或在线预览
- 试飞：保留upstream新增三维回放和渲染资源，与新工作区适配；本提案只验证参考引擎和现有结果，不宣称新增物理算法
- 工程：统一node/依赖锁文件、CSP/反向代理、readiness、备份和原子部署；共享API包体积提示需实测优化。不要用本地预览工具代替生产部署

## 文档和验证

历史README与轮次文档包含过去状态，最终统一入口以本目录和合并后的正式操作手册为准。保留人工文案与正式教材，明确当前版本/发布责任人

合并后的全套验证必须同时涵盖两边的新测试、Windows已有体验及目标Linux/Node环境；另补真实手机、真实文件和正式AI provider验收。此提案没有完成该整合验证

## 两边同路径改动清单

从共同基线比较，两边有48个同路径改动。以下是路径交集，不等于全部会产生Git文本冲突；迁移同号异义也不会自动被Git识别

- .gitignore
- README.md
- backend/app.js
- backend/controllers/archiveController.js
- backend/controllers/authController.js
- backend/controllers/courseController.js
- backend/controllers/gliderController.js
- backend/controllers/workController.js
- backend/database/schema.sql
- backend/middleware/upload.js
- backend/routes/courses.js
- backend/services/learningService.js
- backend/services/mentorReviewService.js
- backend/services/observerService.js
- backend/test/authorizationMatrix.test.js
- backend/test/enrollment.test.js
- backend/test/studentLifecycle.test.js
- frontend/package.json
- frontend/src/App.jsx
- frontend/src/api/index.js
- frontend/src/components/Header.jsx
- frontend/src/components/Sidebar.jsx
- frontend/src/components/TempPasswordModal.jsx
- frontend/src/pages/archives/Index.jsx
- frontend/src/pages/auth/ChangePassword.jsx
- frontend/src/pages/courses/Detail.jsx
- frontend/src/pages/courses/Learning.jsx
- frontend/src/pages/courses/List.jsx
- frontend/src/pages/dashboard/Index.jsx
- frontend/src/pages/dashboard/School.jsx
- frontend/src/pages/feedback/Form.jsx
- frontend/src/pages/glider/Simulator.jsx
- frontend/src/pages/learning/LessonLearn.jsx
- frontend/src/pages/mentor/ContentHub.jsx
- frontend/src/pages/mentor/LessonContentEditor.jsx
- frontend/src/pages/mentor/ReviewDetail.jsx
- frontend/src/pages/notifications/List.jsx
- frontend/src/pages/observer/Dashboard.jsx
- frontend/src/pages/observer/StudentDetail.jsx
- frontend/src/pages/observer/StudentList.jsx
- frontend/src/pages/students/Detail.jsx
- frontend/src/pages/students/List.jsx
- frontend/src/pages/tasks/Detail.jsx
- frontend/src/pages/tasks/List.jsx
- frontend/src/pages/works/Detail.jsx
- frontend/src/pages/works/Upload.jsx
- frontend/src/utils/accountExport.js
- frontend/vite.config.js
