# 35bfa8f 两处丢稿补修与真实延迟回归

日期：2026-10-21，Asia/Shanghai。基线 `35bfa8f17ef137b09a75d331cbde31caf291ea48`；分支 `feat/content-authoring-20261021`。输入为用户指定的《独立复核结论.md》，原件与原证据没有改写。仅推送自己的仓库，不提交上游PR、不部署。

## 完成范围

实际应用代码只修改两个组件：

- `frontend/src/pages/courses/LessonDraft.jsx`：按字段记录本地编辑代次，发起保存时捕获本次提交快照。响应只清除已提交且期间未再变动的字段；保存中、回读中的新输入继续保留dirty，下一次保存会真实提交。非数据库字段的文章来源选择也保留离开保护，不能因为没有新正文键而被误认为已保存。
- `frontend/src/pages/courses/ArticleDraftFields.jsx`：文章操作通过函数更新读取最新共享草稿；导入响应按块ID追加去重，保留等待期间修改、增删及排序的既有块。文件导入不再把旧原文地址写回；在线来源地址仅在当前值未改变时补充。

保存成功但仍有新改动时明确显示“本次提交已保存；仍有新的未保存修改，请再次保存”。回读失败区分本次提交已确认与当前新稿未保存；409仍须人工核对修订，不自动接受新版本或覆盖本页输入。结构化与原位编辑继续共享草稿，原位控件原有忙状态保护保留。

**没有改动后端、权限、学习/评分/金币/徽章规则、数据库结构、教学数据、上传文件、人工文案或历史版本；没有改素材和主题。正式站宇宙主题与手工封面已恢复，本轮不再核对或操作正式站，也未执行任何主题恢复工具。**

## 真实延迟的验证方式

Playwright先用 `route.fetch()` 把请求真正交给本机Express服务，在返回200、实际SQLite写入或文章解析完成后才拦住回传；用显式闸门释放，期间通过正常界面输入、删除和移动段落，不注入组件状态。不是用假的成功响应模拟保存。

只在失败恢复场景刻意丢弃真实响应或返回503；不把这些失败称为保存成功。所有账号、材料及数据库均为新建隔离合成夹具；未使用原持久教学库。

## 实际结果

| 检查 | 结果 | 记录 |
| --- | --- | --- |
| ESLint | 通过 | logs/lint-first.log |
| 独立生产构建 | 通过，build/content-authoring-race-patch；原大包和混合导入警告保留 | logs/build-first.log |
| 前端单测 | 144/144，无跳过 | logs/frontend-unit.log |
| 相关后端5文件 | 36/36，无跳过 | logs/backend-focused.log |
| 本轮真实延迟回归 | 6/6节点：5业务子场景＋父测试；pageErrors=[]、routingErrors=[]、historyUnchanged=true | logs/races-delivery.log及最终evidence/results.json |
| 原有集中填写浏览器 | 14/14节点：13业务场景＋父测试，无跳过 | logs/full-browser.log、evidence/full-browser-results.json |
| 原交接资料 | 6项文件哈希吻合；38项原日志哈希吻合，旧ZIP未重新打包 | evidence/preserved-evidence.json |
| 本地原预览 | 4241 HTTP200，静态入口与已验证构建SHA一致；仅更新本机前端，后端不重启、预览库不重置 | evidence/local-preview.json、logs/build-local-preview.log |
| Git差异检查 | git diff --check通过 | 提交前执行 |

### 五个延迟业务场景

