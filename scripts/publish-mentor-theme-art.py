# Non-destructive publishing: preserve image_gen masters and alpha; nearest-neighbour sizes only.
from pathlib import Path
from PIL import Image
import json,hashlib,sys,shutil
root=Path(__file__).resolve().parent.parent
art=root/'docs/mentor-workspace/step-03/art';out=root/'frontend/public/assets/public-themes'
manifest_path=art/'generation.json';m=json.loads(manifest_path.read_text('utf-8'));out.mkdir(parents=True,exist_ok=True)
if len(sys.argv)>1:
 identity,source=sys.argv[1:3];spec=next(a for a in json.loads((art/'requests.json').read_text('utf-8')) if a['id']==identity)
 dest=art/'masters'/(identity+'.png')
 if dest.exists():assert hashlib.sha256(dest.read_bytes()).digest()==hashlib.sha256(Path(source).read_bytes()).digest(), 'Never overwrite an existing master'
 else:shutil.copy2(source,dest)
 if not any(a['id']==identity for a in m):m.append({'id':identity,'source':Path(source).name,'prompt':spec['prompt'],'reference':spec['reference'],'tool':'built-in image_gen','model':None,'transparent':spec['transparent']})
for a in m:
 p=art/'masters'/(a['id']+'.png');im=Image.open(p);a['master']='masters/'+p.name;a['size']=list(im.size);a['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();a['mode']=im.mode;a['source']=Path(a['source']).name
 alpha='node' in a['id'] or a['id'].endswith('-mark')
 if alpha:
  assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255),a['id']+' must have genuine alpha'
  if 'node' in a['id']:a.setdefault('landing',[.5,.70])
  sizes=[192,384] if 'node' in a['id'] else [96,192,384]
 else:sizes=[480,960,1536]
 a['variants']=[]
 for w in sizes:
  file=out/(a['id']+'-'+str(w)+'.webp')
  if not file.exists():im.resize((w,round(im.height*w/im.width)),Image.Resampling.NEAREST).save(file,lossless=True,exact=True)
  a['variants'].append({'file':str(file.relative_to(root)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':w})
manifest_path.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n','utf-8');print('Published masters:',len(m))
