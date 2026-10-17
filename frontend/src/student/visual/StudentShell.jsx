import {mentorText} from '../../pages/mentor/workspaceCopy';
import StudentCopyText from '../../content/ManagedText';
import {copyText} from '../../content/copy';
import {useCallback} from 'react';
import {Drawer,Grid} from 'antd';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../../store/AuthContext';
import {courseAPI} from '../../api';
import NotificationBell from '../../components/notifications/NotificationBell';
import RewardProvider from '../RewardProvider';
import {useRealCoins} from '../useRealCoins';
import {useCourseId} from '../useCourseApis';
import useRemote from '../useRemote';
import StudentTheme from './StudentTheme';
import PixelIcon from './PixelIcon';
import {asset} from "../space/identity";
import {useCourseExperience} from '../space/useCourseExperience';
import FloatingAssistant from '../space/FloatingAssistant';
import AvatarPreference from '../space/AvatarPreference';
import AccountAvatarImage from '../space/AccountAvatarImage';
import '../space/course-pages.css';
import SceneArt from '../space/SceneArt';
import CourseScene from '../space/CourseScene';
import CourseThemeImage from '../space/CourseThemeImage';
import {useCoursePresentation} from '../space/CoursePresentation';
import StudentGuideModal from '../guide/StudentGuideModal';

