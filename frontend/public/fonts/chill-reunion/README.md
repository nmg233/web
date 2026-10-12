# ChillReunion Round / 寒蝉团圆体圆体

- 官方仓库：https://github.com/Warren2060/ChillReunion
- 官方发行：https://github.com/Warren2060/ChillReunion/releases/tag/v2.700
- 标签提交：`37357262e9928e147436fa3ea401ed2ee560c139`
- 来源包：`ChillReunion_v2.7.zip` 中的 `ChillReunion_Round.otf`。
- 字体内部版本：`Version 2.700;Glyphs 3.1.1 (3135)`。
- 内部 PostScript 名称：`ChillReunion_Round`；静态 OS/2 weight 500，无 fvar。
- 许可：SIL OFL 1.1，原发行包许可证保存在本目录 `OFL.txt`。

使用已有 fontTools 4.66.1 和 Node 内置 Brotli 封装 WOFF2，不子集化、不改名、不改轮廓。转换脚本 `scripts/convert-chill-font.py` 逐一验证 7934 个字形的轮廓、宽度，以及 cmap/name/OS2。详细 SHA256 和元数据见 `docs/redesign-v2/step-01/patch/font-source.json`。

下载并解压官方发行包后可复现：

```powershell
.venv/Scripts/python scripts/convert-chill-font.py path/to/ChillReunion_Round.otf frontend/public/fonts/chill-reunion/ChillReunion-Round.woff2
```

CSS 使用平台别名 `ChillReunion`，仅声明 500 静态字重；浏览器实际渲染名称仍为 `寒蝉团圆体 Round / ChillReunion_Round`。当前页面不加载历史 Smiley Sans 文件。
