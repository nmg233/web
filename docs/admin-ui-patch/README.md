# 管理端界面验收补修

本轮仅恢复管理员侧栏图标、澄清导师学校申请用途。基于 `e8c84daa22b0087e23d909714bd2d0a8bd696aed`，分支 `fix/admin-sidebar-school-explanation`。上游只读核对 main 为 `b862a16e4c8b8ac24cd4a9cf82041bf7ea9a7b0a`；只推送自己的 `shrrrrrrrr/web-frontend-test`，不创建 PR、不部署公网。

[真实浏览器截图](index.html) · [实际验证记录](verification.md)

## 改动与使用

- 工作台、课程管理、教学与成长、账号与组织、平台设置恢复五个 Ant Design 线框图标。桌面展开显示图标和文字，收起保留图标及悬浮名称；菜单使用可访问名称和当前页标记，支持方向键与 Enter。手机仍零宽收起，原唤起按钮保留。
- `navigation.js` 仅新增纯数据 `iconKey`，在 Sidebar 中映射现有图标；五项顺序、路由与旧深链接映射不变，纯 Node 测试可直接导入。
- 管理员进入“账号与组织 → 导师学校申请”处理导师申请。顶部解释审批后学校创建及导师建班、建学生权限，同名学校须明确核对确认，学校授权与课程授权互相独立。
- 管理员直接新增或维护学校、班级，仍在旁边的“学校与班级”页签操作，无需提交申请；直接建校不自动授予导师权限。没有新增自动跳转、授权方式或审批规则。导师端仍是自己的学校申请与审核结果，教师页面未改动。

## 本地验收

当前构建已更新，可刷新原服务：

- [4185 原教学环境](http://127.0.0.1:4185/admin/organization?section=applications)，数据仍在工作树下 `.local/acceptance-20261016`。
- [4186 操作验收副本](http://127.0.0.1:4186/admin/organization?section=applications)，数据仍在 `.local/authorization-review-20261017`。

工作树：`C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`。沿用各目录现有 `acceptance-accounts.json` 中的本地账号，不将凭据写入仓库。两个服务均保持原进程运行，无需重启、重导课程、初始化或迁移。

本轮没有修改后端、数据库结构或两套持久教学数据；账号、人工稿、附件及金币奖励规则保留。浏览器测试只在新建临时合成库中运行，截图中的验收管理员不是正式教学账号。交付后停止，等待复核。
