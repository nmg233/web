"""Only copy masters, nearest-neighbor resize and lossless WebP; no image editing."""
import json, hashlib, shutil
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
record=json.loads((root/'docs/redesign-v2/step-02/visual-patch/generation-prompts.json').read_text(encoding='utf-8'))
out=root/'frontend/public/assets/redesign-v2/visual-patch'
manifest=[]
for item in record['jobs']:
    if not item['selected']: continue
    name=item['name'].removesuffix('-v2')
    target=out/'masters'/f'{name}.png'
    if target.exists(): raise RuntimeError(f'Preserve existing master: {target}')
    shutil.copyfile(item['generated'],target)
    im=Image.open(target)
    transparent=name.startswith(('robot','fortune'))
    sizes=[96,192] if transparent else [480,960,1536]
    row={'name':name,'master':str(target.relative_to(root)).replace('\\','/'),'size':im.size,'mode':im.mode,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'variants':[]}
    if transparent:
        assert im.mode=='RGBA' and im.getchannel('A').getextrema()[0]==0,'True alpha required'
        row['alphaExtrema']=im.getchannel('A').getextrema()
    for width in sizes:
        target_web=out/'web'/f'{name}-{width}.webp'
        im.resize((width,round(im.height*width/im.width)),Image.Resampling.NEAREST).save(target_web,'WEBP',lossless=True,method=6)
        row['variants'].append({'file':str(target_web.relative_to(root)).replace('\\','/'),'width':width,'bytes':target_web.stat().st_size,'sha256':hashlib.sha256(target_web.read_bytes()).hexdigest()})
    manifest.append(row)
(root/'docs/redesign-v2/step-02/visual-patch/asset-manifest.json').write_text(json.dumps({'processing':'copy + nearest resize + lossless WebP; alpha preserved','assets':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Exported',len(manifest),'original assets')
