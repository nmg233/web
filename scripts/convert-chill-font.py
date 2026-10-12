"""Lossless WOFF2 packaging: existing fontTools + Node's built-in Brotli.

Usage: .venv/Scripts/python scripts/convert-chill-font.py SOURCE.otf OUTPUT.woff2
No outline, naming, glyph or weight changes; no subsetting.
"""
import sys
import types
import subprocess
from pathlib import Path

# fontTools expects the Python Brotli API. Reuse the installed Node runtime
# instead of adding a Python/native dependency just for this one conversion.
brotli = types.ModuleType("brotli")
brotli.MODE_FONT = 2


def compress(data, mode=2):
    js = "const z=require('node:zlib'),fs=require('node:fs');process.stdout.write(z.brotliCompressSync(fs.readFileSync(0),{params:{[z.constants.BROTLI_PARAM_MODE]:2,[z.constants.BROTLI_PARAM_QUALITY]:11}}));"
    return subprocess.run(["node", "-e", js], input=data, capture_output=True, check=True).stdout


def decompress(data):
    js = "const z=require('node:zlib'),fs=require('node:fs');process.stdout.write(z.brotliDecompressSync(fs.readFileSync(0)));"
    return subprocess.run(["node", "-e", js], input=data, capture_output=True, check=True).stdout


brotli.compress = compress
brotli.decompress = decompress
sys.modules["brotli"] = brotli
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.pens.recordingPen import RecordingPen  # noqa: E402

source, target = map(Path, sys.argv[1:3])
font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
font.flavor = "woff2"
font.save(target)
result = TTFont(target)
assert "fvar" not in result
assert result["OS/2"].usWeightClass == 500
for table in ["cmap", "name", "OS/2"]:
    assert font.getTableData(table) == result.getTableData(table), table
original_glyphs, web_glyphs = TTFont(source).getGlyphSet(), result.getGlyphSet()
assert set(original_glyphs) == set(web_glyphs)
for name in original_glyphs:
    original, web = RecordingPen(), RecordingPen()
    original_glyphs[name].draw(original)
    web_glyphs[name].draw(web)
    assert original.value == web.value, name
    assert original_glyphs[name].width == web_glyphs[name].width, name
print(f"{target}: {target.stat().st_size} bytes; {len(original_glyphs)} glyph outlines/advances identical; cmap/name/OS2 identical; static 500")
