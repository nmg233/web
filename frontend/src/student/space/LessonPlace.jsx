import {copyText as siteText} from "../../content/copy";
import {useState} from 'react';
import {asset} from './identity';
import {copyText} from '../../content/copy';
import {nextAsset} from './nextAssets';

// Visual locations cycle with the real route order. They do not name lessons,
// assign chapters or imply any learning/prerequisite rule.
const places = [
  {art:'moon-base',x:'50%',y:'65%'},
  {art:'orbital-berth',x:'50%',y:'68%'},
  {art:'asteroid-outpost',x:'53%',y:'66%'},
];

const themedPlaces={visit:{art:'vr',x:'50%',y:'70%'},theory:{art:'theory',x:'50%',y:'70%'},experiment:{art:'experiment',x:'50%',y:'65%'}};
export default function LessonPlace({number,type,current,selected,completed,priority,theme,unknown=false}) {
  const [failed,setFailed] = useState(false);
  const themed=themedPlaces[type];
  const place = themed||places[(number-1)%places.length];
  const placeAsset=size=>themed?`/assets/experience-patch/${place.art}-${size}.webp`:asset(place.art,size);
  const voyage = theme==='voyage';
  return <span className="space-lesson-place" data-place={voyage?place.art:'campus'} data-place-failed={failed||undefined}
    style={{'--landing-x':place.x,'--landing-y':place.y}} aria-hidden="true">
    <span className="space-place-visual">
    {unknown && !failed && <img className="space-place-art" src={nextAsset('unknown-platform',192)} alt="" width={192} height={192} loading="lazy" onError={()=>setFailed(true)}/> }
    {voyage && !unknown && !failed && <img className="space-place-art" src={placeAsset(192)} srcSet={`${placeAsset(192)} 192w, ${placeAsset(384)} 384w`} sizes="(max-width:767px) 210px, 220px" alt="" width="192" height="192" loading={priority?'eager':'lazy'} onError={()=>setFailed(true)}/>}
    {failed && <span className="space-place-fallback">{copyText('patch.scene.failed')}</span>}
    <span className="space-place-number">{String(number).padStart(2,'0')}</span>
    {current && <span className="space-place-current">{siteText("site.35e1f6b3ea0f00a9")}</span>}
    {selected && <span className="space-place-selection">{siteText("site.60ed0fc47141f6f1")}</span>}
    {completed && <span className="space-place-complete">✓</span>}
    {unknown&&<span className="space-place-unknown">?</span>}
    {current&&voyage&&<img className="space-place-astronaut" src={nextAsset('astronaut',96)} alt="" width={96} height={96}/>}
    </span>
    <span className="space-landing-anchor" />
  </span>;
}
