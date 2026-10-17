import {useEffect,useRef,useState} from 'react';
import {Navigate,useSearchParams} from 'react-router-dom';
import {Alert} from 'antd';
import client from '../../api/client';
import Management from './Management';
import useTeachingLeaveGuard from '../courses/useTeachingLeaveGuard';
export default function LegacyRewards(){
 const [search]=useSearchParams(),order=search.get('order'),[target,setTarget]=useState(null),[error,setError]=useState(''),dirty=useRef(new Set()),busy=useRef(new Set());
 useTeachingLeaveGuard(dirty,'礼品修改尚未保存，确定离开？',busy);
 useEffect(()=>{if(!order)return;let active=true;client.get('/reward-shop/management/orders/'+encodeURIComponent(order),{silent:true}).then(r=>{if(active&&r.items[0]?.course_id)setTarget({order,courseId:r.items[0].course_id});}).catch(e=>{if(active)setError(e.response?.data?.error||e.message);});return()=>{active=false;};},[order]);
 if(target?.order===order)return <Navigate replace to={`/courses/${target.courseId}?tab=rewards&order=${encodeURIComponent(order)}`}/>;
 return <>{error&&<Alert type="warning" title={error}/>}<Management onDirty={v=>v?dirty.current.add('reward'):dirty.current.delete('reward')} onBusy={v=>v?busy.current.add('reward'):busy.current.delete('reward')}/></>;
}
