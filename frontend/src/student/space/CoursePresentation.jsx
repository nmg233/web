/* eslint-disable react-refresh/only-export-components */
import {createContext,useContext,useCallback,useEffect} from 'react';
import {useAuth} from '../../store/AuthContext';
import {useCourseId,useCourseApis} from '../useCourseApis';
import useRemote from '../useRemote';
import {coursePresentation} from './identity';
import {PageLoading,StudentPageStatus} from '../../components/PageStatus';
import {Button} from 'antd';
import {Link} from 'react-router-dom';
import {copyText} from '../../content/copy';
const Context=createContext(null);
export default function CoursePresentationProvider({children}){const {user}=useAuth(),id=useCourseId();return <Metadata key={`${user.id}:${id||'platform'}`} id={id}>{children}</Metadata>;}
function Metadata({id,children}){
 const {courseAPI}=useCourseApis(),fetcher=useCallback(()=>id?courseAPI.detail(id):Promise.resolve(null),[id,courseAPI]);
 const {data,error,retry}=useRemote(fetcher,{courseSensitive:true,courseId:id,retainDataOnRetry:true});
 useEffect(()=>{if(!id)return;const read=()=>{if(!document.hidden)retry();};window.addEventListener('focus',read);return()=>window.removeEventListener('focus',read);},[id,retry]);
 const value={...coursePresentation(data?.course),id,data,error,retry,experiments:data?.experiments||[],groups:(data?.chapters||[]).map(c=>({id:c.id,title:c.title,lessonIds:(data.lessons||[]).filter(l=>l.chapter_id===c.id).map(l=>l.id)}))};
 if(id&&!data){const back=<Link to="/explore" className="student-status-return">{copyText('course.nav.exit')}</Link>;return error?<StudentPageStatus title={copyText('maintenance.metadata.error')} description={error}>{back}<Button onClick={retry}>{copyText('maintenance.retryRead')}</Button></StudentPageStatus>:<PageLoading>{copyText('maintenance.metadata.loading')}<br/>{back}</PageLoading>;}
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCoursePresentation(){return useContext(Context)||{...coursePresentation(null),experiments:[],groups:[],data:null};}

export function CoursePreviewTheme({course,children}){return <Context.Provider value={{...coursePresentation(course),id:course.id,data:{course},experiments:[],groups:[]}}>{children}</Context.Provider>;}
