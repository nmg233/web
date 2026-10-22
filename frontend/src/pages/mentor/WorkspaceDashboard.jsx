import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Button,Empty,Pagination,Select,Spin} from 'antd';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import client from '../../api/client';
import {useAuth} from '../../store/AuthContext';
import StaffPixelIcon from '../../components/StaffPixelIcon';
import {visiblePolling} from '../../utils/visiblePolling';
import {mentorText} from './workspaceCopy';
import registry from '../../../../shared/staffWorkspace.json' with {type:'json'};
import './desk.css';
const labels=Object.fromEntries(registry.categories.map(c=>[c.key,c.copyKey?mentorText(c.copyKey):c.label]));
const dateFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
function BeijingClock(){
 const[now,setNow]=useState(()=>Date.now());useEffect(()=>visiblePolling({run:()=>setNow(Date.now()),interval:1000}),[]);
 return <div className="desk-clock" aria-label="北京时间电子钟"><span>BEIJING · 北京时间</span><time dateTime={new Date(now).toISOString()} aria-live="off">{timeFormat.format(now)}</time><small>{dateFormat.format(now)}</small></div>;
}
export default function WorkspaceDashboard(){
 const{user}=useAuth(),admin=user.role==='admin',location=useLocation(),[params,setParams]=useSearchParams(),category=params.get('category')||'',page=Math.max(1,Number(params.get('page'))||1);
 const[state,setState]=useState({data:null,error:''}),sequence=useRef(0);
 const read=useCallback(async()=>{const n=++sequence.current;try{const data=await client.get('/mentor-workspace/dashboard',{params:{category:category||undefined,page,pageSize:5},silent:true});if(n===sequence.current)setState({data,error:''});}catch(e){if(n===sequence.current)setState({data:null,error:e.response?.data?.error||'工作台暂时无法读取，请重试'});}},[category,page]);
 // Request sequence fences responses; this ref is not a DOM node.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{const stop=visiblePolling({run:read});return()=>{sequence.current++;stop();};},[read]);
 const selected=state.data?.category||category||'reports',choose=key=>{const next=new URLSearchParams(params);next.set('category',key);next.set('page','1');setParams(next);};
 const returnTo=location.pathname+location.search,linkState={returnTo};
 const categories=registry.categories.map(c=>({...c,label:c.key==='publications'&&!admin?'发布进度':labels[c.key]}));
 const activeCategories=categories.filter(c=>!['courses','schools'].includes(c.key)&&((state.data?.counts[c.key]||0)>0||c.key===selected)).slice(0,3);
 const actions=admin?[['book','新建课程','/courses/create'],['guide','申请会话','/admin/organization?section=requests'],['school','学校授权','/admin/organization?section=school-grants'],['report','报告评审','/mentor/reviews'],['gift','奖励管理','/reward-management']]:[['book','新建课程','/courses/create'],['guide','我的申请','/mentor/requests'],['school','学校与账号','/mentor/organization?section=accounts'],['report','报告评审','/mentor/reviews'],['book','导入课程包','/courses/import']];
 return <section className="staff-desk" data-testid="staff-desk"><header className="desk-heading"><div><p>{admin?'管理员':'执行导师'} · 校园工作空间</p><h1>我的工作台</h1><span>欢迎回来，{user.real_name||user.username}</span></div><div className="desk-overview"><button onClick={()=>choose('courses')}><StaffPixelIcon name="book"/>所管课程 <strong>{state.data?.counts.courses??'—'}</strong></button><button onClick={()=>choose('schools')}><StaffPixelIcon name="school"/>{admin?'学校':'获准学校'} <strong>{state.data?.counts.schools??'—'}</strong></button></div><BeijingClock/></header>
 <div className="desk-surface"><div className="desk-layout"><section className="desk-clipboard" aria-label="夹板待办"><div className="desk-clip" aria-hidden="true"/><header><div><small>TO DO</small><h2>{['courses','schools'].includes(selected)?labels[selected]:'先办这些事'}</h2></div><span className="desk-count">{state.data?.pendingCount??'—'} 项待办</span><Button aria-label="刷新工作台" onClick={read} icon={<StaffPixelIcon name="refresh"/>}>刷新</Button></header>
 <div className="desk-queue-tabs">{activeCategories.map(c=><button key={c.key} aria-pressed={selected===c.key} onClick={()=>choose(c.key)}><StaffPixelIcon name={c.icon}/>{c.label}<span>{state.data?.counts[c.key]??'—'}</span></button>)}<Select aria-label="全部工作台事项" value={selected} onChange={choose} options={categories.map(c=>({value:c.key,label:c.label+'（'+(state.data?.counts[c.key]??'—')+'）'}))}/></div>
 <div className="desk-paper">{state.error?<Alert type="error" title={state.error} action={<Button onClick={read}>重新读取</Button>}/>:!state.data?<Spin aria-label="正在读取工作台"/>:state.data.items.length?<ol className="desk-todos">{state.data.items.map(row=><li key={String(row.id)}><span className="desk-checkbox" aria-hidden="true"/><div><strong>{row.title}</strong><small>{({draft:'草稿',published:'已发布',archived:'已归档'})[row.context]||row.context}</small></div><Link className="desk-go" to={row.url} state={linkState}>{selected==='publications'&&!admin?'查看进度':'去办理'}<span aria-hidden="true"> →</span></Link></li>)}</ol>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这类事项已处理完，可以查看课程或其他待办"/>}</div>
 <footer className="desk-paper-footer"><span>{state.data?'共 '+state.data.total+' 项 · 按当前权限核验':'正在核验权限'}{selected==='publications'&&!admin?' · 由管理员审批':''}</span><Pagination size="small" current={page} pageSize={5} total={state.data?.total||0} showSizeChanger={false} onChange={value=>{const next=new URLSearchParams(params);next.set('category',selected);next.set('page',String(value));setParams(next);}}/></footer></section>
 <section className="desk-folders" aria-label="课程文件夹"><header><h2><StaffPixelIcon name="book"/>课程文件夹</h2><Link to="/courses" state={linkState}>全部课程 →</Link></header><div className="desk-folder-grid">{state.data?.folders.length?state.data.folders.map(course=><Link to={'/courses/'+course.id} state={linkState} key={course.id} className="desk-folder"><span className="desk-folder-tab" aria-hidden="true"/><StaffPixelIcon name="book" size={34}/><strong>{course.title}</strong><small>{({draft:'草稿',published:'已发布',archived:'已归档'})[course.context]||course.context}</small></Link>):<div className="desk-folder-empty"><StaffPixelIcon name="book" size={48}/><p>{state.data?'当前没有可维护的课程':'正在读取课程'}</p><Link to="/courses/create">建立课程草稿</Link></div>}</div><p className="desk-note">课程、学校和已有学生账号分别授权。<Link to="/mentor/guide">查看办事指南</Link></p></section></div>
 <nav className="desk-tools" aria-label="常用操作"><span>常用操作</span>{actions.map(([icon,label,url])=><Link key={url} to={url} state={linkState}><StaffPixelIcon name={icon}/>{label}</Link>)}<Link to="/mentor/guide" state={linkState}><StaffPixelIcon name="guide"/>使用指南</Link></nav></div></section>;
}
