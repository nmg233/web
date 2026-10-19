import {useSyncExternalStore} from 'react';
import {useAuth} from '../store/AuthContext';
import ManagedText from '../content/ManagedText';
import {copySnapshot,subscribeCopy,runtimeText} from '../content/runtimeCopy';
import StaffPixelIcon from './StaffPixelIcon';

// Replace only a known system-heading ornament; keep live copy and its editing ID.
export default function StaffHeadingText({id,icon}){
 const {user}=useAuth();
 useSyncExternalStore(subscribeCopy,copySnapshot,copySnapshot);
 const text=runtimeText(id);
 if(!['admin','academic_mentor'].includes(user?.role))return <ManagedText id={id}/>;
 if(!text)return null;
 return <span className="staff-heading-label"><StaffPixelIcon name={icon} size={26}/><ManagedText id={id} rendered={text.replace(/^(?:📂|🤖|👥|👋)\s*/u,'')}/></span>;
}
