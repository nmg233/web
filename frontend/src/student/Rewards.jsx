import ConfigCopyText from '../content/ConfigText';
import StudentCopyText from '../content/ManagedText';
import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import { useEffect, useRef, useState } from 'react';
import { Empty, Modal, Pagination, Spin, Tabs } from 'antd';
import { Link } from 'react-router-dom';
import PageContainer from '../components/common/PageContainer';
import { formatBeijingTime } from '../utils/date';
import { useRewards } from './useRewards';
import { PixelButton, PixelImage, PixelPanel, PixelTag } from './visual/PixelUI';
import PixelIcon from './visual/PixelIcon';
import { StudyHeader } from './visual/StudyUI';
import './visual/pixel-rewards.css';
import {BadgeArt} from './ServerRewards';
import {useServerRewards} from './useServerRewards';
import {copyText} from '../content/copy';


// Explicitly cycle at the edges: browser chrome is outside the library's focusin trap.
function trapDialogFocus(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('reward-dialog-body'))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function RewardArt({ id, badge = false }) {
  if(id.startsWith('digital-'))return <BadgeArt art={id.slice(8)} size={128}/>;
  return <PixelImage className="reward-art" src={`/assets/pixel-v1/rewards/${badge ? 'badge' : 'gift'}-${id}.svg`} width={128} height={128} alt="" />;
}
function GiftConditions({ gift, available }) {
  return <><dl className="reward-conditions"><div><dt>{<StudentCopyText id={"site.841ba068c92fc85b"}/>}</dt><dd>{gift.remaining}{<StudentCopyText id={"site.a5c6fb6ac49e2514"}/>}</dd></div><div><dt>{<StudentCopyText id={"site.ff583ead60677c5d"}/>}</dt><dd>{gift.limit}{<StudentCopyText id={"site.0b14f9066fde862d"}/>}</dd></div></dl>
    <Sentence className={`reward-condition ${available && !gift.blockedReason ? 'reward-condition--ready' : ''}`}>{available ? gift.blockedReason || <StudentCopyText id={"site.520c4049e4fd7a17"}/> : <StudentCopyText id={"site.ba6d8e4756b6da21"}/>}</Sentence></>;
}
function RecordList({ data, ledger = false, highlight }) {
  const [page, setPage] = useState(1);
  const current = Math.min(page, Math.max(1, Math.ceil(data.length / 8)));
  return <PixelPanel className="reward-history"><header><h3>{ledger ? <StudentCopyText id={"site.205c57192ad12ece"}/> : <StudentCopyText id={"site.d7c0d6dd4a7b9efe"}/>}</h3><Sentence>{ledger ? <StudentCopyText id={"site.324954a9f6494314"}/> : <StudentCopyText id={"site.ecf0894090fe917a"}/>}</Sentence></header>
    {!data.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={siteText("site.0ec75da0620bb63d")}  data-copy-bindings={JSON.stringify(["site.0ec75da0620bb63d"])}/> : <ol className="reward-record-list">{data.slice((current - 1) * 8, current * 8).map((item) => <li key={item.id} className={highlight === item.id ? 'reward-record--highlight' : ''}>
      <span className={`reward-record-mark ${ledger && item.amount > 0 ? 'reward-record-mark--initial' : ''}`} aria-hidden="true"><PixelIcon name={ledger && item.amount > 0 ? 'coin' : 'archive'} /></span>
      <div className="reward-record-text"><strong>{item.title.replaceAll('积分','金币')}</strong><Sentence>{item.time ? <time dateTime={item.time}>{formatBeijingTime(item.time)}{<StudentCopyText id={"site.7e311bd7435e516d"}/>}</time> : <StudentCopyText id={"site.1402bfbe69462fd0"}/>}</Sentence>{!ledger && <PixelTag tone="neutral">{item.status || <StudentCopyText id={"site.74936e0fa9af9525"}/>}</PixelTag>}{highlight === item.id && <span className="reward-current-record">{<StudentCopyText id={"site.aa65574675bf1a1d"}/>}</span>}</div>
      <div className={`reward-amount ${ledger && item.amount > 0 ? 'reward-amount--positive' : ''}`}><strong>{ledger ? `${item.amount > 0 ? '+' : ''}${item.amount}` : `−${item.cost}`}</strong><span>{<StudentCopyText id={"site.7eb583fcfa9a8757"}/>}</span></div>
    </li>)}</ol>}
    {data.length > 8 && <Pagination current={current} pageSize={8} total={data.length} onChange={setPage} showSizeChanger={false} />}
  </PixelPanel>;
}

