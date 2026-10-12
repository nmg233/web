"""Reproducible web derivatives of the round-03 masters; never redraw/overwrite them.

Run with the existing local Pillow environment:
  .venv/Scripts/python.exe scripts/build-pixel-web-assets.py
Nearest-neighbour sampling preserves pixel edges; WebP encoding is lossless.
"""
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend/public/assets/pixel-v1"
OUTPUT = ASSETS / "web"
VARIANTS = {
    "hero-voyage": [640, 960, 1280, 2162],
    "course-voyage": [320, 640, 960],
    "island-observatory": [192, 384, 576],
    "island-relay": [192, 384, 576],
    "companion-cat": [32, 48, 64, 96, 144, 192],
    "planet-ring-v2": [192, 384],
}


def main():
    if not features.check("webp"):
        raise RuntimeError("The existing Pillow environment needs WebP support.")
    OUTPUT.mkdir(exist_ok=True)
    manifest_path = ASSETS / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    master_entries = {entry["file"]: entry for entry in manifest["assets"]}
    report = {
        "method": "Pillow NEAREST resize + lossless WebP (exact alpha); no palette reduction or blur",
        "reproduce": "python scripts/build-pixel-web-assets.py",
        "note": "Byte sizes describe files, not measured loading time improvements.",
        "assets": [],
    }
    browser_variants = {}
    for asset_id, widths in VARIANTS.items():
        source = ASSETS / f"{asset_id}.png"
        original_bytes = source.read_bytes()
        fingerprint = sha256(original_bytes).hexdigest()
        with Image.open(source) as master:
            master.load()
            entries = []
            for width in widths:
                height = round(master.height * width / master.width)
                resized = master.resize((width, height), Image.Resampling.NEAREST)
                destination = OUTPUT / f"{asset_id}-{width}.webp"
                # Unchanged derivatives can be reused when adding a new display size.
                reuse = False
                if destination.exists() and destination.stat().st_size:
                    with Image.open(destination) as existing:
                        reuse = existing.size == resized.size and existing.convert("RGBA").tobytes() == resized.convert("RGBA").tobytes()
                if not reuse:
                    resized.save(destination, "WEBP", lossless=True, quality=100, method=6, exact=True)
                with Image.open(destination) as decoded:
                    # Prove that encoding did not blur pixels or change the alpha edge.
                    if decoded.convert("RGBA").tobytes() != resized.convert("RGBA").tobytes():
                        raise RuntimeError(f"Non-lossless result: {destination.name}")
                    alpha = decoded.convert("RGBA").getchannel("A").getextrema()
                entries.append({
                    "file": f"web/{destination.name}", "width": width, "height": height,
                    "bytes": destination.stat().st_size, "alphaRange": list(alpha),
                    "reductionPercentVsMaster": round(100 * (1 - destination.stat().st_size / len(original_bytes)), 2),
                })
            report["assets"].append({
                "master": source.name, "masterBytes": len(original_bytes),
                "masterWidth": master.width, "masterHeight": master.height,
                "masterSha256": fingerprint, "derivatives": entries,
            })
            browser_variants[asset_id] = {"width": master.width, "height": master.height, "variants": entries}
            master_entries[source.name]["webDerivatives"] = entries
            master_entries[source.name]["webMethod"] = report["method"]
            master_entries[source.name]["masterSha256"] = fingerprint
        if sha256(source.read_bytes()).hexdigest() != fingerprint:
            raise RuntimeError(f"Master changed: {source.name}")
    manifest["webDerivativeReport"] = "web/derivatives.json"
    manifest["sourceFiles"] = "原PNG母版和SVG源码保留；web/为最近邻缩放与无损编码的派生文件；生成提示词保留在generation-prompts.json。"
    for file, data in [
        (OUTPUT / "derivatives.json", report),
        (ROOT / "frontend/src/student/visual/pixelVariants.json", browser_variants),
        (manifest_path, manifest),
    ]:
        file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for asset in report["assets"]:
        sizes = ", ".join(f'{entry["width"]}w={entry["bytes"]:,}B' for entry in asset["derivatives"])
        print(f'{asset["master"]}: {asset["masterBytes"]:,}B -> {sizes}')
    print("All masters unchanged; all derivative RGBA pixels match nearest-neighbour output exactly.")


if __name__ == "__main__":
    main()
