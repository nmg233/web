import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Form,Input,Select,Space,Table,Tag} from 'antd';
import client from '../../api/client';
import {useAuth} from '../../store/AuthContext';

export default function CourseManagers({courseId,onDirty,onBusy,initialMentorId,onSaved}){
 const {user}=useAuth(),[data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[form]=Form.useForm();
 const ticket=useRef(0),key=useRef(crypto.randomUUID()),lock=useRef(false),live=useRef(false);
 const active=Form.useWatch('active',form);
 const read=useCallback(async()=>{const n=++ticket.current;try{const r=await client.get(`/courses/${courseId}/managers`,{silent:true});if(live.current&&n===ticket.current){setData(r);setError('');}}catch(e){if(live.current&&n===ticket.current){setError(e.response?.data?.error||e.message);if([403,404].includes(e.response?.status))setData(null);}}},[courseId]);
 // Network generation fences, not DOM refs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{live.current=true;void Promise.resolve().then(read);return()=>{live.current=false;ticket.current++;};},[read]);
 useEffect(()=>{if(initialMentorId)form.setFieldValue('mentorId',initialMentorId);},[initialMentorId,form]);
 const changed=()=>{onDirty?.(true);key.current=crypto.randomUUID();};
 const revoke=row=>{form.setFieldsValue({mentorId:row.mentor_id,active:false,reason:''});changed();};
 const save=async values=>{
  if(lock.current||!data)return;lock.current=true;setBusy(true);onBusy?.(true);setNotice('');
  try{
   const old=data.managers.find(m=>m.mentor_id===values.mentorId);
   await client.post(`/courses/${courseId}/managers`,{...values,expectedRevision:old?.revision||0,request_key:key.current},{silent:true});
   key.current=crypto.randomUUID();onDirty?.(false);
   if(live.current){form.resetFields();setNotice('授权已保存；撤销对旧会话的下一次请求立即生效');await read();await onSaved?.();}
  }catch(e){if(live.current)setError(e.response?.data?.error||e.message);}
  finally{lock.current=false;if(live.current)setBusy(false);onBusy?.(false);}
 };
 const candidates=active===false?data?.managers.map(m=>({id:m.mentor_id,...m})):data?.candidates;
 return <Card title="课程管理授权">
  <Alert type="info" title="创建者、授课安排与管理授权分别记录；更改授课人不会授予管理权限。" description="仅管理员可以授权或撤销。停用账号的历史关系仍可撤销；账号恢复不会恢复已撤销关系。"/>
  {error&&<Alert type="error" title={error} description="输入保留，请读取最新状态后核对再保存"/>}{notice&&<Alert type="success" title={notice}/>}
  <Button onClick={()=>void read()} disabled={busy}>核对最新授权</Button>
  {data&&<><Table rowKey="mentor_id" size="small" scroll={{x:760}} dataSource={data.managers} columns={[
   {title:'管理导师',render:(_,r)=>`${r.real_name}（${r.username}）`},
   {title:'管理关系',render:(_,r)=><Tag color={r.active?'blue':'default'}>{r.active?'已授权':'已撤销'}</Tag>},
   {title:'账号状态',render:(_,r)=><Tag color={r.is_active&&!r.archived_at?'green':'red'}>{r.is_active&&!r.archived_at?'启用':'停用 / 归档'}</Tag>},
   {title:'关系来源',dataIndex:'source'},
   {title:'授权人 / 时间',render:(_,r)=>`${r.grantor_name||'旧关系迁移'} / ${r.granted_at}`},
   {title:'撤销人 / 时间',render:(_,r)=>r.revoked_at?`${r.revoker_name||'管理员'} / ${r.revoked_at}`:'—'},
   ...(user.role==='admin'?[{title:'操作',render:(_,r)=><Button danger disabled={busy||!r.active} onClick={()=>revoke(r)}>撤销该关系</Button>}]:[]),
  ]}/>
  {user.role==='admin'&&<Form form={form} layout="vertical" onFinish={save} onValuesChange={changed}>
   <Form.Item name="active" label="操作" initialValue={true} rules={[{required:true}]}><Select onChange={()=>form.setFieldValue('mentorId',undefined)} options={[{value:true,label:'授予课程管理权限'},{value:false,label:'撤销课程管理权限（含停用账号）'}]}/></Form.Item>
   <Form.Item name="mentorId" label={active===false?'已有管理关系':'有效导师账号'} rules={[{required:true}]}><Select showSearch optionFilterProp="label" aria-label="课程管理导师账号" options={candidates?.map(u=>({value:u.id,label:`${u.real_name}（${u.username}）`}))}/></Form.Item>
   <Form.Item name="reason" label="授权 / 撤销原因" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={1000}/></Form.Item>
   <Space><Button type="primary" htmlType="submit" loading={busy}>保存课程授权</Button></Space>
  </Form>}
  {user.role==='admin'&&<details><summary>授权审计（含旧关系迁移清单）</summary>{data.history.map(h=><p key={h.id}>{h.created_at} · #{h.mentor_id} · {h.action} · {h.reason} · {h.actor_name||'迁移'}</p>)}</details>}</>}
 </Card>;
}
