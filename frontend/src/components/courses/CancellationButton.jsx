import {useRef,useState} from 'react';
import {Alert,Button,Input,Modal} from 'antd';
export default function CancellationButton({label='取消',onCancel,refresh,disabled=false}) {
  const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),lock=useRef(false);
  const save=async()=>{if(lock.current)return;if(!reason.trim())return setError('请填写取消原因');lock.current=true;setBusy(true);setError('');try{if(!saved){await onCancel(reason.trim());setSaved(true);}await refresh();setOpen(false);}catch(e){setError(e.response?.data?.error||'操作结果请重新读取确认；不要重复取消。');}finally{lock.current=false;setBusy(false);}};
  return <><Button size="small" danger disabled={disabled} onClick={()=>{setReason('');setError('');setSaved(false);setOpen(true);}}>{label}</Button><Modal open={open} title={label} onCancel={()=>!lock.current&&setOpen(false)} onOk={save} okText={saved?"重新读取":"确定取消"} confirmLoading={busy} closable={!busy} maskClosable={!busy} okButtonProps={{disabled:!reason.trim()}}><p>取消后停止新增学习/提交，仅保留历史。有待评或待修改的报告或独立成果时不能取消。</p><Input.TextArea aria-label="取消原因" maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/>{error&&<Alert type="error" title={error}/>}</Modal></>;
}
