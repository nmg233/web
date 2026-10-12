import {useEffect,useState} from 'react';
import {Alert,Button,Spin} from 'antd';
import UploadQueue from '../../pages/courses/UploadQueue';
import {maintenanceAPI} from '../../pages/courses/maintenanceApi';
export default function LessonVideoUpload({courseId,courseTitle,lesson,refresh,onBusyChange,onDirtyChange}) {
  const [policy,setPolicy]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let live=true;maintenanceAPI.formats().then(p=>{if(live)setPolicy(p);}).catch(()=>{if(live)setError('无法读取上传限制，请重试');});return()=>{live=false;};},[attempt]);
  if(!policy)return error?<Alert type="error" title={error} action={<Button onClick={()=>setAttempt(v=>v+1)}>重试</Button>}/>:<Spin/>;
  return <><Alert type="info" title={`视频固定上传到：${courseTitle || `课程 #${courseId}`} → ${lesson.title}`} description="请填写视频简介；上传失败或停止不代表服务器已回滚，请先查询原请求结果。"/><UploadQueue courseId={courseId} lessons={[lesson]} boundLessonId={lesson.id} policy={policy} kind="replay" refresh={refresh} dirty={onDirtyChange || (()=>{})} onBusyChange={onBusyChange}/></>;
}
