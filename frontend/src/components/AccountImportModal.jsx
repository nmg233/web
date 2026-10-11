import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Pagination, Progress, Select, Space, Table, Typography, Upload, message } from 'antd';
import { studentAPI } from '../api';
import { downloadAccounts, downloadTemporaryAccounts, downloadImportFailures } from '../utils/accountExport';

const labels = { pending: '排队中', running: '处理中', completed: '已完成', failed: '已中断' };
function downloadTemplate() {
  const csv = '\uFEFF登录账号,姓名,身份,学校名称,年级,班级名称,邮箱,手机号,备注\r\n,示例学生,学生,请填写已有学校,四年级,一班,,,\r\n,示例导师,导师,,,,,,\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = '用户导入模板.csv'; a.click(); URL.revokeObjectURL(url);
}
export default function AccountImportModal({ open, onClose, onChanged }) {
  const [history, setHistory] = useState([]), [batchId, setBatchId] = useState(null), [batch, setBatch] = useState(null);
  const [uploading, setUploading] = useState(false), [exporting, setExporting] = useState(false), [pollError, setPollError] = useState('');
  const [retry, setRetry] = useState(0);
  const [historyPage, setHistoryPage] = useState(1), [historyTotal, setHistoryTotal] = useState(0), [newBatch, setNewBatch] = useState(false);
  const request = useRef(null), changed = useRef(null), forceNew = useRef(false), onChangedRef = useRef(onChanged), historyPageRef = useRef(historyPage);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);
  useEffect(() => { historyPageRef.current = historyPage; }, [historyPage]);
  const refreshHistory = () => studentAPI.importBatches(historyPage).then(res => { setHistory(res.batches); setHistoryTotal(res.total); });
  useEffect(() => {
    if (!open) return;
    let active = true;
    studentAPI.importBatches(historyPage).then(res => { if (active) { setHistory(res.batches); setHistoryTotal(res.total); } }).catch(() => {});
    return () => { active = false; };
  }, [open, historyPage]);
  useEffect(() => {
    if (!open || !batchId) return;
    let active = true, timer;
    const poll = async () => {
      try {
        const next = await studentAPI.importBatch(batchId);
        if (!active) return;
        setBatch(next); setPollError('');
        if (['pending','running'].includes(next.status)) timer = setTimeout(poll, 800);
        else if (changed.current !== next.id) {
          changed.current = next.id; onChangedRef.current();
          studentAPI.importBatches(historyPageRef.current).then(res => { if (active) { setHistory(res.batches); setHistoryTotal(res.total); } }).catch(() => {});
        }
      } catch { if (active) setPollError('暂时无法查询批次，后台可能仍在处理。请重试查询或从历史批次恢复。'); }
    };
    poll(); return () => { active = false; clearTimeout(timer); };
  }, [open, batchId, retry]);
  const upload = async file => {
    if (file.size > 10 * 1024 * 1024) return message.error('文件不能超过 10 MB');
    if (!request.current || request.current.file !== file) {
      // getRandomValues 在 HTTP 页面也可用；randomUUID 在非安全上下文可能不存在。
      const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
      request.current = { file, key };
    }
    const data = new FormData(); data.append('file',file); data.append('request_key',request.current.key);
    if (forceNew.current) data.append('confirm_new_batch','true');
    setUploading(true);
    try {
      const next = await studentAPI.startImport(data); setBatchId(next.id); setBatch(next); changed.current = null;
      forceNew.current = false; setNewBatch(false); request.current = null; await refreshHistory();
      message.info(next.status === 'completed' ? '已恢复历史结果，未重复建号' : '批次已受理，可关闭后从历史批次恢复');
    } catch { await refreshHistory().catch(() => {}); }
    finally { setUploading(false); }
  };
  const close = () => {
    const finish = () => { setBatch(null); forceNew.current=false; setNewBatch(false); request.current=null; onClose(); };
    if (batch?.imported && !batch.delivered_at) return Modal.confirm({ title: '尚未确认完成账号交付', content: '关闭不会停止批次，后续可从历史批次恢复。下载不代表文件已保存或用户已收到，请妥善交付账号。', onOk: finish });
    finish();
  };
  const credentials = async () => {
    setExporting(true);
    try {
      const result = await studentAPI.importCredentials(batchId);
      const available = result.accounts.filter(a => a.temp_password);
      if (!available.length) return message.warning('账号已改密、重置、停用或删除，请使用详情中的重置流程');
      downloadTemporaryAccounts(available);
      if (available.length !== result.accounts.length) message.warning('仅导出仍有效的初始凭据；已变更账号请单独处理');
    } catch { /* 请求失败由 API 提示，历史结果仍可再次导出 */ }
    finally { setExporting(false); }
  };
  return <Modal title="批量创建账号与交付" open={open} onCancel={close} footer={null} width={850} closable={!uploading} maskClosable={!uploading} keyboard={!uploading}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert type="warning" showIcon message="初始密码为姓名拼音@123，容易被猜到，请尽快交付并首次改密" description="支持 UTF-8 CSV、XLSX、XLS，最多 1000 行、一个非空工作表。学校和班级须已存在，重名班级须填写年级或班级 ID。导师无需学校，前缀为 BUAA，身份可填导师、执行导师、学术导师或 mentor。" />
      <Typography.Text type="secondary">登录账号留空自动生成；兼容固定账号。相同名单默认恢复历史批次，不重复创建。关闭、刷新或网络异常后可恢复结果；仅创建者管理员可访问。</Typography.Text>
      <Space wrap><Button onClick={downloadTemplate}>下载模板</Button><Upload accept=".csv,.xlsx,.xls" showUploadList={false} disabled={uploading} beforeUpload={file => { upload(file); return false; }}><Button type="primary" loading={uploading}>选择名单创建／恢复</Button></Upload>
        <Button disabled={uploading} onClick={() => Modal.confirm({title:'明确创建新的重复名单批次？',content:'无账号行会再次创建新用户；只有确实需要不同新账号时才使用。确认后重新选择文件。',onOk:()=>{forceNew.current=true;setNewBatch(true);request.current=null;message.info('下一次上传将作为新批次');}})}>相同名单另建新批次</Button></Space>
      {newBatch && <Alert type="warning" message="下一次上传将另建新批次，不恢复相同名单" action={<Button onClick={()=>{forceNew.current=false;setNewBatch(false);request.current=null;}}>取消另建</Button>} />}
      <Select style={{ width: '100%' }} placeholder="选择历史批次恢复" value={batchId} options={history.map(b=>({value:b.id,label:`${b.created_at} UTC · ${labels[b.status]} · 已处理 ${b.progress} 条 · ${b.id.slice(0,8)}`}))} onChange={id=>{setBatchId(id);setBatch(null);changed.current=null;}} />
      <Pagination size="small" current={historyPage} total={historyTotal} pageSize={30} showSizeChanger={false} onChange={setHistoryPage} hideOnSinglePage />
      {pollError && <Alert type="error" message={pollError} action={<Button onClick={()=>setRetry(n=>n+1)}>重试查询</Button>} />}
      {batch && <Card size="small" title={`${labels[batch.status]} · 成功 ${batch.imported} / 失败 ${batch.failed}`}>
        <Progress percent={Math.round(batch.progress / batch.total * 100)} status={batch.status==='failed'?'exception':batch.status==='completed'?(batch.failed?'exception':'success'):'active'} />
        {batch.error && <Alert type="error" message={batch.error} action={<Button onClick={async()=>{try{await studentAPI.resumeImport(batchId);setRetry(n=>n+1);}catch{/* API 已提示 */}}}>恢复未完成批次</Button>} />}
        {batch.status==='completed' && <Alert type={batch.imported===0?'error':batch.failed?'warning':'success'} message={batch.imported===0?'没有账号创建成功，请修正失败名单':batch.message} />}
        <Space wrap style={{margin:'12px 0'}}><Button disabled={!batch.accounts.length} onClick={()=>downloadAccounts(batch.accounts,'本批次账号.csv')}>导出账号</Button><Button disabled={!batch.accounts.length} loading={exporting} onClick={credentials}>导出有效初始密码</Button><Button disabled={!batch.failed} onClick={()=>downloadImportFailures(batch.row_results.filter(r=>r.status==='rejected'))}>下载完整失败名单</Button>
          <Button disabled={!batch.imported || !!batch.delivered_at || batch.status!=='completed'} onClick={()=>Modal.confirm({title:'确认已保存并交付账号？',content:'请确认账号和有效初始密码已妥善保存并交付给对应用户。',onOk:async()=>{await studentAPI.acknowledgeImport(batchId);setRetry(n=>n+1);}})}>{batch.delivered_at?'已确认交付':'我已完成交付'}</Button></Space>
        <Table size="small" rowKey="row" dataSource={batch.row_results.filter(r=>r.status==='rejected')} pagination={{pageSize:10}} columns={[{title:'记录序号',dataIndex:'row',width:90},{title:'姓名',render:(_,r)=>r.input?.real_name},{title:'失败原因',dataIndex:'error'}]} />
      </Card>}
    </Space>
  </Modal>;
}
