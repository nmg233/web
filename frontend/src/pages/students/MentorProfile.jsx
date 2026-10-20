import {useEffect,useState} from 'react';
import {Alert,Card,Descriptions,Empty,Select,Space,Tag,Typography} from 'antd';
import {Link} from 'react-router-dom';
import client from '../../api/client';
import CourseManagers from '../courses/CourseManagers';
import './mentorProfile.css';
const status={draft:'草稿',published:'已发布',archived:'已归档'};
export default function MentorProfile({mentor,detail,isAdmin,onSaved}){
 const [courses,setCourses]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState('');
 useEffect(()=>{if(!isAdmin)return;let live=true;client.get('/courses').then(r=>{if(live)setCourses(r.courses);}).catch(()=>{if(live)setError('无法读取可分配总课题，请刷新重试');});return()=>{live=false;};},[isAdmin]);
 return <section className="mentor-profile" aria-label="执行导师专属资料">
  <Card className="mentor-profile-identity" title="执行导师档案">
   <div className="mentor-profile-monogram" aria-hidden="true">{mentor.real_name?.slice(0,1)}</div>
   <Typography.Title level={3}>{mentor.real_name}</Typography.Title><Tag color="blue">执行导师</Tag>
   <p>总课题管理以管理员明确授权为准，授课安排不自动赋予管理权。</p>
   <Tag color={mentor.is_active&&!mentor.archived_at?'green':'red'}>{mentor.is_active&&!mentor.archived_at?'账号正常':'账号已停用'}</Tag>
  </Card>
  <div className="mentor-profile-main">
   <Card title="账号与联系信息"><Descriptions bordered column={1}>
    <Descriptions.Item label="登录账号">{mentor.username}</Descriptions.Item><Descriptions.Item label="真实姓名">{mentor.real_name}</Descriptions.Item>
    <Descriptions.Item label="邮箱">{mentor.email||'未填写'}</Descriptions.Item><Descriptions.Item label="手机号">{mentor.phone||'未填写'}</Descriptions.Item>
    <Descriptions.Item label="个人简介">{mentor.profile||'未填写'}</Descriptions.Item>
   </Descriptions></Card>
   <Card title="管理的总课题">
    {detail.managedCourses?.length?<Space wrap>{detail.managedCourses.map(c=><Link key={c.id} to={`/courses/${c.id}`}><Tag color="blue">{c.title} · {status[c.status]||c.status}</Tag></Link>)}</Space>:<Empty description="暂无当前有效的管理总课题"/>}
    {isAdmin&&<><p>分配或撤销管理权限（覆盖该总课题全部课时）：</p>{error&&<Alert type="error" title={error}/>}<Select aria-label="选择分配管理权限的总课题" style={{width:'100%'}} placeholder="选择总课题，核对当前关系后操作" showSearch optionFilterProp="label" value={selected} onChange={setSelected} options={courses.map(c=>({value:c.id,label:c.title}))}/>{selected&&<CourseManagers key={selected} courseId={selected} initialMentorId={mentor.id} onSaved={onSaved}/>}</>}
   </Card>
   {isAdmin&&<Card title="导师管理授权记录">{detail.managementRelations?.length?detail.managementRelations.map(r=><p key={r.course_id}>{r.title} · {r.active?'关系有效':'已撤销'} · {r.is_active?'账号启用':'账号停用'} · 修订 {r.revision}</p>):<Empty description="暂无管理关系记录"/>}<details><summary>授权与撤销历史</summary>{detail.managementHistory?.map(r=><p key={r.id}>{r.created_at} · {r.course_title} · {r.action==='grant'?'授予':r.action==='revoke'?'撤销':r.action} · {r.reason}</p>)}</details></Card>}
  </div>
 </section>;
}
