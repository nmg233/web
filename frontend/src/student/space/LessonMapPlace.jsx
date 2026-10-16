import StudentCopyText from '../../content/ManagedText';
import {useEffect,useState} from 'react';
import client from '../../api/client';
import {asset} from './identity';
import {nextAsset} from './nextAssets';
const legacy=[{art:'moon-base',x:0.5,y:0.65},{art:'orbital-berth',x:0.5,y:0.68},{art:'asteroid-outpost',x:0.53,y:0.66}];
const themed={visit:{art:'vr',x:0.5,y:0.7},theory:{art:'theory',x:0.5,y:0.7},experiment:{art:'experiment',x:0.5,y:0.65}};
const artUrl=(name,size)=>name==='rock'?nextAsset('unknown-platform',size):['vr','theory','experiment'].includes(name)?`/assets/experience-patch/${name}-${size}.webp`:asset(name,size);
export default function LessonMapPlace(props){return <Place key={props.lesson?.map_image_url||props.lesson?.map_image_id||props.lesson?.map_art_preset||'legacy'} {...props}/>;}
function Place({lesson,number,type,current,selected,completed,priority,theme,unknown=false}){
 const [failed,setFailed]=useState(false),[remote,setRemote]=useState(''),[downloadFailed,setDownloadFailed]=useState(false);
 const base=themed[type]||legacy[(number-1)%legacy.length],art=lesson?.map_art_preset||base.art;
 const x=lesson?.landing_x??base.x,y=lesson?.landing_y??base.y,custom=lesson?.map_image_url?.startsWith('blob:')?lesson.map_image_url:(lesson?.map_image_id?`/courses/${Number(lesson.course_id)}/map-images/${encodeURIComponent(lesson.map_image_id)}`:null);
 useEffect(()=>{if(!custom||custom.startsWith('blob:'))return;let live=true,url;client.get(custom,{responseType:'blob',silent:true}).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setRemote(url);}).catch(()=>{if(live)setDownloadFailed(true);});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[custom]);
 const fallback=artUrl('rock',192),initial=artUrl(unknown||custom?'rock':art,192),source=!failed&&!downloadFailed?(custom?.startsWith('blob:')?custom:remote||initial):fallback,voyage=theme==='voyage',hasArt=voyage||Boolean(custom)||lesson?.map_art_preset==='rock';
 return <span className="space-lesson-place" data-place={custom?'custom':hasArt?art:'campus'} data-place-failed={failed||downloadFailed||undefined} style={{'--landing-x':(x*100)+'%','--landing-y':(y*100)+'%'}} aria-hidden="true"><span className="space-place-visual">
 {(hasArt||unknown)&&<img className="space-place-art" src={unknown?nextAsset('unknown-platform',192):source} srcSet={!custom&&!unknown?`${artUrl(art,192)} 192w, ${artUrl(art,384)} 384w`:undefined} sizes="(max-width:767px) 210px, 220px" alt="" width={192} height={192} loading={priority?'eager':'lazy'} onError={e=>{setFailed(true);e.currentTarget.removeAttribute('srcset');if(e.currentTarget.getAttribute('src')!==fallback)e.currentTarget.src=fallback;}}/>}
 {(failed||downloadFailed)&&<span className="map-image-fallback-note">{<StudentCopyText id={'patch.scene.failed'}/>}</span>}
 <span className="space-place-number">{String(number).padStart(2,'0')}</span>{current&&<span className="space-place-current">{<StudentCopyText id={'site.35e1f6b3ea0f00a9'}/>}</span>}{selected&&<span className="space-place-selection">{<StudentCopyText id={'site.60ed0fc47141f6f1'}/>}</span>}{completed&&<span className="space-place-complete">✓</span>}{unknown&&<span className="space-place-unknown">?</span>}{current&&hasArt&&<img className="space-place-astronaut" src={nextAsset('astronaut',96)} alt="" width={96} height={96}/>}</span><span className="space-landing-anchor"/></span>;
}
