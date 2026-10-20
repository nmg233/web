import {Alert,Input} from 'antd';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {returnContext} from '../../utils/returnContext';
import {useAuth} from '../../store/AuthContext';
import StaffPixelIcon from '../../components/StaffPixelIcon';
import registry from '../../../../shared/staffWorkspace.json' with {type:'json'};
import './desk.css';
export default function Guide(){
 const{user}=useAuth(),location=useLocation(),[params,setParams]=useSearchParams(),query=params.get('q')||'',admin=user.role==='admin';
 const topics=registry.guideTopics.filter(t=>t.roles.includes(user.role)&&(!query||[t.title,t.permission,t.navigation,...t.steps].join(' ').includes(query)));
 return <section className="staff-task-guide"><header><div><p>{admin?'管理员':'执行导师'} · 常见任务</p><h1>使用指南</h1></div><Link className="desk-go" to={returnContext(location.state?.returnTo,'/dashboard')}>返回工作台</Link></header><Alert type="info" title={admin?'学校管理、课程管理和已有学生账号管理分别授权':'先核对所管课程、获准学校及可维护账号'} description="“去办理”进入真实页面，最终权限由服务器核验；指南不授予额外权限。保存正文、上传完成与发布生效仍是不同操作。"/><Input.Search className="staff-guide-search" aria-label="搜索使用指南" placeholder="查找任务、权限或导航路径" allowClear value={query} onChange={e=>{const next=new URLSearchParams(params);if(e.target.value)next.set('q',e.target.value);else next.delete('q');setParams(next,{replace:true,state:location.state});}}/><div className="staff-guide-grid">{topics.map(t=><article className="staff-guide-topic" id={t.id} key={t.id}><h2><StaffPixelIcon name={t.icon}/>{t.title}</h2><nav aria-label={t.title+'导航路径'}>{t.navigation}</nav><p className="staff-guide-permission">权限：{t.permission}</p><ol>{t.steps.map(step=><li key={step}>{step}</li>)}</ol><Link className="desk-go" to={admin&&t.adminPath?t.adminPath:t.path} state={{returnTo:location.pathname+location.search}}>去办理 →</Link>{t.secondaryPath&&<Link className="desk-go" to={t.secondaryPath}>{t.secondaryLabel}</Link>}</article>)}</div>{!topics.length&&<p>没有匹配的任务，请尝试“学校”“课程”或“评审”</p>}<p><a href="/course-packages/guide.html" target="_blank" rel="noreferrer">课程包格式、附件限制与导入说明</a></p></section>;
}
