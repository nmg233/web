# 1031迁移、本地环境与回退边界

## 追加结构和兼容

只追加 `1031_course_rewards.sql`，保留1029/1030及更早迁移身份/内容、1030显式管理关系和审计。新增礼品/图片/订单/兑换章课程归属、订单/兑换章课程标题快照、通知课程范围、课程通关勋章开关/修订、课时定义启用/图片/修订、课时授予图片快照。默认新课程关闭。已有真实lessonId→courseId定义的课程一次性兼容原启用状态；旧课时授予的courseId/快照不覆写。

未知礼品和订单保持NULL归属，不按名称、唯一课程或测试ID猜测。没有导入教学、礼品、演示余额或重新结算金币。原requestKey、价格/图片快照、库存、限兑和账本保持。后台通知worker与课程补发均识别动态课程管理者，撤销导师不继续接收新投递。

实际存量归属在代码/结构升级以后，由admin逐项人工确认。只读清单命令：

```text
node scripts/course-reward-audit.cjs --db <已有数据库>
```

输出含内部礼品数据，保存到私有目录；不迁移、不绑定。代码升级与教学/礼品导入是两件事。本轮没有正式奖励导入包，未自动处理学校申请。已产生奖励配置、图片或订单的课程不能删除，需归档保留履约/文件历史；归档原报告作品保护不变。

## 已执行的数据保护

分别停止本任务两个本地服务并联合备份DB、uploads、feedback、private配置：

- `.local/rewards-before-teaching-20261017`：原教学环境，1030。
- `.local/rewards-before-review-20261017`：独立操作环境，1030；保留用户已有输入。

分别恢复独立升级/恢复副本（rewards-upgrade-rehearsal、rewards-restore-rehearsal、rewards-review-upgrade、rewards-review-restore，以20261017结尾）。升级前两库均93表，原行数分别177/179；升级、重复运行、恢复对比保留全部原列及全部附件哈希。恢复副本保持1030，升级到1031。AI enabled均0，既有两份服务器交接ZIP的SHA256保持。

两个实际本地环境先dry-run确认只有1031待追加，再明确apply并由维护CLI额外联合备份到 `.local/rewards-cli-teaching-backup-20261017` / `.local/rewards-cli-review-backup-20261017`。升级后除正常会话轮换表外92表172/174行的旧列逐项一致；integrity_check=ok、foreign_key_check为空。保留原缺失附件引用1条，没有造文件。以上私有DB/配置/日志/清单均不提交仓库。

## 真实本地入口

原教学 <http://127.0.0.1:4185>（API3155），数据 `.local/acceptance-20261016`；操作副本 <http://127.0.0.1:4186>（API3156），数据 `.local/authorization-review-20261017`。账号文件各自 `acceptance-accounts.json`；操作副本原有两个未授权导师可供admin授权，不把两库凭据混用。未向这两库加入本轮测试奖励。

在工作树 `C:/Users/shr/Desktop/nmg前端/.local/lesson-maintenance`，Node26.2.0、原锁文件：

```powershell
$env:PATH='D:\NodeJS\node-v26.2.0-win-x64;'+$env:PATH
npm run build:teaching
node scripts/teaching.mjs start --data .local/acceptance-20261016
# 独立操作副本
node scripts/teaching.mjs start --data .local/authorization-review-20261017
```

已经运行时直接访问；普通start不init/seed。仅监听127.0.0.1，非公网地址。

## 将来服务器部署顺序（本轮未部署）

1. 取验收提交，核对真实目标库、DB/附件/feedback路径、schema记录和read-only存量清单。目标若有未知迁移身份/同号异义先停止核对，不能改编号跳过。
2. 停业务写入，保护服务器私有配置；匹配代码先dry-run，再用联合备份恢复隔离副本，验证升级/重跑/恢复和未知礼品未归属。
3. 维护窗口执行：

```text
node scripts/lesson-maintenance/schema.cjs --db <目标库> --dry-run
node scripts/lesson-maintenance/schema.cjs --db <目标库> --uploads <真实上传目录> --feedback <反馈目录> --backup-dir <全新私有备份目录> --apply --maintenance-confirmed
```

4. 先启动匹配1031后端，再发布匹配前端；核对health=ready/schema1031、旧账号、授权撤销、附件、教材、签到余额、旧订单和通知恢复。原AI状态保持，不复制本地账号/数据库/密钥上服务器。
5. 另行备份、核对目标和差异后，才由admin逐项绑定未知存量；正式教学/奖励另行人工录入，不把测试截图内容导入。
6. 回退需停写，恢复配套数据库+附件+配置到新目录，验证后人工切换匹配旧代码。不能仅回退前端、删除迁移记录、重建数据库或旧代码盲开1031库。回退备份后产生的新订单需先停止并核对，不能丢弃已扣币/已履约记录。

未创建上游PR、未推送原仓库、未部署公网，等待最终验收。
