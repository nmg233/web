"""Publish generated masters by proportional nearest-neighbor resizing only.

No drawing, filtering, color grading, composition or fake pixelation is applied.
Run from any directory. Source masters must already have been reviewed.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ART = Path(__file__).resolve().parent
ROOT = ART.parents[2]
PUBLIC = ROOT / "frontend/public/assets/staff-campus"
PUBLIC.mkdir(parents=True, exist_ok=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def info(path):
    with Image.open(path) as image:
        return {"path": path.relative_to(ROOT).as_posix(), "width": image.width,
                "height": image.height, "mode": image.mode,
                "bytes": path.stat().st_size, "sha256": sha(path)}

assets = []
specs = [
    ("campus-workspace", [480, 960, 1536], "Desktop/tablet workspace backdrop and wide headings; quiet center behind separate reading surfaces", "exec-56019807-3403-4ab1-aeff-f60fe502d24d.png"),
    ("campus-mobile", [480, 960], "Independent portrait campus composition for mobile and sidebar background; no landscape stretching", "exec-52baaa1c-70cd-46a2-b71d-5a60a6c38d95.png"),
]
for name, widths, purpose, source in specs:
    master = ART / "masters" / f"{name}.png"
    variants = []
    with Image.open(master) as image:
        image.load()
        if image.mode not in ("RGB", "RGBA"):
            raise ValueError(f"Unexpected master mode: {image.mode}")
        if image.mode == "RGBA" and image.getextrema()[3] != (255, 255):
            raise ValueError("Background master unexpectedly transparent")
        for width in widths:
            height = round(image.height * width / image.width)
            target = PUBLIC / f"{name}-{width}.webp"
            image.resize((width, height), Image.Resampling.NEAREST).save(
                target, format="WEBP", lossless=True, quality=100, method=6)
            item = info(target)
            item["url"] = f"/assets/staff-campus/{target.name}"
            with Image.open(target) as encoded:
                if encoded.size != (width, height):
                    raise ValueError("Published dimensions differ")
                if encoded.convert("RGB").tobytes() != image.resize((width, height), Image.Resampling.NEAREST).convert("RGB").tobytes():
                    raise ValueError("Lossless roundtrip pixel comparison failed")
            variants.append(item)
    assets.append({"id": name, "purpose": purpose, "master": info(master),
                   "prompt": f"docs/staff-campus/art/prompts/{name}.txt",
                   "generation": {"tool": "image_gen.imagegen", "executionMode": "built-in", "model": None,
                                  "generatedOnClientDate": "2026-10-19", "sourceFilename": source,
                                  "transparentBackground": False,
                                  "referenceMechanism": "Approved local reference images were inspected with view_image; prompt identifies them as style anchors; no reference-image argument used for new original generation"},
                   "pixelGrid": {"logicalWidthPromptTarget": "192–320", "fixedGridVerified": False},
                   "variants": variants})

manifest = {
    "version": 1, "family": "PBL Beihang staff campus pixel scenes",
    "skill": "PBL-new-class/skills/pbl-pixel-course/SKILL.md",
    "palette": {"navy": "#132a49", "cream": "#fbf6e8", "interactiveBlue": "#245eb7", "gold": "#ffd276"},
    "light": "upper left", "processing": "Only proportional nearest-neighbor resampling and lossless WebP encoding; no painting, pixelation filter, palette conversion or blur",
    "references": [
        {"role": "style", "path": "PBL-new-class/skills/pbl-pixel-course/assets/reference/campus-selection.webp"},
        {"role": "style", "path": "PBL-new-class/skills/pbl-pixel-course/assets/reference/campus-personal.webp"},
        {"role": "real campus subject reference only", "path": "D:/下载的图库/buaa photos/秋.jpg"},
        {"role": "ginkgo/campus material reference only; crest and writing excluded", "path": "D:/下载的图库/buaa photos/金秋航博.jpg"}],
    "sourceAndUse": "New original AI-generated decorative scenes for the user's platform. Existing approved illustrations and user-supplied photos were observed as style/subject references; those source files are not copied into this asset directory. No claim is made to rights in the reference photographs or official marks. No official crest, text or third-party stock image is embedded in the delivered artwork.",
    "integration": {"masterNeverLoadedByFrontend": True, "reading": "Keep artwork, background wash and readable content as separate layers. Tables, forms, text and status controls need stable cream reading surfaces; never apply opacity to text/control containers.", "responsive": "Use landscape on desktop/tablet and independent portrait on narrow screens. Do not stretch either composition. Use CSS background crop/object-fit and actual image aspect ratios.", "fallback": "#fbf6e8 stable cream background"},
    "assets": assets,
    "validation": {"generatedMastersVisuallyInspected": True, "publishedVariantsPixelRoundtrip": "passed; decoded RGB equals proportional nearest-neighbor result", "frontendFiles": 5, "noBusinessOrPermissionChanges": True}
}
(ART / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"masters": len(assets), "variants": sum(len(x["variants"]) for x in assets), "publishedBytes": sum(v["bytes"] for x in assets for v in x["variants"]), "manifest": str(ART / "manifest.json")}, ensure_ascii=False))