// Archived demo implementation: data and rules remain separate and unconverted.
import RealRewardShop from './RealRewardShop';
export default function Rewards(props){return <RealRewardShop {...props}/>;}
export function DemoRewards({giftType="physical"}) {
  const { data, status, error, refreshing, syncWarning, store } = useRewards();
  const remote=useServerRewards();
  const [activeTab, setActiveTab] = useState('gifts');
  const [dialog, setDialog] = useState(null);
  const [operationError, setOperationError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [highlight, setHighlight] = useState(null);
  const inFlight = useRef(false), lifecycle = useRef(null), trigger = useRef(null), dialogBody = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    store.refresh();
    return () => controller.abort();
  }, [store]);
  useEffect(() => {
    if (dialog?.kind) dialogBody.current?.focus();
  }, [dialog?.kind]);
  const ready = status === 'ready' && !refreshing;
  const gift = data?.gifts.find((item) => item.id === dialog?.giftId);
  const badge = data?.badges.find((item) => item.id === dialog?.badgeId);
  const resultExists = status === 'ready' && data.records.some((item) => item.id === dialog?.record?.id);
  const open = (next, event) => { trigger.current = event.currentTarget; setOperationError(null); setDialog(next); };
  const close = () => { if (!inFlight.current) { setDialog(null); setOperationError(null); } };
  const confirm = () => { setOperationError(null); setDialog({ ...dialog, kind: 'confirm', requestId: crypto.randomUUID() }); };
  const execute = async () => {
    if (inFlight.current) return;
    const signal = lifecycle.current.signal;
    inFlight.current = true; setBusy(true); setOperationError(null); setNotice('');
    try {
      if (dialog.kind === 'reset') {
        await store.reset({ signal });
        if (signal.aborted) return;
        setDialog(null); setHighlight(null); setNotice(siteText("site.7d8868697095dfc8"));
      } else {
        const record = await store.redeem(dialog.giftId, dialog.requestId, { signal });
        if (signal.aborted) return;
        let synced=false;try{synced=await remote.syncIntent(record);}catch{/* Committed debit stays pending with its original operation ID. */}
        if(signal.aborted)return;setDialog({ kind: 'success', record, synced });
      }
    } catch (err) { if (!signal.aborted) setOperationError(err); }
    finally { if (!signal.aborted) { inFlight.current = false; setBusy(false); } }
  };
  const title = dialog?.kind === 'reset' ? siteText("site.caf99e732758faee") : dialog?.kind === 'confirm' ? siteText("site.febb523314f74c5d")
    : dialog?.kind === 'success' ? (status === 'ready' && !resultExists ? siteText("site.de85d36f2df3a50d") : (dialog?.synced?siteText("site.53081cf6cd35f1aa"):siteText("site.61eca7e2d1f54169"))) : badge?.title || gift?.title || siteText("site.eb6f0b1963c1a4f5");
  const showRecord = () => { setActiveTab('records'); setHighlight(dialog.record.id); close(); trigger.current = null; requestAnimationFrame(() => document.querySelector('#reward-tabs-tab-records')?.focus()); };
  let footer;
  if (dialog?.kind === 'gift') footer = <><PixelButton onClick={close}>{<StudentCopyText id={"site.0f2b58a41962851a"}/>}</PixelButton><PixelButton type="primary" disabled={!ready || !!gift?.blockedReason} onClick={confirm}>{<StudentCopyText id={"site.de7053f8fbd0ec52"}/>}</PixelButton></>;
  else if (dialog?.kind === 'confirm') footer = <><PixelButton disabled={busy} onClick={() => { setOperationError(null); setDialog({ ...dialog, kind: 'gift' }); }}>{<StudentCopyText id={"site.1bb8c1c51bb75bde"}/>}</PixelButton><PixelButton type="primary" loading={busy} disabled={!ready || !!gift?.blockedReason} onClick={execute}>{operationError ? <StudentCopyText id={"site.c09d07e65a9cac3d"}/> : <StudentCopyText id={"site.afad93e006fb7455"}/>}</PixelButton></>;
  else if (dialog?.kind === 'reset') footer = <><PixelButton disabled={busy} onClick={close}>{<StudentCopyText id={"site.f00e14c75d989dc2"}/>}</PixelButton><PixelButton danger loading={busy} onClick={execute}>{operationError ? <StudentCopyText id={"site.81ededf1058dcfb7"}/> : <StudentCopyText id={"site.091610e4c25e57fd"}/>}</PixelButton></>;
  else if (dialog?.kind === 'success') footer = <><PixelButton onClick={() => { setActiveTab('gifts'); close(); }}>{<StudentCopyText id={"site.6c90189c18c7619e"}/>}</PixelButton><PixelButton type="primary" onClick={showRecord}>{<StudentCopyText id={"site.8c2c5bdcd509fc13"}/>}</PixelButton></>;
  else footer = <PixelButton onClick={close}>{<StudentCopyText id={"site.0f2b58a41962851a"}/>}</PixelButton>;

  return <PageContainer><div className="study-workspace reward-workspace">
    <StudyHeader eyebrow={<Link to="/me">{<StudentCopyText id={"site.57b0f5d196a3b9bc"}/>}</Link>} title={copyText("coins.demoTitle")} description={siteText("site.83be7c387ada5129")} data-copy-bindings={JSON.stringify(["coins.demoTitle","site.83be7c387ada5129"])}>
      <PixelButton onClick={(event) => open({ kind: 'reset' }, event)}>{<StudentCopyText id={"site.db412e8008c55e6c"}/>}</PixelButton>
    </StudyHeader>
    <PixelPanel className="reward-overview" aria-label={siteText("site.5584e603b0e405d1")} data-copy-bindings={JSON.stringify(["site.5584e603b0e405d1"])}>
      <div className="reward-balance"><PixelIcon name="coin" size={36} /><div><span>{<StudentCopyText id={"coins.demoBalance"}/>}</span><strong data-testid="reward-balance">{status === 'ready' ? data.balance : status === 'loading' ? <StudentCopyText id={"site.bec12ad4a9d7500a"}/> : <StudentCopyText id={"site.b76344885b619338"}/>}</strong></div></div>
      <div className="reward-scope"><PixelTag tone="neutral">{<StudentCopyText id={"site.2218288512167cb0"}/>}</PixelTag><Sentence>{<StudentCopyText id={"site.2911debb934ff232"}/>}<br />{<StudentCopyText id={"site.821f60a1c3cb1ede"}/>}</Sentence></div>
    </PixelPanel>
    <Sentence>{<StudentCopyText id={'next3.exchange.scope'}/>}</Sentence>
    {(data?.outbox||[]).some(e=>e.sync==='pending')&&<Alert type="warning" title={copyText('next3.exchange.pending')} description={remote.syncError} action={<PixelButton onClick={remote.flush}>{<StudentCopyText id={'next3.exchange.retry'}/>}</PixelButton>} data-copy-bindings={JSON.stringify(['next3.exchange.pending'])}/>}
    {syncWarning && <Alert className="reward-notice" type="warning" showIcon title={siteText("site.362e7425cdea294b")} description={syncWarning}  data-copy-bindings={JSON.stringify(["site.362e7425cdea294b"])}/>}
    {notice && <Alert className="reward-notice" type="success" showIcon title={notice} closable />}
    {error && <Alert className="reward-notice" type="error" showIcon title={siteText("site.5f764adb0148a5d0")} description={<>{error.message}{data && <Sentence>{<StudentCopyText id={"site.3d1108d389142ed5"}/>}</Sentence>}</>} action={<PixelButton onClick={store.refresh} loading={refreshing}>{<StudentCopyText id={"site.948b6e35f184be51"}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(["site.5f764adb0148a5d0"])}/>}
    {status === 'loading' && <div className="reward-loading"><Spin /><Sentence>{<StudentCopyText id={"site.1bd651643c5dad13"}/>}</Sentence></div>}
    {data && <Tabs id="reward-tabs" className="reward-tabs" activeKey={activeTab} onChange={setActiveTab} items={[
      { key: 'gifts', label: siteText("site.7a133d3b87070136"), children: <><div className="reward-section-intro"><h3>{<StudentCopyText id={"site.d38e4d6e17b831f0"}/>}</h3><span>{<StudentCopyText id={"site.9409c5e28a36194a"}/>}</span></div><div className="reward-gift-grid">{data.gifts.map((item, index) => <PixelPanel as="article" key={item.id} className="reward-gift" data-gift={item.id}>
        <div className="reward-gift-art"><span className="reward-item-number" aria-hidden="true">0{index + 1}</span><RewardArt id={item.id} /><span className="reward-art-caption">{<StudentCopyText id={"site.3910ace4117760f8"}/>}</span></div>
        <div className="reward-gift-content"><h3><ConfigCopyText object={item} field="title" value={item.title}/></h3><PixelTag>{item.type==='badge'?<StudentCopyText id={"site.95d9f1b6d67966fa"}/>:<StudentCopyText id={"site.2e2c1ae39c52cf4d"}/>}</PixelTag><Sentence className="reward-cost"><PixelIcon name="coin" size={20} /><strong>{item.cost}</strong><span>{<StudentCopyText id={"site.7eb583fcfa9a8757"}/>}</span></Sentence><GiftConditions gift={item} available={ready} /><PixelButton block onClick={(event) => open({ kind: 'gift', giftId: item.id }, event)}>{<StudentCopyText id={"site.14fd75716f2da33a"}/>}</PixelButton></div>
      </PixelPanel>)}</div><Sentence className="reward-footnote">{<StudentCopyText id={"site.ad7b35ec5dcfa5e4"}/>}</Sentence></> ,__copyIds:{"label":"site.7a133d3b87070136"}},
      ...giftType==='badge'?[]:[{ key: 'ledger', label: siteText("site.dd0fbc824c15bced"), children: <RecordList data={data.ledger} ledger /> ,__copyIds:{"label":"site.dd0fbc824c15bced"}}],
      { key: 'records', label: siteText("site.88619bcd84f3c4c7"), children: <><RecordList data={data.records} highlight={highlight}/><PixelPanel className="reward-history"><h3>{<StudentCopyText id={'next3.exchange.serverTitle'}/>}</h3><Sentence>{<StudentCopyText id={'next3.exchange.serverScope'}/>}</Sentence>{remote.error?<Alert type="warning" title={remote.error} action={<PixelButton onClick={remote.read}>{<StudentCopyText id={'next3.retry'}/>}</PixelButton>}/>:<ul className="reward-record-list">{(remote.data?.exchanges||[]).map(e=><li key={e.id}><div><strong>{e.gift_name}</strong><Sentence>{e.gift_type==='badge'?<StudentCopyText id={'next3.exchange.digitalType'}/>:<StudentCopyText id={'next3.exchange.physicalType'}/>} · {formatBeijingTime(e.created_at)}{<StudentCopyText id={"site.be9215a1a8f6daab"}/>}</Sentence></div><PixelTag>{<StudentCopyText id={'next3.exchange.serverSaved'}/>}</PixelTag></li>)}</ul>}</PixelPanel></> ,__copyIds:{"label":"site.88619bcd84f3c4c7"}},
    ]}  data-copy-bindings={JSON.stringify(["site.7a133d3b87070136","site.dd0fbc824c15bced","site.88619bcd84f3c4c7"])}/>}
    <Modal open={!!dialog} title={title} rootClassName="student-pixel student-interactions reward-modal-root" className="reward-modal" width={560} centered
      closable={busy ? false : { 'aria-label': siteText("site.be5f4bc48ff6dc52") }} keyboard={!busy} mask={{ closable: !busy }} onCancel={close} footer={footer} focusable={{ trap: true, focusTriggerAfterClose: false }} modalRender={(node) => <div onKeyDownCapture={trapDialogFocus}>{node}</div>}
      afterClose={() => { if (trigger.current?.isConnected) trigger.current.focus(); }}
      afterOpenChange={(isOpen) => { if (isOpen) dialogBody.current?.focus(); }} data-copy-bindings={JSON.stringify(["site.be5f4bc48ff6dc52"])}>
      <div ref={dialogBody} tabIndex={-1} className="reward-dialog-body">
        <span className="reward-dialog-demo">{<StudentCopyText id={"site.98b40fc9622f6437"}/>}</span>
        {(dialog?.kind === 'gift' || dialog?.kind === 'confirm') && gift && <>
          <div className="reward-detail-heading"><RewardArt id={gift.id} /><div><h3><ConfigCopyText object={gift} field="title" value={gift.title}/></h3><Sentence className="reward-cost"><strong>{gift.cost}</strong>{<StudentCopyText id={"site.7eb583fcfa9a8757"}/>}</Sentence></div></div>
          <Sentence>{gift.description.replaceAll('积分','金币')}</Sentence><GiftConditions gift={gift} available={ready} />
          {gift.type==='physical'&&<Alert type="info" title={copyText('next3.exchange.demo')} data-copy-bindings={JSON.stringify(['next3.exchange.demo'])}/>}
          {dialog.kind === 'confirm' && <Sentence className="reward-confirm-note">{<StudentCopyText id={"site.cb5d6d789020a75d"}/>}<strong>{gift.cost}{<StudentCopyText id={"site.7eb583fcfa9a8757"}/>}</strong>{<StudentCopyText id={"site.d2d54de38549c7a5"}/>}</Sentence>}
          {!ready && <Alert type="warning" title={error?.message || siteText("site.63e803b195c3f36a")} action={error && <PixelButton onClick={store.refresh} loading={refreshing}>{<StudentCopyText id={"site.627edd67859cc342"}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(["site.63e803b195c3f36a"])}/>}
        </>}
        {dialog?.kind === 'badge' && badge && <><div className="reward-badge-detail"><RewardArt id={badge.id} badge /><PixelTag tone={badge.earned ? 'success' : 'neutral'}>{badge.earned ? <StudentCopyText id={"site.b6c1e24fdc27541c"}/> : <StudentCopyText id={"site.929aedc6a9663c91"}/>}</PixelTag></div><Sentence><ConfigCopyText sentence object={badge} field="description" value={badge.description}/></Sentence><Sentence className="reward-confirm-note">{badge.condition}</Sentence></>}
        {dialog?.kind === 'reset' && <><Sentence>{<StudentCopyText id={"site.6b95334338f51055"}/>}<strong>{<StudentCopyText id={"site.2eebb71f8b5b67c9"}/>}</strong>{<StudentCopyText id={"site.5979e49279e3c565"}/>}</Sentence><Sentence>{<StudentCopyText id={"site.dea81cd52c2fa8a6"}/>}</Sentence><Sentence className="reward-confirm-note">{<StudentCopyText id={"site.15a2e32ca3b9f9fa"}/>}</Sentence></>}
        {dialog?.kind === 'success' && <><div className="reward-success-mark" aria-hidden="true"><PixelIcon name="check" size={40} /></div><h3 className="reward-success-title"><ConfigCopyText object={dialog.record} field="title" value={dialog.record.title}/></h3><Sentence className="reward-success-copy">{<StudentCopyText id={!dialog.synced?'next3.exchange.pending':dialog.record.type==='badge'?'next3.exchange.digital':'next3.exchange.physical'}/>}</Sentence><Alert type="info" title={copyText('next3.exchange.demo')} data-copy-bindings={JSON.stringify(['next3.exchange.demo'])}/><dl className="reward-conditions"><div><dt>{<StudentCopyText id={"site.8bc374fe451faf94"}/>}</dt><dd>{dialog.record.cost}{<StudentCopyText id={"site.7eb583fcfa9a8757"}/>}</dd></div><div><dt>{<StudentCopyText id={"site.3d4283977070be3f"}/>}</dt><dd>{formatBeijingTime(dialog.record.time)}</dd></div></dl>
          {status === 'ready' && !resultExists && <Alert type="info" title={siteText("site.278d3685d1b7d1fb")}  data-copy-bindings={JSON.stringify(["site.278d3685d1b7d1fb"])}/>}
          {error && <Alert type="warning" title={siteText("site.ffd0ce0c42dba4c9")}  data-copy-bindings={JSON.stringify(["site.ffd0ce0c42dba4c9"])}/>}
          {dialog.synced&&remote.error&&<Alert type="warning" title={copyText('next3.exchange.profileReadFailed')} action={<PixelButton onClick={remote.read}>{<StudentCopyText id={'next3.retry'}/>}</PixelButton>} data-copy-bindings={JSON.stringify(['next3.exchange.profileReadFailed'])}/>}
        </>}
        {operationError && <Alert className="reward-operation-error" type="error" showIcon title={dialog?.kind === 'reset' ? siteText("site.127bf33ad63462d4") : siteText("site.752d4a0f75f6c79c")} description={operationError.message}  data-copy-bindings={JSON.stringify(["site.127bf33ad63462d4","site.752d4a0f75f6c79c"])}/>}
      </div>
    </Modal>
  </div></PageContainer>;
}
