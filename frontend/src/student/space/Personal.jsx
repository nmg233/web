import Sentence from '../../content/Sentence';
import {copyText,copyFragment} from '../../content/copy';
import CopyBlock from '../../content/CopyBlock';
import {useCallback} from 'react';
import {Link,useSearchParams,useNavigate} from 'react-router-dom';
import {Button} from 'antd';
import {useAuth} from '../../store/AuthContext';
import {courseAPI} from '../../api';
import client from '../../api/client';
import {currentAccessTarget} from '../accessPolicy';
import {safeReturnTo} from '../model';
import {courseIdFromPath} from '../spaceRoutes';
import useRemote from '../useRemote';
import Rewards from '../Rewards';
import DailyFortune from './DailyFortune';
import AccountAvatar from './AccountAvatar';
import RealCoins from '../RealCoins';
export default function Personal(){
 const {user,logout}=useAuth(),[params]=useSearchParams(),navigate=useNavigate();
 const source=String(safeReturnTo(params.get('returnTo'),''));const id=String(courseIdFromPath(source)||'');
 const fetcher=useCallback(async()=>{if(!id)return null;await courseAPI.detail(id);const url=new URL(source,'https://local.invalid');const target=currentAccessTarget(url.pathname,url.search);try{if(target.endpoint)await client.get(target.endpoint,{studentAccessProbe:true,silent:true});return {path:source};}catch{return {path:'/courses/'+id,notice:copyText('system.me.001')};}},[id,source]);const {data,error}=useRemote(fetcher,{courseSensitive:true,courseId:id});
 const safeSource=id&&/^\/courses\/\d+(?:\/(?:lab|glider|archives|reflection|assistant|learn|tasks(?:\/\d+)?|works(?:\/(?:upload|\d+))?|lessons\/\d+\/learn))?(?:[?#].*)?$/.test(source);
 return <div className="space-personal"><header className="space-personal-header"><div><span className="space-eyebrow">{copyText('system.me.002')}</span><h1 className="space-personal-name"><AccountAvatar key={user.id}/><span className="personal-name-text">{user.real_name||user.username}</span><Link className="personal-badges-link" to={"/me/badges?returnTo="+encodeURIComponent("/me"+(params.toString()?"?"+params.toString():""))}>{copyText("badgeRoom.entry")}</Link></h1><Sentence>{copyFragment('system.me.003')}{user.username}</Sentence></div>{data&&safeSource?<Link to={data.path}>{copyText('system.me.004')}</Link>:<Link to="/explore">{copyText('system.me.005')}</Link>}</header><DailyFortune/><RealCoins/>{data?.notice&&<Sentence role="status">{data.notice}</Sentence>}{error&&<CopyBlock id="system.me.006" as="p" role="status"/>}<nav className="space-personal-actions" aria-label={copyText('system.me.007')}><Link to="/lab">{copyText('next.lab.free')}</Link><Link to="/change-password">{copyText('system.me.008')}</Link><Link to="/notifications">{copyText('system.me.009')}</Link><Link to="/feedback">{copyText('system.me.010')}</Link><Button onClick={()=>{logout();navigate('/login');}}>{copyText('system.me.011')}</Button></nav><Rewards/></div>;
}
