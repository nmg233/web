# 实际验证记录 · 2026-10-20

> 2026-10-22 规则更新：本文保留当时的验收事实，其中“先关闭再编辑／审批恢复”已被取消。当前使用[不停课修订与审批流程](../课程不停课修订与审批验收_2026-10-22.md)，不再按旧关闭步骤操作。

最终代码在隔离工作树 `feat/staff-desk-guide` 上验证。测试通过后才生成此记录。使用真实 Edge 和临时 SQLite；教学库、原上传目录、正式站均未写入。

## 最终检查

| 检查 | 实际结果 |
|---|---|
| `npm run lint --prefix frontend` | 通过，0 错误、0 警告 |
| `npm test --prefix frontend` | 144/144 通过，0 失败、0 跳过 |
| `npm run build --prefix frontend -- --outDir ../build/staff-desk` | 通过；保留既有 chunk 大小、Lab 同时静态/动态导入的提示 |
| 相关后端测试（下方14文件） | 107/107 通过，0 失败、0 跳过 |
| 4 份真实浏览器测试 | 26 个业务场景全部通过；Node 汇总 30/30（包含4个父测试容器） |
| `git diff --check` | 通过 |
| 静态素材 ZIP | CRC、10 个源文件 SHA-256 全部通过；没有 DB、上传、账号或动效 |
| 本地私有预览 | 管理员、mentor 均真实登录；工作台与报告详情接口均返回200 |

[机器可读场景与尺寸记录](verified-scenes.json) · [真实截图](index.html)。最终前端入口为 `/assets/index-XMC4Ynj2.js`，完整 index 摘要见 JSON。原始测试日志保存在本机 `.local/staff-desk-review/` 的 `lint-final.log`、`frontend-unit-final.log`、`build-final.log`、`backend-final.log`、`browser-final.log`；不包含验收密码的文档和截图才进入仓库。

## 关键场景

| 场景 | 验证方式与结果 |
|---|---|
| 管理员与mentor书桌 | 两角色真实页面通过；1440×900、1280×720 概览一屏，768×1024、390×844、360×640、720×450 没有横向溢出，窄屏继续纵向滚动 |
| 北京时间与侧栏 | 页面时间与 Asia/Shanghai 格式核对通过；五项侧栏、收起图标、Enter进入、可见焦点均通过 |
| 真实待办与统计 | SQL 计数、分页返回5行、跨页对象不重复、同一申请进入两个队列但总数只计一次、他课待办不可见，均通过 |
| 直达与返回 | 从第2页课程、报告进入具体对象后返回保留分类和页码；报告使用自身「返回评审队列」按钮验证，工作台不再请求旧 `/api/dashboard` 重复统计 |
| 角色指南 | 两角色分别显示适用任务、权限、导航路径与去办理；管理员独有学校授权，mentor独有外部学校申请；课程包CTA真实进入上传页面 |
| 旧申请入口 | admin旧section=applications以及mentor organization缺省section的旧链接都打开原学校申请会话；保留类型/状态过滤与审批记录，不生成第二份申请 |
| 直接学校授权 | 管理员真实保存并撤销；非管理员、角色字段注入、修订冲突被拒绝；4次并发同请求只写1次审计、不伪造批准申请 |
| 权限彼此独立 | 学校权不开放他课或其他已有学生；直接授权可本校建号，跨校拒绝；撤权后建号与教师观察立即拒绝，原课程管理和报名保留 |
| 保存失败与重试 | 浏览器模拟503后学校、导师、原因与确认保持；恢复后成功保存。保存按钮的加载与重试名称固定，避免加载图标影响可访问名称 |
| 局部网络错误/空队列 | 工作台明确错误并可重试；真实空待办显示空状态，不把失败当0；编辑表单不因读取失败卸载 |
| 反馈/通知/附件 | 学生显式课程反馈、导师领取/公开回复、内部说明、附件、转交/转回、通知直达原会话及已读不消待办，通过；撤课/撤权后旧反馈和收件拒绝访问 |
| 课程包恢复 | 上传校验、写入预览、确认回包丢失后查询原结果、不重复导入、恢复暂存追加原课程、原课时保留，通过；后端覆盖跨课程、撤权、附件和重放限制 |
| 教材与学习闭环 | 真实上传关卡图、缺图降级、四公共主题、逐课时维护、正式课时先关闭/审批恢复、文章与卡题、教师只读、作答、报告评审和金币沿原规则，通过 |
| 其他角色与原样式 | 学生/教师/新媒体没有管理端校园类名；退出清除portal角色标记；课程六区、真实顶栏吸顶偏移、弹窗Escape回焦、减少运动偏好，通过 |
| 1034/1035/空库 | 增量到1036、备份校验、隔离恢复、旧记录原文、重复迁移不重写、完整性与外键检查通过 |
| 日志脱敏 | 响应日志只记录方法、路由模板、状态；全局/认证异常只输出安全错误码，不输出测试密码、查询参数、响应正文或堆栈 |

## 查询与轮询边界

工作台把11类计数合为1个SQL语句，另有按对象去重总数、所选队列LIMIT/OFFSET、最多4个文件夹查询；没有把所有报告/作品加载后在JavaScript切片，也没有为每个文件夹加载完整课程。反馈路由修复每次最多处理100个确有失效关系的对象，积压需后续请求继续处理。未声称重构全平台全部旧列表或开展正式数据库压力测试。

隐藏状态的定时器取消、恢复单次请求、在途请求不重叠和销毁清理使用可控调度器单测通过；这是明确的单测证据，未声称完成真实设备后台轮询实验。720×450 验证等效放大后的CSS阅读空间，没有操作浏览器原生缩放或手机硬件。

## 可复现命令

```powershell
npm run lint --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend -- --outDir ../build/staff-desk
node --test --test-concurrency=1 backend/test/staffDeskMigration.test.js backend/test/mentorSchoolWorkspace.test.js backend/test/mentorConversations.test.js backend/test/lessonMaintenanceScripts.test.js backend/test/coursePackages.test.js backend/test/publicationWorkflow.test.js backend/test/publicationHttp.test.js backend/test/authorizationMatrix.test.js backend/test/courseAuthorizationSchools.test.js backend/test/feedbackService.test.js backend/test/upstreamLearningIntegration.test.js backend/test/studentRewards.test.js backend/test/rewardRedemptions.test.js backend/test/deployAtomic.test.js
$env:PBL_REGRESSION_DIST='build/staff-desk'
node --test --test-concurrency=1 tests/staff-desk.browser.test.js tests/staff-campus.states.browser.test.js tests/mentor-step2.browser.test.js tests/mentor-step3.browser.test.js
```

测试运行时需允许本机HTTP及浏览器子进程；初次受限沙箱的localhost连接被系统拒绝，最终在获准的隔离测试进程中重跑通过。旧浏览器脚本已按上游1035流程，改为正式课时先关闭、课题/课时提交管理员批准。

## 待确认及未执行

- 正式站公开health标记为15df35d/schema1034，当前上游main为6f998a2并包含1035。实际部署制品SHA仍须运维确认，不能认定当前main就是线上代码。
- 未在正式教学库执行迁移、导入、重建或恢复，未公网部署，未提交上游PR。
- 本轮无教学/素材数据导入。1036结构升级与联合备份、恢复操作见UPGRADE；私有预览账号/合成库不可作为正式数据交付。
- 未新增AI能力、积分规则或场景动效；未改物理仿真源码，本轮没有重复运行真实试飞测试。
