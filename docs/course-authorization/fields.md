# 字段与接口说明

没有新增教学字段、奖励规则或导入教材。本轮新增授权、申请与组织审批关系；课程图片、回放、文章和附件格式沿用第 1 步 [字段说明](material-formats.md)。日常操作不需要修改 JSON。

|表单|字段与限制|
|---|---|
|课程授权|有效 academic_mentor；授予/撤销；原因必填≤1000字；当前修订与幂等编号由页面携带|
|学校申请|学校名称必填≤120字；地区必填≤120字；说明必填≤2000字；联系人选填≤120字、联系方式选填≤200字|
|申请审批|批准/驳回；驳回说明必填≤1000字；同名关联额外要求明确学校ID、确认勾选与核对说明|
|学校授权撤销|原因必填≤1000字；当前修订与幂等编号|
|学校班级|名称与年级必填，各≤120字；学校由当前上下文固定|
|学校学生|姓名必填≤120字；本校班级必选；账号选填，沿用4–160位原规则；密码/角色/权限字段不接受|

学校名称按 NFKC、首尾空格、连续空格和大小写规范化用于疑似重名核对，原输入名称仍保留；不因同名自动授权已有学校。没有额外学生证件、家庭或敏感信息采集。

|接口|用途与权限|
|---|---|
|GET/POST `/api/courses/:id/managers`|管理关系列表；仅 admin 写入，授权 mentor 可读本课关系|
|GET/POST `/api/school-applications`|admin 审核列表；mentor 仅自己列表/提交|
|POST `/:id/review`（school-applications 下）|admin 批准/驳回，expectedRevision 防覆盖|
|POST `/schools/:schoolId/managers/:mentorId/revoke`|admin 撤销学校管理|
|GET/POST `/schools/:schoolId/classes`|获准 mentor 读取本校班级及本人创建学生/创建班级|
|POST `/schools/:schoolId/students`|获准 mentor 创建固定学生角色，重试只创建一次|
|GET `/schools/:schoolId/students/:id/credentials`|获准 mentor 私有交付本人创建的有效初始凭据；no-store|

所有学校子路径均在 `/api/school-applications` 下。写入需稳定 `request_key`；同编号不同内容拒绝409。同一逻辑写入先回读或重试原编号，确认改内容后才生成新编号。403/404表示对象或权限不可用，409表示修订/状态冲突，400表示字段或原业务约束不满足。

学校及课程授权审计均为真实持久记录。通知使用现有 durable outbox，投递失败可恢复，不会因重新审批产生第二所学校或第二个账号。审批时无管理员/导师有效状态则拒绝；没有用前端隐藏代替后端校验。
