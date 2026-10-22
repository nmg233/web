# 验收补修：反馈办理入口与学校授权选择

2026-10-20；基于自己的 `feat/staff-desk-guide` 分支 `f39c6da` 继续。仅修本轮入口及相关回归，不操作正式站，不提交上游 PR。

## 入口与操作

| 任务 | mentor | 管理员 |
|---|---|---|
| 使用指南 → 处理反馈与通知 → 去办理 | `/mentor/feedback`，授权课程的学生反馈受理队列 | `/feedback/manage`，平台反馈管理 |
| 同一指南 → 提交个人反馈 | `/feedback/new` | `/feedback/new` |
| 账户菜单 → 我的反馈 | `/feedback`，本人已提交记录 | `/feedback`，本人已提交记录 |

指南文字明确区分受理学生问题与提交个人问题。顶部原有帮助与反馈、通知和账户菜单保留。业务改动仅为 `shared/staffWorkspace.json` 的这一项配置；不改变服务器授权、反馈会话、人工教材和文案、校园风格或其他入口。

新增回归通过学生真实表单提交课程反馈，然后分别以 mentor、管理员身份**从顶部指南点击“去办理”**，核对实际网址、队列中的学生与标题，再点击进入同一个反馈会话。另通过指南打开个人提交表单，再通过账户菜单进入本人列表，核对服务器返回空列表且不显示学生受理记录。不是只断言链接配置。

## 学校授权偶发失败的核查

独立复验的首跑确实失败：导师未选中，表单提示“请输入授权导师”，没有到达模拟 503 的保存请求。原日志为 29 个 Node 测试节点中 27 通过、2 失败，其中一个失败节点是父测试；不能说首跑全通过。原始日志、正文与截图在 [original-first-failure](original-first-failure/manifest.json)，复制前后 SHA-256 一致。

本目录的 `.gitattributes` 仅对原始证据关闭换行转换，并将运行器日志按二进制归档，保留首跑字节、日志空格和换行，不通过清理日志改写失败证据；不影响源代码检查。

按旧指针脚本做了 12 次隔离选择，11 次选中、1 次未选中；失败时点击后导师下拉框仍展开，值已经为空，填写原因和确认框后仍为空。另一轮还观察到学校下拉框未关闭，遮挡导师输入框。未观察到“已选中导师，后被其他字段清空”的证据。原脚本只确认点击结束，没有确认选中提交和弹层关闭，这是可以确认的测试缺口。

排查中比较过选项位移、弹层过渡和选择时序；固定选项位移并不能独立解释全部失败，因此**没有保留试验性的页面或样式改动**，也没有修改表单和后端。现有证据不足以把概率问题唯一归因到某一条动效规则。

回归现在：

1. 等待实际弹窗和下拉框有限过渡完成，不使用固定延时或关闭动效。
2. 根据输入框 `aria-controls` 限定当前下拉框，正常悬停和鼠标点击指定选项。
3. 确认已选显示名称与下拉框关闭；Ant Design 的只读输入本身为空，不把它误当成未选中。
4. 填写其他字段后，在模拟失败、重试保存和撤权的**每次提交之前**再次确认学校、导师；实际 POST 后核对数值 ID 与操作状态。
5. 保留原有 503 错误、原因草稿保留、重试落库 `active=1` 和撤权落库 `active=0` 的断言，新增精确请求次数与 ID 断言。不强制点击、不注入表单值、不自动重选、不隐藏失败。

鼠标和键盘的 24 次额外选择验证不提交授权；真正保存、失败重试及撤权在原书桌回归中执行。失败记录用独立路径或时间戳保存，旧证据不被成功记录覆盖。

## 实际验证结果