1. **保存响应延迟**：服务器先真实保存SAVE-A，继续输入EDIT-B、介绍和文章段落，切换学生效果不丢稿，尝试换页不卸载。释放后保留新内容并显示未保存，再保存后DB确实写入新值；待上传File与说明保持。
2. **文章导入响应延迟**：改旧段落、删除一段、上移另一段、添加新段落和新标题。释放后保持最新顺序和内容，只追加一块导入图文；原图片引用/文件可读，队列保持；保存后逐项核对数据库块ID、正文、图片ID及唯一rich块。
3. **回读等待失败**：PUT已真实成功，GET回读等待期间继续改正文和段落、选文章来源；回读503仍保留新输入和来源保护。未导入来源阻止下一次保存；清除后能保存新稿。再模拟另一维护者修改，真实409保留草稿，人工核对后成功保存，队列不清空。
4. **导入响应丢失与重试**：第一次真实解析成功后丢弃回传；原段落、所选HTML和队列保留。重试沿用同一requestKey，服务端返回相同块ID，等待期间再次编辑仍保留，只追加一次。后续保存503保留内容；清除新来源不删除已有块，重试真实保存成功。
5. **只新增来源的成功回读**：正文已保存，回读等待期间仅选择文章来源，无新的正文键；返回后仍dirty、离开需确认、未导入不能保存。明确清除来源后恢复已保存状态，不额外PUT或重复写入正文。

整个过程同时比较原教材绑定、教材版本、学习报告、金币流水、徽章记录、作品、练习作答及试飞记录，测试夹具中的原行保持一致。原13场景额外复验保存/上传失败、409、9图文章导入、发布审批、不可变历史版本、旧学习前置与兼容原位编辑。

## 首跑失败保留

- `logs/red.log`：旧35bfa8f构建确定复现保存丢稿（SAVE-A覆盖EDIT-B）；首版延迟路由清理还产生route已处理错误，导致第二子场景取消，不能把取消称为导入复现。
- `logs/import-red.log`：完善路由清理后，测试对Ant两字按钮“上 移”的精确定位超时；原失败保留。
- `logs/import-red-scoped.log`：只修定位，仍使用旧构建，明确复现导入恢复旧数组，等待期间的排序/新稿丢失。两处问题的失败快照分别保存为evidence/baseline-save-red.json、baseline-import-red.json。
- `logs/green-first.log`：两处应用补修后，两个核心业务场景通过。
- `logs/extended-first.log`、`extended-final.log`：补充图片检查时误读Ant搜索输入框/旧CSS类，分别得到空字符串/定位超时。改为读取当前选择组件的真实title属性，并保留预览图片加载、落库图片ID和原文件存在断言；没有修改应用或放宽业务检查。
- `logs/races-delivery.log`：最终五场景全部通过；日志按原字节保存，SHA256清单可复核。

## 复核命令

在本分支工作区、使用已锁定依赖和本机Edge：

```powershell
$env:PATH='D:/NodeJS/node-v26.2.0-win-x64;'+$env:PATH
npm run lint
npm test
npm --prefix frontend run build -- --outDir ../build/content-authoring-race-patch
$env:PBL_REGRESSION_DIST='build/content-authoring-race-patch'
node --test tests/content-authoring-race.browser.test.js
node --test tests/content-authoring.browser.test.js
node --test --test-concurrency=2 backend/test/articleHtml.test.js backend/test/contentAuthoringPolicy.test.js backend/test/publicationWorkflow.test.js backend/test/studentCoins.test.js backend/test/courseRewards.test.js
```

两组浏览器用不同端口，分别3606/4636和3593/4623；均绑定本机并在测试结束清理。完整填写浏览器仍需原用户文章目录，材料不提交仓库。测试支持PBL_DRAFT_RACE_ONLY仅用于单场景定位，最终命令未设置该过滤，没有把未跑场景计为通过。

## 部署与边界

这是基于35bfa8f的前端补丁，不新增迁移编号，不需要导入数据、素材包或运行服务器修复脚本。旧导入包、运维ZIP与说明保留原字节；如整体35bfa8f尚未部署，其原有后端版本前提仍按原SERVER.md处理。本轮不执行那些工具，不覆盖已修复的正式站主题与封面。

尚未保存的编辑继续是本页草稿，不承诺强制刷新、关浏览器或跨设备恢复；已保存内容仍读取真实后端。公众号在线抓取限制不因本次丢稿补修而改变，本轮不宣称已验证公众号在线抓取。没有运行无关全量仿真或扩展业务。

[延迟响应前后截图](index.html)。完成后停止，等待独立复核。
