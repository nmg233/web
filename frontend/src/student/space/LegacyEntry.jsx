import {copyText as siteText} from "../../content/copy";
import {useCallback} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {courseAPI,workAPI,taskAPI} from '../../api';
import useRemote from '../useRemote';
import AsyncPageState from '../../student/visual/StudentPageState';
export default function LegacyEntry({free}){
 const location=useLocation();const pathname=location.pathname,search=location.search;
 const fetcher=useCallback(async()=>{
  const params=new URLSearchParams(search);let id=params.get('course_id');let suffix;
  if(free&&!id)return {free:true};
  const object=pathname.match(/^\/(works|tasks)\/(\d+)$/);
  if(object){const result=await (object[1]==='works'?workAPI.detail:taskAPI.detail)(object[2]);id=(result.work||result.task)?.course_id;suffix=pathname;}
  else if(pathname==='/works/upload'&&params.get('task_id')){const result=await taskAPI.detail(params.get('task_id'));id=result.task.course_id;suffix=pathname;}
  else if(pathname==='/glider'&&id)suffix='/glider';
  else if(pathname==='/dashboard/ai'&&id)suffix='/assistant';
  if(object&&!id)return {to:'/explore',notice:siteText("site.204051e4e985678f")};
  if(!id||!suffix)return {to:'/explore',notice:siteText("site.b83ae6b32dd26d21")};
  await courseAPI.detail(id);
  return {to:'/courses/'+id+suffix+search+location.hash};
 },[pathname,search,location.hash,free]);
 const {data,loading,error,retry}=useRemote(fetcher,{courseSensitive:true});
 if(data?.free)return free;
 if(data)return <Navigate to={data.to} replace state={{notice:data.notice}}/>;
 return <AsyncPageState loading={loading} error={error} onRetry={retry}/>;
}
