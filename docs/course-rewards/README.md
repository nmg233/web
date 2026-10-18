# 管理端三步最终验收：课程奖励

本步基于 f61399f（含第一步903232a），分支 `feat/course-rewards-final`。只提交/推送自己的 `shrrrrrrrr/web-frontend-test`；未向 nmg233/web 创建PR，未部署公网。上游只读 main 核对为 b862a16e4c8b8ac24cd4a9cf82041bf7ea9a7b0a。

- [真实截图与总验收入口](index.html)
- [课程奖励操作指南](rewards-guide.md)
- [课程/课时填写、四类模板与发布](course-content-guide.md) · [字段清单](course-fields.md)
- [主题、教材、回放素材格式](material-formats.md)
- [课程授权、学校审批、班级学生建号](authorization-schools-guide.md)
- [五模块迁移表与权限](navigation-permissions.md)
- [迁移、备份与部署边界](deployment.md)
- [实际验证记录](verification.md)

本步接入课程礼品、图片、订单、兑换徽章归属；admin与显式授权导师管理同一课程奖励。新课默认关闭通关勋章，逐课时可保存草稿、复用或上传图案；完整且启用的定义才按原学习条件授予。关闭不删历史、不影响金币或兑换章。学生保留统一真实金币与签到，礼品/未获章只展示有效报名且已发布课程，可从个人入口或课程内筛选进入。既有获章、本人历史订单和金币明细保留，不恢复失效课程教材权限。

未知旧礼品保留管理员核对/履约和本人历史，未自动分配课程。逐项绑定需要明确目标、依据、版本检查和审计；已绑定不能转移，跨课程复用新建独立礼品。本轮未给两个持久环境导入测试礼品、订单或余额，未自动审批学校，未改评分、签到和金币规则。

## 本地预览

原教学：<http://127.0.0.1:4185> → `.local/acceptance-20261016`；独立操作副本：<http://127.0.0.1:4186> → `.local/authorization-review-20261017`。工作树 `C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`。两个环境分别备份升级1031，保持原账号和输入；私有凭据在各自 `acceptance-accounts.json`，不要提交。只监听本机。

截图来自另一个合成隔离库，测试学校、课程、礼品、1金币价格及教材均不冒充正式内容。正式奖励由维护者录入，未确认旧归属继续待核对。没有课程钱包、自动报课、共享库存、评分重算或新AI接入。验收后再另行安排上游PR或部署，本步交付后停止。
