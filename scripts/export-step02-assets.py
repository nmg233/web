"""仅复制母版、最近邻缩放并转为无损 WebP；不裁切、不绘制、不改 alpha。"""
import json, hashlib, shutil
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
spec = json.loads((root / 'docs/redesign-v2/step-02/generation-prompts.json').read_text(encoding='utf-8'))
assets = root / 'frontend/public/assets/redesign-v2'
rows = []
for entry in spec['assets']:
    name = entry['name']
    dest = assets / 'masters' / (name + '.png')
    if dest.exists():
        assert dest.read_bytes() == Path(entry['source']).read_bytes(), '不同母版不可覆盖'
    else:
        shutil.copy2(entry['source'], dest)
    art = Image.open(dest)
    widths = [96, 192, 384] if name.startswith('avatar-') else [96, 192] if name == 'robot' else [480, 960, 1536]
    variants = []
    for width in widths:
        web = assets / 'web' / f'{name}-{width}.webp'
        art.resize((width, round(art.height*width/art.width)), Image.Resampling.NEAREST).save(web, 'WEBP', lossless=True, method=6)
        variants.append({'file':str(web.relative_to(root)).replace('\\','/'), 'width':width, 'bytes':web.stat().st_size, 'sha256':hashlib.sha256(web.read_bytes()).hexdigest()})
    rows.append({'name':name, 'master':str(dest.relative_to(root)).replace('\\','/'), 'size':art.size, 'mode':art.mode, 'alphaExtrema':art.getchannel('A').getextrema() if art.mode=='RGBA' else None, 'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(), 'variants':variants})
(root / 'docs/redesign-v2/step-02/asset-manifest.json').write_text(json.dumps({'processing':'copy + nearest-neighbor resize + lossless WebP only; alpha preserved', 'assets':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Exported',len(rows),'original assets')
