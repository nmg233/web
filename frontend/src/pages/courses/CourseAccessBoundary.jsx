import {useCallback,useEffect,useRef,useState} from 'react';
import {useParams,useSearchParams,Link} from 'react-router-dom';
import {Alert,Button,Space} from 'antd';
import {useAuth} from '../../store/AuthContext';
import client from '../../api/client';
// Keep only text actually typed by this browser. Never retain fetched private course payloads after denial.
export default function CourseAccessBoundary({children}){
 const{user}=useAuth(),params=useParams(),[query]=useSearchParams(),id=params.id||params.courseId||query.get('courseId');
 return <CourseBoundary key={String(user?.id)+':'+id} user={user} id={id}>{children}</CourseBoundary>;
}
function CourseBoundary({user,id,children}){
 const[denied,setDenied]=useState(false),[checking,setChecking]=useState(false),typed=useRef({}),live=useRef(true),generation=useRef(0);
 const check=useCallback(async()=>{if(user?.role!=='academic_mentor'||!id)return;const n=++generation.current;setChecking(true);try{await client.get('/courses/'+id,{silent:true,skipCourseCheck:true});if(live.current&&n===generation.current)setDenied(false);}catch(e){if(live.current&&n===generation.current&&[401,403,404].includes(e.response?.status))setDenied(true);}finally{if(live.current&&n===generation.current)setChecking(false);}},[id,user]);
 // Request generation invalidates late responses; not a DOM ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{live.current=true;const changed=()=>void check();window.addEventListener('course-access-check',changed);window.addEventListener('focus',changed);return()=>{live.current=false;generation.current++;window.removeEventListener('course-access-check',changed);window.removeEventListener('focus',changed);};},[check]);
 const download=()=>{const blob=new Blob([JSON.stringify({accountId:user.id,courseId:id,notice:'仅本机本账号实际输入，不代表服务器已保存；恢复授权后人工核对填写',fields:typed.current},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='本人未保存输入-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(denied)return <Alert type="error" title="课程管理权限已失效，课程私有内容已清除" description="仅保留本次亲自输入的文字供核对；不会保留服务器读取的教材或自动提交。权限恢复后可重新检查。" action={<Space wrap><Button onClick={()=>void check()} loading={checking}>重新检查课程授权</Button><Button onClick={download}>导出本人未保存输入</Button><Link to="/courses">返回课程列表</Link></Space>}/>;
 return <div onInputCapture={event=>{const el=event.target;if(['INPUT','TEXTAREA'].includes(el.tagName)&&el.type!=='password'&&el.type!=='file')typed.current[(el.form?.name||'editor')+':'+(el.name||el.id||el.getAttribute('aria-label')||'text')]=el.value;}}>{children}</div>;
}
