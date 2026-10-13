import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {Alert,Button,Card,Select,Space,Table,Tag,Typography} from 'antd';
import {mentorReviewAPI,learningManageAPI} from '../../api';
import {useAuth} from '../../store/AuthContext';
import {copyText,copyText as siteText} from '../../content/copy';
import {REPORT_STATUS} from '../../constants/status';
import {reviewQuery,changeReviewQuery,reviewScrollKey,readReviewScroll,saveReviewScroll} from '../../utils/reviewQueueState';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

const storage=()=>{try{return sessionStorage;}catch{return null;}};
export default function ReviewList(){
  const navigate=useNavigate(),location=useLocation(),[params,setParams]=useSearchParams(),{user}=useAuth();
  const {status,courseId,lessonId,page}=reviewQuery(params),scrollKey=reviewScrollKey(user.id,params);
  const [data,setData]=useState({items:[],pagination:{}}),[lessons,setLessons]=useState([]),[metadataError,setMetadataError]=useState(''),[metadataRetry,setMetadataRetry]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const sequence=useRef(0),metadataSequence=useRef(0),busy=loading||data.scope!==scrollKey;
  useEffect(()=>{
    const counter=metadataSequence,ticket=++counter.current;
    learningManageAPI.lessons().then(result=>{if(ticket===counter.current){setLessons(result.lessons||[]);setMetadataError('');}}).catch(err=>{if(ticket===counter.current){setLessons([]);setMetadataError(err.response?.data?.error||copyText('next2.review.readFailed'));}});
    return()=>{counter.current++;};
  },[metadataRetry]);
  const load=useCallback(async()=>{
    const ticket=++sequence.current;setLoading(true);setError('');setData({items:[],pagination:{},scope:scrollKey});
    try{const result=await mentorReviewAPI.list({status,course_id:courseId,lesson_id:lessonId,page,page_size:20});if(ticket===sequence.current)setData({...result,scope:scrollKey});}
    catch(err){if(ticket===sequence.current)setError(err.response?.data?.error||siteText('site.823b841d158db7c5'));}
    finally{if(ticket===sequence.current)setLoading(false);}
  },[status,courseId,lessonId,page,scrollKey]);
  useEffect(()=>{
    const counter=sequence,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};
  },[load,user.id]);
  useEffect(()=>{
    if(busy||error)return;
    let live=true,frame;const top=readReviewScroll(storage(),scrollKey);
    const restore=()=>{if(live)frame=requestAnimationFrame(()=>{if(live)window.scrollTo({top,left:0,behavior:'instant'});});};
    if(document.fonts?.ready)void document.fonts.ready.then(restore);else restore();
    return()=>{live=false;cancelAnimationFrame(frame);};
  },[busy,error,scrollKey]);
  const change=(field,value)=>setParams(changeReviewQuery(params,field,value));
  const courses=[...new Map(lessons.map(l=>[String(l.course_id),{value:String(l.course_id),label:l.course_title}])).values()];
  const view=report=>{saveReviewScroll(storage(),scrollKey,scrollY);navigate(`/mentor/reviews/${report.id}`,{state:{returnTo:location.pathname+location.search}});};
  const columns=[
    {title:siteText('site.76d5bc76bedfc8af'),dataIndex:'student_name'},
    {title:siteText('site.a7b5d2834a891486'),render:(_,r)=><Space direction="vertical" size={0}><Typography.Text strong>{r.course_title}</Typography.Text><Typography.Text type="secondary">{r.lesson_title}</Typography.Text></Space>},
    {title:siteText('site.79b2db95b738065f'),render:(_,r)=>`${r.cards_completed}/${r.cards_total} 张卡片已完成`},
    {title:siteText('site.1fbbf64ec5c7d9b0'),dataIndex:'version',render:v=>`第 ${v} 版`},
    {title:siteText('site.9ed8b77e289cff2a'),dataIndex:'status',render:v=><Tag color={REPORT_STATUS[v]?.color}>{REPORT_STATUS[v]?.label||v}</Tag>},
    {title:siteText('site.9763d518225abbde'),dataIndex:'score',render:v=>Number.isInteger(v)?`${v} 分`:'-'},
    {title:siteText('site.47725e0e335b6956'),render:(_,r)=><Button type="link" onClick={()=>view(r)}>{siteText('site.ee76662279c7d2cf')}</Button>},
  ];
  return <PageContainer title={siteText('site.a9053c1b6a360c02')} description={copyText('next2.review.description')}>
    <Space wrap style={{marginBottom:16}}>
      <Select aria-label={copyText('next2.review.status')} value={status} onChange={v=>change('status',v)} options={Object.entries(REPORT_STATUS).filter(([k])=>['submitted','approved','rejected'].includes(k)).map(([value,r])=>({value,label:r.label}))}/>
      <Select aria-label={copyText('next2.review.course')} allowClear placeholder={copyText('next2.review.all')} value={courseId} onChange={v=>change('course_id',v)} options={courses} style={{minWidth:200}}/>
      <Select aria-label={copyText('next2.review.lesson')} allowClear placeholder={copyText('next2.review.choose')} value={lessonId} onChange={v=>change('lesson_id',v)} disabled={!courseId} options={lessons.filter(l=>String(l.course_id)===courseId).map(l=>({value:String(l.id),label:l.title}))} style={{minWidth:200}}/>
    </Space>
    {metadataError&&<Alert type="warning" title={metadataError} action={<Button onClick={()=>setMetadataRetry(n=>n+1)}>{copyText('next2.review.retry')}</Button>}/>}
    <Card className="content-card"><AsyncPageState loading={busy} error={error} onRetry={load} empty={!data.items.length} emptyText={siteText('site.1776afd9fd17dd46')}><Table rowKey="id" columns={columns} dataSource={data.items} scroll={{x:850}} pagination={{current:page,total:data.pagination.total,pageSize:20,onChange:p=>change('page',p)}}/></AsyncPageState></Card>
  </PageContainer>;
}
