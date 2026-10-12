# 今日运势全部文案审阅

打开 [可编辑 HTML](copy-review.html)，按稳定 ID 修改。所有候选、等级、标签和状态都列出，不只展示当日结果。位置说明只在审阅文件中出现。

- 点击「保存已修改 HTML」，下载 `fortune-copy-review-edited.html`；重新打开下载文件，文字与显隐仍保留。
- 点击「导出修改 JSON」，下载 `fortune-copy-edits.json`；仅包含发生修改的 ID，保留原文作为冲突检测依据。
- 保存到自己指定的目录，然后交回完整路径。浏览器里编辑但没下载的内容不会保存到网站。

本次源文件完整路径：`C:/Users/shr/Desktop/nmg前端/app/frontend/src/content/uiCopy.jsx`。
审阅文件完整路径：`C:/Users/shr/Desktop/nmg前端/app/docs/next-version/step-01/fortune-patch/copy-review.html`。
独立字段映射：[copy-mapping.json](copy-mapping.json)。`uiCopy.jsx` 始终是唯一真源。

后续收到 JSON，在 app 目录先检查，再在确认改稿范围后应用：

```powershell
node scripts/fortune-copy.mjs "C:/完整路径/fortune-copy-edits.json"
node scripts/fortune-copy.mjs "C:/完整路径/fortune-copy-edits.json" --apply
```

工具拒绝跨模块 ID、重复 ID、未知字段、过时原稿和关闭必要状态。只更新返回的 fortune ID，不覆盖其他新文案。返回 HTML 时先从它导出 JSON，走同一检查。

`fortune.boundary` 留在审阅记录中，但学生组件已移除此行，勾选显示不会恢复它。未改项保持原稿；尾句号只在学生展示时处理，保存文字保留原样。当前 22 项审阅稿与原源一致，没有代用户改写；新增第 23 项 `fortune.lastDate` 只用于读取失败标明旧日期。
