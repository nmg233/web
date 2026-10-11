> 更新：本文保留首轮提案历史。当前真实礼品兑换、验证结果及尚存整合边界以 [最新交付](../real-redemption/README.md) 为准；旧文中的“尚无正式兑换”和迁移编号阻断描述已过期。

# 本次提案验证（2026-10-11）

验证对象为开发成果17099fe及从共同基线建立的独立提案目录。原仓库main未被推送、合并或部署

| 范围 | 本次实际执行 | 结果 |
| --- | --- | --- |
| 已完成源码工作区 | npm run lint / npm test / npm run build | 通过；88项前端单测 |
| 已完成源码工作区 | backend中 node --test --test-concurrency=1 | 214项通过，零跳过 |
| 独立提案目录 | npm run lint / npm test / npm run build:teaching | 通过；88项前端单测 |
| 独立提案目录 | node --test --test-concurrency=1 tests/lesson-authoring-patch.browser.test.js tests/lesson-authoring.browser.test.js | 19个业务场景通过（Node显示21项，含2个父容器），零跳过 |
| 独立提案目录 | 真实参考引擎试飞、原位教材上传/保存/重登、冲突/失败/取消、教师只读及五视口 | 包含在上述19场景 |
| 源码一致性 | 导入的frontend/backend/shared/scripts/tests与17099fe Git blob逐文件比较 | 731份一致（文本按Git换行规则归一化，二进制不变） |

环境为现有Windows、Node26和Edge，提案目录复用本机已安装依赖和Python环境。根目录新增命令保留原dependencies，并重新生成根锁文件；没有做全新机器npm ci、目标Linux/Node22或生产安装验收

构建仍提示大于500kB的公共包，API共享块约1.25MB（压缩前）；独立build:teaching还提示outDir位于frontend之外。未通过提高阈值掩盖这些提示

所有浏览器写入/故障注入均使用隔离合成库，未启动或reset实际教学库，未写入运营教材或真实金币。第一次教材E2E与补修E2E本次均通过；历史轮次失败和复跑不被本次结果覆盖

未执行与681328d合并后的综合回归，亦未验正式provider、真机、Linux仿真、生产升级/回滚或公网。历史浏览器/审计脚本中部分依赖开发仓库旧commit及冻结材料，不应把它们一概当作此提案已验证的CI入口

完整历史验证请参考开发源码仓库中的 docs/lesson-authoring/patch/verification.md 和 docs/real-coins/step-02/verification.md；真实照片、实际库、配置、历史测试截图和日志未随本提案提供
