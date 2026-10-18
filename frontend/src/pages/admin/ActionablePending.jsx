import {useCallback,useEffect,useState} from 'react';
import {Alert,Button,Card,Empty,List,Space} from 'antd';
import {Link} from 'react-router-dom';
import client from '../../api/client';
const labels={applications:'待审学校申请',reports:'待评报告',gifts:'待发礼品',feedback:'待处理反馈',preparing:'课时准备提醒'};
export default function ActionablePending(){
 const [state,setState]=useState({data:null,error:''});
 const read=useCallback(()=>client.get('/dashboard/admin-pending',{silent:true}).then(data=>setState({data,error:''})).catch(e=>setState({data:null,error:e.response?.data?.error||'待办读取失败'})),[]);
 useEffect(()=>{let live=true;client.get('/dashboard/admin-pending',{silent:true}).then(data=>{if(live)setState({data,error:''});}).catch(e=>{if(live)setState({data:null,error:e.response?.data?.error||'待办读取失败'});});return()=>{live=false;};},[]);
 return <Card title="接下来处理" style={{marginBottom:16}}><Space wrap><Link to="/courses">进入课程管理</Link><Link to="/admin/teaching">进入教学与成长</Link><Link to="/admin/organization">进入账号与组织</Link><Link to="/admin/settings">进入平台设置</Link></Space>{state.error&&<Alert type="error" title={state.error} action={<Button onClick={read}>重新读取待办</Button>}/>}<div className="maintenance-list">{Object.entries(labels).map(([key,title])=><Card key={key} title={title} size="small" loading={!state.data&&!state.error}>{state.data&&<List dataSource={state.data[key]} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办"/>}} renderItem={row=><List.Item><Link to={row.url}>{row.title} · {row.context}</Link></List.Item>}/>}</Card>)}</div></Card>;
}
