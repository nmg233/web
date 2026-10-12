# 实际验证记录

Edge headless 154，桌面/平板/手机尺寸均为浏览器模拟，不是真机。实际教学仅做正常鉴权读取、合法核对及兼容迁移；全部合成评分、签到、并发、时钟推进、上传与故障注入使用隔离库。

| 命令/检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `npm run lint` | 通过，0错误/警告 | `lint-final3.log` |
| `npm run build:teaching` | 通过，独立build/teaching，保留原>500KB提示 | `build-final3.log` |
| `npm test` | 88项通过 | `unit-final.log` |
| `npm run test:backend` | 完整212项通过，其中10项新金币业务测试 | `backend-full-final.log` |
| `npm run test:teaching` | 5项教学工具测试通过 | `teaching-tests-first.log` |
| `node scripts/verify-real-coins-migration.mjs` | 旧21→22、重复执行、54旧表、附件/配置与独立恢复通过 | `migration-recheck.log`、`migration-restore.json` |
| `PBL_COINS_RUN=final5 node --test tests/real-coins.browser.test.js` | 14个业务场景通过 | `browser-final5.log`、`browser/final5/results.json` |
| `PBL_BADGE_PHASE=first node --test tests/real-coins-badges.browser.test.js` | 12个旧徽章/小智场景通过 | `badges-first.log`、`regression/badges/first/results.json` |
| `PBL_STEP03_RUN=first node --test tests/real-coins-demo.browser.test.js` | 14个具名检查通过；五个视口合并为同一业务场景，计10个 | `demo-first.log`、`regression/demo/rewards-first/results.json` |
| `PBL_EVIDENCE_DIR=docs/real-coins/step-02/regression/teaching PBL_STEP02_RUN=coins-first node --test tests/experience-teaching.browser.test.js` | 12个维护/上传/反思/评审/授权场景通过 | `teaching-browser-first.log`、`regression/teaching/browser-coins-first/results.json` |
| `node --test tests/real-coins-copy.browser.test.js` | 3个文案审阅场景通过 | `copy-browser-first.log` |
| `node scripts/capture-real-coins.mjs` | 真实教学五尺寸采集，无pageErrors | `capture-final.log`、`actual/results.json` |
| `node scripts/real-coins-protection-audit.mjs` | 原业务、附件、私有配置和全部旧注册文案保持 | `data-protection.json`、`copy-protection.json` |

合计 **51个浏览器业务场景**：14+12+10+12+3。原始55个具名子检查含演示组的5个视口变体；4个父容器另列，总59个Node通过项。父容器、重复复验、截图与角色路由实例不计新业务场景。

## 金币资格和一次结算

- 原生导师页面给合成报告83分，作品仍待评审时余额0且有原因；原生作品五项评审通过后学生实际读取，83枚一次到账，明细为报告第1版83分。没有徽章定义仍发币，不把作品维度4分或练习分作为金币。
- 两独立浏览器会话同时签到，返回同一流水ID；另一个刚准备好的0分课时同时首次核对，只写一条金额0的结算，不因0可重复领。
- HTTP后端测试覆盖课堂回顾、卡片、原必做练习作答、最新报告待审/退回、新旧作品版本、内容未准备、参观缺记录、课程撤回、报名移除、课时取消、缺分/小数/越界等。不用进度100或旧徽章代替证据。
- 后续改分、新报告版本、重新发布和重新报名不增加第一次结算；真实明细仍显示首次报告分数。失效课时历史保留金额，不保留可跳转教材链接。
- 补验课时原地读取：已有报告23分、最后一张新增卡片未完成；学生在同一课时页面原生完成卡片后读取状态，自动首次结算23枚，未靠换路由触发。
- 原评分HTTP入口对null、空串、空格、布尔、数组、小数和越界拒绝；合法0由负责导师接受，管理员可评审，普通教师/学生/非负责导师拒绝。
- 流水唯一和金额约束实际写入验证；课时流水故障与签到第二步插入故障均整体回滚，恢复后重试仅写一次。多页20条游标读取无重复/越权，余额与本人流水SUM一致。

## 连签、并发与恢复

