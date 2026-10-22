# 中间尝试记录

所有失败日志保留；不把修正后的通过覆盖首次结果。

- `guide-red.log`：修复前确认为错误的 `/feedback`。
- `attempt-01.log`：修复后导师受理入口已通过；新增测试错误地假设已选控件的 accessible name 保持原样，以及个人空列表仍渲染表格。改为原有表单 label 定位，并通过真实账户菜单和 mine 接口验证空状态。
- `attempt-02.log`：仅固定选项位移仍发生未落值；个人空状态文本会经过已有文案格式化，不能直接用未格式化原文断言。个人列表改为核对真实 GET 200、items=[] 与实际空状态，学生记录仍必须不存在。
- `related-regression.log`：19 个业务场景通过；新增选择测试 20 次鼠标通过后，键盘定位误用虚拟选项 numeric textContent 而失败。核对安装的 `@rc-component/select/es/OptionList.js`，其名称在 aria-label。
- `selection-final.log`：修正为按 aria-label 寻找精确选项后，20 次鼠标、4 次键盘全部通过；没有删减预期或通过重选掩盖失败。

选项位移的试验样式已撤回，正式修改没有表单、样式、权限和后端差异。诊断脚本保留在本地 `.local`，不混入产品运行代码。旧脚本探针的第一次关闭按钮定位错误也保留在 selection-probe/probe-close-selector-error.*，不计为产品故障。
