# 二次复核补修：观察授权撤销

2026-10-18；基线 `07d3c8e`。仅修复既有观察授权撤销与教师迁校的相邻死锁，以及直接相关的授权行显示。未调整教学、奖励、主题、素材或PDF规则。

[真实操作截图](index.html) · [本次逐场景记录](verified-scenes.json) · [上轮补修档案](../patch-20261018/README.md)

## 问题与修复

正常移除无学习历史的报名后，旧代码把撤销当成新增授权检查，返回400“学生尚未报名此课程”；教师迁校又因active观察职责返回409。现在新增/重新启用和撤销分开校验：

- **新增/启用**：继续检查当前操作者、学校、教师及学生范围、课程管理、有效报名；没有有效报名仍拒绝。
- **撤销**：按教师—学生—课程三元主键及原学校快照定位既有记录。不存在或学校不匹配返回404，不创建空关系。管理员可以清理真实既有记录，不要求目标仍具备新增资格；mentor仍需当前学校/课程管理、教师创建来源及学生账号范围，且只能处理自己授予的记录。
- **历史与重试**：撤销只更新active、revision和更新时间，保留原来源、原授予人、学校快照；实际操作者及原因写原审计表。旧修订409，同请求重放及已撤销记录的再次确认不重复写审计、不生成新授权。写授权、审计及请求结果仍在同一立即事务内。
- **网页**：管理员“账号与组织→学校办学账号→学生×课程观察授权→核对并调整”，编辑既有行时用该行的原教师/学生/课程显示并锁定对象。对象不在新增候选中也不会变空，不要求重新报名。
- **迁校**：原保护保持；必须先撤销或交接全部active观察职责及原teacher_id职责，再用账号详情“编辑资料”调整学校/班级。不能靠删授权历史或关闭迁校检查通过。

## 本轮实际验证

|检查|结果与日志（工作树私有.local目录）|
|---|---|
|新增正确行为回归，修复前|`node --test backend/test/observationRevocation.test.js`：撤销实际400、预期200，失败；`observation-revoke-red-http.log`。旧复现脚本未当作修复后通过用例|
|新针对性HTTP+原权限回归|`node --test backend/test/observationRevocation.test.js backend/test/mentorAcceptancePatch.test.js backend/test/mentorSchoolWorkspace.test.js`：31通过；`observation-revoke-targeted.log`|
|完整后端|`node --test --test-concurrency=2 backend/test/*.test.js`：463通过、0失败；`observation-revoke-full-backend.log`，新增7项已包含，不重复相加|
|完整前端|`npm test`：139通过；`observation-revoke-frontend.log`。本次UI行为由下面真实浏览器覆盖，没有添加仅复制实现的单测|
|lint|`npm run lint`通过；`observation-revoke-lint.log`|
|两种构建|`npm run build`和`npm --prefix frontend run build -- --outDir ../build/mentor-observer-revoke`通过；`observation-revoke-production-build.log`、`observation-revoke-build.log`。原有chunk/混用导入提示保留|
|新增真实浏览器|`PBL_REGRESSION_DIST=build/mentor-observer-revoke node --test tests/observation-revocation.browser.test.js`：2业务场景通过（Node3项含父包装）；`observation-revoke-browser-final.log`|
|相关真实浏览器回归|同构建，`node --test --test-concurrency=1 tests/mentor-step1.browser.test.js tests/mentor-patch.browser.test.js`：14业务场景通过（Node16含2父包装）；`observation-revoke-browser-regression.log`|

本轮网页合计16个业务场景、Node19项，0失败/0跳过；不是把上轮27场景的历史结果算作本轮复跑。新HTTP和浏览器均使用临时合成SQLite和真实Express路由/JWT；网页为真实Edge。单进程5并行请求验证去重，不宣称多进程压力测试或真机验收。

### 正确行为证据

1. **网页完整链路**：管理员网页新建明确观察授权→教师能读指定课→管理员课程页面正常移除无历史报名200→迁校仍被409保护→从既有行撤销200→active=0、revision从1变2、一条撤销审计、原授予信息不变→管理员网页编辑教师迁校200→教师原页面及真实重新登录均404，课时预览403。原报名仍同一条removed，移除审计仍一条，没有新增报名。
2. **缺失候选**：合成学生停用后实际不在学生候选列表，但既有行仍显示原教师/学生/课程及ID；直接撤销成功，未重新启用该学生。
3. **针对性HTTP**：不存在的关系/错误学校404；旧修订409；5并行同key重放只产生一次撤销；当前新key确认已撤销不增加修订/审计；无权mentor、他人课程403；合法mentor撤自己的记录成功；无有效报名时新增及重新启用400；审计故障使整个事务回滚，原请求可重试成功。
4. **保留原权限**：完整后端及相关网页继续覆盖迁校持续隔离、委托撤销、管理员独立来源、本人创建来源及历史冻结例外；未修改观察读取策略或teacher_id旧职责交接。

### 首次失败与修正

- 初次沙箱禁止随机本机HTTP连接（EACCES）；获得本机测试执行权限后重跑，捕获实际报名资格400，不把沙箱失败当产品缺陷。
- 第一次实现误用授权表不存在的id列，真实HTTP500；改为原三字段主键定位后原链路通过。保留`observation-revoke-first-green.log`（实际失败，文件名不作为结论）、`observation-revoke-chain-green.log`及最终完整结果。
- 使用07d3c8e旧前端构建验证缺失候选：原学生select值为空而预期10004，真实失败；`observation-revoke-red-browser.log`。新构建通过，不靠恢复报名/账号解决。
- 首次新网页完整链路已经撤销成功，但测试严格匹配“编辑资料”漏了按钮图标的可访问名称；截图核对按钮存在，修正为包含文字的定位后完整链路通过。`observation-revoke-browser.log`保留首轮失败，`observation-revoke-browser-final.log`是实际最终成功。

## 准确预览、保护与迁移边界

预览：[http://127.0.0.1:4187/login](http://127.0.0.1:4187/login)，API3157。本轮已联合备份、仅停止4187、再做停服备份后，加载`build/mentor-observer-revoke`和同版后端；没有seed。HTTP健康200、数据库ready、schema1034，4187实际入口HTML的SHA256匹配本次独立构建。

备份目录：`.local/mentor-backups-20261018/observation-revoke-before-4187`、`observation-revoke-stopped-4187`。仍单列原已有1处缺失引用，不伪造补全。前后29张受保护表（含观察/组织审计、成长记录）所有原行原字段及5个上传文件字节一致；记录`.local/observation-revoke-persistent-preserved.json`。合成破坏性回归只在临时库演练，未在4187或教学库演练。

账号未改：私有`.local/mentor-review-20261018/acceptance-accounts.json`，不进Git。原4185/4186未重启，教学数据、人工文案和24件素材未修改。

**本次无新增迁移，已有1032–1034不改写**；这不表示先前三步没有数据库变更。无需新增导入/升级脚本。后续部署仍需由服务器负责人备份后加载同一提交的前后端；本轮仅推送自己的仓库，不提交上游PR、不部署公网、不开AI。完成后停止等待最终复核。
