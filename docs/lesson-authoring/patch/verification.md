# 本轮实际验证记录

计数以业务场景为准；Node 父套件、五种尺寸、截图及重复复跑均不增加场景数。全部写入、故障注入、试飞、评分和签到均在独立合成环境进行。

## 修复前证据

新增 `tests/lesson-authoring-patch.browser.test.js` 先针对旧构建运行。`test-results/authoring-patch-red.log` 中阶段切换、保存正文后切预览及报告标签按目标行为断言失败；仅选图片分支最初因测试写错“资料说明”全称未到业务断言。修正选择器后 `authoring-patch-red-corrected.log` 的 4 个业务场景全部失败：前三种离开无确认，报告缺少可访问名称“学习总结”。程序返回非成功，未把观察到缺陷当作通过。

独立复核原始 `root-confirmed` 和 `test-results/root-lesson-authoring` 文件保持原样。

## 九项新增原生场景

| 场景 | 通过依据 |
| --- | --- |
| 阶段切换取消/确认 | 取消后原正文和当前阶段不变，服务端未写；确认后面板关闭，切回无假 dirty |
| 仅选图片关闭 | 取消后 File 对象及输入节点相同，原标题说明和待上传状态不变；之后上传字节等于原文件 |
| 正文已保存仍有待上传图片 | 切预览继续确认，取消队列仍在；确认丢弃后正常返回编辑 |
| 报告五标题 | 编辑与学生效果模式均有原可访问名称，字段为空且禁用，提交禁用；无个人学习/报告/进度/奖励请求 |
| 卡片及关联编辑入口 | 取消保留指导及原卡片；确认才切卡片并清面板，服务端未写 |
| 上传失败后的离开 | 保存正文后取消课时、侧栏、原生站内后退，File/标题/说明保留；重试沿原 token，只新增一份资源 |
| 上传已写但响应丢失 | 队列显示结果未确认，正文保存不解除保护；取消保留 File/token，重试核对同一真实 ID，无重复资源 |
| 保存/上传进行中 | 暂不执行阶段、预览或侧栏卸载；当前内容保留，处理结束后可继续 |
| 五种尺寸输入/上传/报告 | 1920×1080、1440×900、1024×768、768×1024、390×844；取消保留标题、段落、图片选择及队列，无横向溢出，报告五标题与禁用状态正确 |

原值、队列和服务端未写入断言见本机 `../browser/patch-checked/cancel-evidence.json`；完整报告表单及截图从同目录 index 进入。

## 首跑失败与纠正

- 扩展测试首跑错用了上传状态简称，以及把既有上传响应 200 写成 201。校正真实文案和契约，保留 `authoring-patch-expanded-first.log`，没有修改后端响应或放宽业务断言。
- 初版后退测试从整页 goto 建历史，取消后 Playwright 仍等整页 load；改为从真实课程列表通过链接进入，再执行原生后退。另修正 goBack 返回与 dialog 事件的等待顺序，必须真正收到确认框后取消。
- 段落输入用稳定图文块定位后读取原值，原有含输入值的隐式 label 不再作为精确重复定位；未修改系统文案。报告五标题仍严格用可访问名称定位。
- 既有维护和教学首跑揭示本次中间实现把“重新读取”做成整页预览重挂载，重置课时，导致“另一位维护者已保存”和卡片阶段找不到。改为只重置编辑面板，保留课时/阶段，原样复跑通过；失败日志为 `authoring-patch-existing-authoring.log` 与 `authoring-patch-existing-teaching.log`。
- `npm run test:backend` 首跑 212 项通过、1 个测试文件发生 Node 子进程反序列化异常，日志 `authoring-patch-backend.log`。不改后端/测试内容，串行 214 项通过，`authoring-patch-backend-serial.log`。串行通过不能证明原进程通信异常的全部根因。
- 独立复核曾出现的金币第 2 场景折叠问题和原日志保持。本轮金币原样首跑 14 项通过，`authoring-patch-coins-first.log`；没有强开 DOM、隐藏文本断言、延长超时或由复跑推断旧失败根因。

- 提交前新增同区域重复点击断言，证实中间实现可能在同一面板上触发清理而不重挂载，见 `authoring-patch-same-panel-red.log`。改为当前区域重复点击直接保持面板，不触发丢弃，纳入第 1 场景。
- 文件保留证据加强为：原生 change 事件捕获真实 File，在真实 FormData.append 上传时比较对象身份；并核对重试 token、ID 和原文件字节，避免用已清空的 file input 误判保留。

## 最终结果

本轮实际通过结果如下。最后的当前面板重复点击保护加入后，重新执行 lint、构建、88 项前端单测、新增 9 项和既有维护 10 项；相关教学 12 项与金币 14 项此前已在本轮构建原样复验通过，最后这项入口分支不改其业务规则。

| 检查 | 结果 | 本机日志 |
| --- | --- | --- |
| lint | 通过，无 lint 错误 | authoring-patch-check-lint.log |
| 独立教学构建 | 通过；保留原有超过 500 kB chunk 提示，未升级依赖 | authoring-patch-check-build.log |
| 前端单测 | 88/88 | authoring-patch-check-unit.log |
| 后端串行检查 | 214/214；首跑异常见上文 | authoring-patch-backend-serial.log |
| 新增防丢稿与报告预览 | 9/9 | authoring-patch-checked.log |
| 既有课时维护 | 10/10，含参考引擎真实试飞六指标/两图 | authoring-patch-checked-authoring.log |
| 教学、上传、权限、全角色 | 12/12 | authoring-patch-release-teaching.log |
| 真实金币与连续签到 | 14/14；本轮首跑也为 14/14 | authoring-patch-release-coins.log |
| 系统文案审阅保护 | 3/3 | authoring-patch-copy.log |

业务浏览器检查共 48 项：9 + 10 + 12 + 14 + 3。五种尺寸和父套件不再计数。没有尚未通过的本轮指定功能项；真机、永久草稿和公网边界见操作指南。日志位于忽略目录 test-results，截图位于忽略目录 docs/lesson-authoring/browser。

实际数据保护脚本先只读记录本轮当前基线，随后比较完整业务表内容、附件字节、人工文案和配置。最终核对一致：56 张表、21 个附件/反馈文件、15 个人工文案/审阅文件及私有配置完整保持，integrity_check=ok、foreign_key_check=0；文章仍为 8 段、284 字符、9 个图片位置。4184 返回的 HTML 与 build/teaching/index.html 散列一致，3154 健康检查为 200，原服务进程未重启。浏览器输出与日志都不提交 Git。