| 检查 | 实际结果 |
|---|---|
| frontend lint | 通过 |
| frontend build，输出 `build/staff-desk` | 通过；仍有既有大包及无效动态导入提示，无编译错误 |
| frontend 单测 | 144/144 通过 |
| 原书桌浏览器回归 | 8 个业务场景通过；包括六种阅读尺寸、分页返回、指南、学校授权的 503/重试/撤权 |
| 原 mentor 第二步回归 | 6 个业务场景通过；学生课程反馈、回复与附件失败保留、转交、申请、通知、撤权 |
| 新指南反馈回归 | 5 个业务场景通过；真实学生提交、mentor/admin 各自指南办理和个人提交/本人列表 |
| 新授权选择回归 | 20 次鼠标 + 4 次键盘选择通过，提交前两项选中值保持，无授权 POST、无页面错误 |
| `git diff --check` | 通过 |

共 19 个业务场景与另 24 次选择验证；Node 父测试节点不重复计为业务场景。浏览器为真实 Edge，数据库和上传均为新建的合成隔离副本，没有使用教学库。

### 首跑与中间失败不抹去

- [指南修复前首跑日志](logs/guide-red.log)：真实提交通过，点击指南后实际是 `/feedback`，与预期 `/mentor/feedback` 不同；按预期变红。
- [独立学校首跑日志](original-first-failure/independent-browser.log) 与 [首跑截图](original-first-failure/school-grant-first-failure.png)：保留原始失败。
- [旧选择脚本 12 次探针](selection-probe/original-pointer.json)：11 次选中、1 次空值。中间测试定位错误记录见 [排查过程](logs/attempts.md)。
- [相关回归合并日志](logs/related-regression.log)：19 个业务场景全部通过；该次新增选择测试前 20 次鼠标通过，键盘测试误读虚拟选项文本为名称而失败。日志为 22/23 Node 节点通过，**不把这个命令写成全通过**。
- 核对本地 Ant Design 源码后改用虚拟选项的 `aria-label`，断言仍要求准确指定名称；[最终单独选择回归](logs/selection-final.log) 完整 24 次通过。这是有针对性的修正后复验，没有放宽预期或删除键盘验证。

逐场景 JSON 与原始检查日志见 [verified-scenes.json](verified-scenes.json)。本轮未改后端、数据库迁移或仿真，因此没有重跑无关的全部后端及试飞测试。

## 截图与证据

- [mentor 从指南进入的学生反馈受理队列](evidence/2026-10-20T14-47-35-337Z/mentor-reception-queue.png)
- [管理员反馈管理队列](evidence/2026-10-20T14-47-35-337Z/admin-reception-queue.png)
- [授权保存前已选学校与导师](selection-regression/2026-10-20T14-47-39-456Z/confirmed-before-submit.png)
- [失败、重试、撤权的实际提交对象](desk-regression/final/school-grant-submission-checks.json)

截图与记录中的账号、学校、课程均为合成验收数据。账号密码和令牌不随这些材料提交。

## 启动与复验

在仓库根目录使用已安装的锁文件依赖与 Edge：

```powershell
npm run lint --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend -- --outDir ../build/staff-desk
$env:PBL_REGRESSION_DIST='build/staff-desk'
$env:PBL_STAFF_DESK_EVIDENCE='docs/staff-desk/patch-feedback-guide/desk-regression/manual'
node --test --test-concurrency=1 tests/staff-guide-feedback.browser.test.js tests/school-grant-selection.browser.test.js tests/staff-desk.browser.test.js tests/mentor-step2.browser.test.js
```

每次新建临时合成库；API/前端端口分别为 3577/4607、3587/4617、3567/4597、3527/4557。运行前须空闲，不能将测试环境指向教学库。两个新增回归各次证据按时间分目录；原书桌支持用 `PBL_STAFF_DESK_EVIDENCE` 指定独立输出位置。

本机既有预览仍是 <http://127.0.0.1:4220/mentor/guide>，使用原私有验收账号；本轮构建更新相同本地预览制品。仅本机访问。

## 发布边界

无数据库结构、数据导入、素材或上传文件变更，不需要迁移、导入或额外素材包。只需正常发布代码和前端构建；如回退，撤回本补修提交即可，不涉及数据回滚。静态素材 ZIP 不包含本次指南配置，也没有新增素材，因此不重新打包。

仅提交并推送自己的 `feat/staff-desk-guide`，不向 `nmg233/web` 提交 PR，不部署公网；完成后停止等待验收。