function Points({to}){const {data,error,loading}=useRealCoins();return <Link to={to} className="student-points" data-testid="header-real-coins" aria-label={copyText('coins.title')+' '+(data?data.balance:copyText(error?'coins.readFailed':'coins.loading'))} data-copy-bindings={JSON.stringify(['coins.title',error?'coins.readFailed':'coins.loading'])}><PixelIcon name="coin"/><strong data-business-value="真实金币余额">{data?data.balance:'—'}</strong><span>{<StudentCopyText id={loading?'coins.shortLoading':error?'coins.shortError':'coins.unit'}/>}</span></Link>;}
function CourseNavigation({id,course,close}){
 const {pathname}=useLocation();const look=useCoursePresentation(),theme=look.theme;
 const entries=[['','map','course.nav.map'],['/lab','lab','course.nav.lab'],['/archives','archive','course.nav.archive']];
 return <div className="space-course-navigation" data-course-theme={theme}>
   <Link to="/explore" className="space-exit" onClick={close}><PixelIcon name="back"/>{<StudentCopyText id={'course.nav.exit'}/>}</Link>
   <Link to={'/courses/'+id} className="space-course-brand" onClick={close}>{look.data?.themeImages?.mark?<CourseThemeImage image={look.data.themeImages.mark}/>:theme==='voyage'?<img src={asset('ship',192)} alt=""/>:<PixelIcon name="book" size={48}/>}<strong>{course?.title||<StudentCopyText id={'system.shell.005'}/>}</strong><span>{<StudentCopyText id={'system.shell.006'}/>}{id}</span></Link>
   <nav aria-label={copyText('system.shell.007')} data-copy-bindings={JSON.stringify(['system.shell.007'])}>{entries.map(([suffix,icon,labelId])=>{const to='/courses/'+id+suffix;const selected=suffix==='/lab'?/\/(lab|glider)$/.test(pathname):suffix==='/archives'?/\/(archives|works|reflection)(?:\/|$)/.test(pathname):! /\/(lab|glider|archives|works|reflection)(?:\/|$)/.test(pathname);return <Link key={to} to={to} aria-current={selected?'page':undefined} onClick={close}><PixelIcon name={icon}/><span><StudentCopyText id={labelId}/></span><span aria-hidden="true">›</span></Link>;})}</nav>
   <p className="space-reward-links"><Link to="/feedback/new" state={{courseId:id,from:pathname}}>{mentorText('student.course.feedback')}</Link><Link to={'/me?courseId='+id+'&returnTo='+encodeURIComponent('/courses/'+id)} onClick={close}>本课程礼品兑换</Link><Link to={'/me/badges?courseId='+id+'&returnTo='+encodeURIComponent('/me?returnTo='+encodeURIComponent('/courses/'+id))} onClick={close}>本课程勋章墙</Link></p>
   <div className="space-sidebar-art" aria-hidden="true"/>
 </div>;
}
function Shell({children}){
 const look=useCoursePresentation();
 const id=useCourseId(),{user}=useAuth(),location=useLocation(),screens=Grid.useBreakpoint();
 const session=useCourseExperience(),open=session?.overlay==='nav';
 const setOpen=next=>session?.openOverlay(next?'nav':null);
 const fetcher=useCallback(()=>id?courseAPI.detail(id):Promise.resolve(null),[id]);
 const {data}=useRemote(fetcher,{courseSensitive:true,courseId:id});
 const me='/me'+(id?'?returnTo='+encodeURIComponent(location.pathname+location.search):'');
 const deep=id&&location.pathname!=='/courses/'+id;
 const voyage=id&&look.theme==='voyage';
 const scene=id?(voyage?(/\/(lab|glider|archives|works|reflection)(?:\/|$)/.test(location.pathname)?'voyage-lab':'voyage-reading'):'campus-select'):(location.pathname==='/me'?'campus-personal':'campus-select');
 return <div className={'space-shell student-shell '+(id?'space-shell--course':'space-shell--platform')} data-course-space={id||undefined} data-course-pathname={location.pathname}>
   <div className="space-underlay" aria-hidden="true">{id?<CourseScene key={scene} name={scene} patch priority/>:<SceneArt key={scene} name={scene} patch priority/>}</div>
   {id&&screens.lg&&<aside className="space-sidebar"><CourseNavigation id={id} course={data?.course}/></aside>}
   <div className="space-shell-main">
    <header className="space-header">
      {id?<div className="space-header-context">{!screens.lg&&<button className="space-menu-button" onClick={()=>setOpen(true)} aria-label={copyText('system.shell.008')} aria-expanded={open} data-copy-bindings={JSON.stringify(['system.shell.008'])}><PixelIcon name="menu"/></button>}<span>{data?.course.title||<StudentCopyText id={'system.shell.009'}/>}</span></div>:<Link className="space-platform-brand" to="/explore"><PixelIcon name="book" size={28}/><StudentCopyText id="platform.name"/></Link>}
      {!id&&<nav className="space-platform-nav" aria-label={copyText('system.shell.010')} data-copy-bindings={JSON.stringify(['system.shell.010'])}><Link to="/explore" aria-current={location.pathname==='/explore'?'page':undefined}>{<StudentCopyText id={'platform.nav.courses'}/>}</Link><Link to="/guide" aria-current={location.pathname==='/guide'?'page':undefined}>{<StudentCopyText id={'guide.nav'}/>}</Link><Link to="/me" aria-current={location.pathname==='/me'?'page':undefined}>{<StudentCopyText id={'platform.nav.me'}/>}</Link></nav>}
      <div className="space-header-actions"><AvatarPreference/><Points to={me}/><NotificationBell icon={<PixelIcon name="notification"/>} buttonClassName="student-notification-button"/><Link to={me} className="space-account" aria-label={copyText('system.shell.013')} data-copy-bindings={JSON.stringify(['system.shell.013'])}><AccountAvatarImage preset={user.avatar_preset} legacyUrl={user.avatar_url}/><span data-business-value="账号姓名">{user.real_name||user.username}</span></Link></div>
    </header>
    {deep&&<nav className="space-sticky-return" aria-label={copyText('system.shell.014')} data-copy-bindings={JSON.stringify(['system.shell.014'])}><Link to={'/courses/'+id}><PixelIcon name="back"/>{<StudentCopyText id={'course.nav.return'}/>}</Link><Link to="/explore">{<StudentCopyText id={'system.shell.016'}/>}</Link></nav>}
    <main id="student-main" className="student-content space-content">{children}</main>
   </div>
   {id&&<Drawer zIndex={1250} open={!screens.lg&&open} onClose={()=>setOpen(false)} placement="left" width={272} title={copyText('system.shell.017')} rootClassName="student-pixel student-interactions space-navigation-drawer" styles={{body:{padding:0}}} data-copy-bindings={JSON.stringify(['system.shell.017'])}><CourseNavigation id={id} course={data?.course} close={()=>setOpen(false)}/></Drawer>}
   {id&&<FloatingAssistant/>}
  <StudentGuideModal/>
 </div>;
}
export default function StudentShell({children}){
 return <ThemedShell>{children}</ThemedShell>;
}
function ThemedShell({children}){
 const {user,logout}=useAuth(),id=useCourseId();
 const look=useCoursePresentation();
 return <StudentTheme variant={id?look.theme:'campus'}>
  {user.force_reset_password?<div className="forced-shell"><header className="forced-header"><strong><StudentCopyText id="platform.name"/>{<StudentCopyText id={'system.shell.018'}/>}</strong><button onClick={logout}>{<StudentCopyText id={'system.shell.019'}/>}</button></header><main id="student-main">{children}</main></div>:<RewardProvider key={user.id} accountId={user.id}><a href="#student-main" className="student-skip-link">{<StudentCopyText id={'system.shell.020'}/>}</a><Shell>{children}</Shell></RewardProvider>}
 </StudentTheme>;
}