- 服务内部时钟依赖注入测试第1/2/5/6/7天、连续上限10、中断归1、北京午夜、12月跨年、2028闰日及3月1日。没有新增应用HTTP改时、改日期或环境时钟入口。
- 隔离浏览器使用测试子进程的Date替身；浏览器端不伪造奖励状态。当天5枚、次日6枚、再下一日7枚来自该后端事务，不是拦截成功返回体。
- 提交已落库但浏览器回包丢失：显示结果未确认，回读后按真实记录显示已到账及服务器今日状态，另一设备重复请求返回原记录。另测未写入的网络失败，仍为未签到和原余额，恢复后安全重试一次成功。
- 两个独立context模拟两设备；服务重启后账本一致。关闭Playwright持续焦点仿真，同一浏览器原生失焦/回焦模拟跨日休眠恢复，另一context签到后读取新余额101及连签第3天。真实焦点事件`isTrusted=true`保存在 `browser/final5/resume-events.json`；不声称操作系统休眠或真机通过。
- 真实账户GET503显示“尚未确认”和“—”，不显示0或演示120；恢复正常。奖励IndexedDB不可用、登录仍可用时正式金币可从服务器读取。切账号时旧请求迟到不会写入新账户UI。

## UI、演示和旧功能

- 五尺寸1440×900、768×1024、390×844、360×800、844×390：月历/明细/错误恢复无横溢，短屏正常滚动；月份按钮键盘可用，历史/未来日期只读，无补签。月历单月查询白名单与范围受后端验证。
- 演示120不迁移；原演示实物/数字徽章兑换、reset、outbox重试、消息幂等及管理员演示通知继续使用独立演示余额，真实账本不变。演示徽章不混入真实陈列数量。
- 徽章墙彩色/灰度排序、详情、焦点/关闭、获章定位/多标签去重、失效课程安全历史、跨账号、图像失败/读取恢复均通过。
- 小智原生鼠标/拖动后点击、模拟触屏轻触/拖动后tap/取消、键盘、外部空白收起、输入不误关及五尺寸命中通过，未使用force点击或DOM派发激活。
- 教学维护可视填写、新增保存后回读失败保ID、真实附件失败重试与字节下载、管理员回放上传、开放反思、报告版本退回重审、教师只读、其它角色路由及权限撤回、附件404局部处理、实验往返均通过独立回归。完整后端包含原有仿真相关回归，仿真源码未改，未另跑新的浏览器试飞。
- 3份增量HTML点字修改、保存重开、变化项JSON、脚本文字纯文本、受控ID导入和旧基线冲突通过。旧1168字段完整保持，宜/忌各30、原46份以及上一部审阅文件不覆盖。

## 首次失败与复验

1. `lint-first.log`：3个warning（多余disable和effect cleanup中的ref递增）；移除无必要操作后最终0警告。
2. `backend-coins-first.log`：8/9，新测试尝试把越界分直接写入旧报告表，被原CHECK拦住。改为分别断言数据库拒绝、服务对可存储缺分/小数拒绝，并复验合法0；未放宽原表约束。
3. `migration-first.log`：比较脚本对WITHOUT ROWID的FTS内部表用rowid排序失败；改为只读全行稳定排序，54旧表保持，重复迁移/恢复通过。
4. `backend-full-first.log`：210/211，旧迁移版本断言只列到21；追加明确22后完整测试通过，未跳过失败项。
5. `browser-first.log`：正式余额先返回，独立演示仍处于“读取中”；按真实状态等待后验证120。
6. `browser-recheck.log`：Ant Design 6确认层类名/两汉字按钮空白匹配错误；改用实际可见弹窗及原按钮文本。
7. `browser-recheck2.log`、`browser-recheck3.log`：作品评分是Select，关闭动画中的上一下拉造成重复/隐藏选项；按每个控件自身aria-controls定位对应下拉，原生操作复验通过，未改原评审UI。
8. `browser-recheck4.log`：误用“确认重置”，原稿是“确认重置演示数据”；只改测试断言，未改人工文案。
9. `protection-first.log`：将新增schema_migrations行误计业务差异；将版本新增单独核验为“旧1–21完全保持，仅新增22”，其余业务数据继续逐字段比较。
10. `browser-final2.log`、`browser-resume-trace.log`：Playwright强制持续焦点，Page冻结命令在可见页未产生freeze/resume事件，回焦也未发生，余额保持旧值。空白页独立核实后关闭测试焦点仿真、同context切换空白页，再原生返回；可信focus事件、跨日余额与连签同步通过。没有把命令返回成功当作系统休眠证据。

## 实际数据边界

实施前1份历史approved报告缺分；参观个人完成记录、部分正式内容仍未准备。没有批量补0、满分、签到或虚构教材。真实截图保持实际空账本，合成83分与签到记录只存在隔离库。私有备份与恢复目录不提交，不切公网；正式礼品、历史评分补录入口及参观完成系统未扩展。
