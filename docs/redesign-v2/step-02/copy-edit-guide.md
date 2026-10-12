# 第二步文案编辑说明

推荐打开同目录的 [copy-review.html](copy-review.html)。用顶部筛选输入“learning”“robot”“avatar”或截图中的文字，在对应条目直接改字。每个条目保留稳定 ID、页面位置和源码来源。

1. 系统文案：可以改措辞；按钮、权限和错误说明需要保留清楚的意义。标记“可选”的小字可以清空或取消“显示此文案”，不会补回旧文字。
2. 教学文案：来自全新隔离测试库的真实 API，展开可看只读快照。建议改稿只用于讨论，不会修改真实课程；保留 courseId、objectId 和 sourceField。正式章节、课程与实验绑定仍待确认。
3. 改好点击“保存已修改 HTML”，浏览器下载 `copy-review-edited.html`；或点击“导出文案修改 JSON”下载 `step-02-copy-edits.json`。请把下载文件放到你自己选定的位置并交回。不要覆盖稳定 ID 基线。
4. 也可以修改 `frontend/src/content/uiCopy.jsx` 的 `text` 与 `enabled`，保持 JSON 格式、稳定 ID 与元数据；双引号写成 `\"`，换行写成 `\n`。不要添加表达式、函数或业务逻辑。HTML 输入框允许直接打引号、尖括号和换行，导出会安全转义。

**只修改其中一份即可。** 如果 JSX 和 HTML 同时修改且同一 ID 内容不同，交接提取会列出冲突，等待人工选择，不自动决定覆盖顺序。

维护者可以离线运行：

```powershell
cd C:\Users\shr\Desktop\nmg前端\app
.\.venv\Scripts\python.exe scripts/extract-copy-edits.py docs/redesign-v2/step-02/copy-review-edited.html --out test-results/copy-proposals.json
```

也支持导出的 JSON。结果包含 `changes`、`conflicts`、`rejectedIds` 与 `applied: false`；这条命令不执行 JSX/HTML、不写网站或数据库。未知 ID、非文本、删除必要操作会被拒绝。下一步收到你的改稿后再处理对应维护端填写入口，本步没有新增教师表单。

`copy-review.html`、`copy-baseline.json` 与 `teaching-snapshots.json` 是本次交接冻结文件，生成脚本会拒绝覆盖已有文件。完整稳定 ID 索引就是基线 JSON；UI 的教学内容继续读取真实 API，不读取快照当教材。
