import {mentorText} from '../mentor/workspaceCopy';
import './public-theme-picker.css';
import {publicThemes,effectiveTheme} from '../../student/space/publicThemes';
export default function PublicThemePicker({value,onChange,disabled=false,current}){
 return <div><div className="public-theme-picker" role="group" aria-label={mentorText("courses.PublicThemePicker.5ca98ba624b7")}>{Object.entries(publicThemes).map(([id,t])=><button key={id} type="button" disabled={disabled} aria-pressed={value===id} onClick={()=>onChange?.(id)}><img src={t.cover} alt="" width={160} height={90} loading="lazy"/><strong>{t.label}</strong></button>)}</div>{!value&&effectiveTheme(current)==='voyage'&&<p>{mentorText("courses.PublicThemePicker.9441bfa58903")}</p>}</div>;
}
