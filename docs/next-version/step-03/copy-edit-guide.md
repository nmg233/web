# 人工改稿

打开 [本轮编辑页](copy-review.html)，改字后保存 HTML 或导出 JSON，并把文件完整路径交回。本页只包含 next3 稳定 ID，不覆盖 fortune、step02 或更早冻结稿。

```powershell
node scripts/next-step03-copy.mjs C:/完整路径/next-step03-copy-edits.json
node scripts/next-step03-copy.mjs C:/完整路径/next-step03-copy-edits.json --apply
```

第一条仅检查；第二条显式应用。本轮 ID、baseText/baseEnabled 冲突、重复 ID、额外字段和空必要状态会拒绝；不执行 HTML/JSX/脚本。源码在 `frontend/src/content/uiCopy.jsx`，保持纯文本配置。改完重新运行 lint、教学构建和相关文案检查。

“演示”、待同步、未满足和权限失败等必要说明不能通过显隐误导学生。真实徽章名称与说明是教学元数据，在课程维护中编辑；已获得记录仍展示当时快照。原商品演示规则集中在 rewardConfig.js，后端受控目录在 studentRewards.js，不把人工改稿当正式定价或评分授权。
