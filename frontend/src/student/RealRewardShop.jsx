/* eslint-disable react-hooks/set-state-in-effect -- restore account-scoped pending request and fetch server state */
import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Empty,Modal,Pagination,Spin,Tabs} from 'antd';
import {Link,useSearchParams} from 'react-router-dom';
import client from '../api/client';
import {useAuth} from '../store/AuthContext';
import {useRealCoins} from './useRealCoins';
import {useServerRewards} from './useServerRewards';
import {PixelButton,PixelPanel,PixelTag} from './visual/PixelUI';
import {formatBeijingTime} from '../utils/date';
import RewardGift from './RewardGift';
import './visual/real-rewards.css';
const message=e=>e.response?.data?.error||e.message;
export default function RealRewardShop({giftType='physical'}){
 const {user}=useAuth(),coins=useRealCoins(),badges=useServerRewards(),[params]=useSearchParams();
 const [catalog,setCatalog]=useState(null),[orders,setOrders]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState(null),[result,setResult]=useState(null),[pending,setPending]=useState(null),[tab,setTab]=useState(params.get('rewards')==='records'?'records':'gifts'),[page,setPage]=useState(1);
 const alive=useRef(false),lock=useRef(false),sequence=useRef(0),storageKey='real-reward-pending:'+user.id;
 const requestedTab=params.get('rewards');
 useEffect(()=>{setTab(requestedTab==='records'?'records':'gifts');},[requestedTab]);
 const read=useCallback(async()=>{const ticket=++sequence.current;try{const [g,o]=await Promise.all([client.get('/reward-shop/gifts',{silent:true}),client.get('/reward-shop/orders?page='+page,{silent:true})]);if(alive.current&&ticket===sequence.current){setCatalog(g);setOrders(o);setError('');}}catch(e){if(alive.current&&ticket===sequence.current){setCatalog(null);setOrders(null);setError(message(e));}}},[page]);
 useEffect(()=>{alive.current=true;try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&typeof saved.requestKey==='string')setPending(saved);}catch{setError('浏览器恢复信息暂不可读取，请先检查兑换记录。');}void read();const refresh=()=>void read();window.addEventListener('focus',refresh);window.addEventListener('online',refresh);const timer=setInterval(refresh,30000);return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[read,storageKey]);
 const execute=async(payload)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{localStorage.setItem(storageKey,JSON.stringify(payload));setPending(payload);const response=await client.post('/reward-shop/orders',payload,{silent:true});if(!alive.current)return;localStorage.removeItem(storageKey);setPending(null);setDialog(null);setResult(response);await Promise.all([read(),coins.refresh({settle:false}),badges.read()]);}
  catch(e){if(!alive.current)return;const status=e.response?.status;if(status&&status>=400&&status<500){localStorage.removeItem(storageKey);setPending(null);await read();setError(message(e));}else setError('兑换结果尚未确认。请用“重新核对这次兑换”恢复结果，不要重新发起兑换。'+message(e));}
  finally{if(alive.current){lock.current=false;setBusy(false);}}
 };
 const confirm=()=>execute({giftId:dialog.id,requestKey:crypto.randomUUID(),expectedPrice:dialog.price});
 return <section className="real-reward-shop" aria-label={giftType==='badge'?'徽章兑换':'礼品兑换'}><header><div><h2>{giftType==='badge'?'徽章兑换':'礼品兑换'}</h2><p>使用账号中的真实金币兑换，记录会保存到服务器。</p></div><PixelButton onClick={read} disabled={busy}>刷新礼品与记录</PixelButton></header>
  {error&&<Alert type="warning" title="暂时无法完成操作" description={error} action={<PixelButton onClick={read}>重新读取</PixelButton>}/>}
  {pending&&<Alert type="warning" title="有一笔兑换结果待核对" description="重新核对会使用原请求编号，不会重复扣币。" action={<PixelButton loading={busy} onClick={()=>execute(pending)}>重新核对这次兑换</PixelButton>}/>}
  {result&&<Alert role="status" type="success" title={result.message} description={<><span>订单号：{result.order.id} · 消耗 {result.order.cost} 金币</span>{result.order.gift_type==='badge'&&<Link to="/me/badges"> 查看徽章墙</Link>}</>} closable onClose={()=>setResult(null)}/>}
  <Tabs activeKey={tab} onChange={setTab} items={[{key:'gifts',label:giftType==='badge'?'可兑换徽章':'可兑换礼品',children:!catalog&&!error?<Spin/>:catalog?.gifts.filter(g=>g.type===giftType).length?<div className="real-reward-grid">{catalog.gifts.filter(g=>g.type===giftType).map(g=><RewardGift key={g.id} gift={g}><PixelButton type="primary" disabled={busy||!!pending||!!g.blockedReason||!coins.data} onClick={()=>{setDialog(g);setError('');}}>查看并兑换</PixelButton></RewardGift>)}</div>:!error&&<Empty description="老师还没有上架礼品，稍后再来看看吧。"/>},{key:'records',label:'兑换记录',children:<PixelPanel className="real-reward-orders"><h3>我的兑换记录</h3>{!orders&&!error?<Spin/>:orders?.items.length?<ol>{orders.items.map(o=><li key={o.id} data-order-id={o.id}><div><strong>{o.gift_name}</strong><p>{formatBeijingTime(o.created_at)}</p><p>订单号：{o.id}</p><PixelTag>{o.status==='pending'?'等待老师发放':o.gift_type==='badge'?'徽章已到账':'已发放'}</PixelTag>{o.fulfilled_at&&<p>{formatBeijingTime(o.fulfilled_at)}{o.fulfiller_name?' · '+o.fulfiller_name:''}</p>}</div><strong>−{o.cost} 金币</strong></li>)}</ol>:!error&&<Empty description="还没有兑换记录"/>}{orders?.total>20&&<Pagination current={page} pageSize={20} total={orders.total} onChange={setPage} showSizeChanger={false}/>}</PixelPanel>}]}/>
  <Modal open={!!dialog} title="确认兑换" onCancel={()=>!busy&&setDialog(null)} maskClosable={!busy} closable={!busy} rootClassName="student-pixel student-interactions" footer={<><PixelButton disabled={busy} onClick={()=>setDialog(null)}>再想想</PixelButton><PixelButton type="primary" loading={busy} disabled={!!pending||!coins.data||coins.data.balance<(dialog?.price||0)} onClick={confirm}>确认兑换</PixelButton></>}>
   {dialog&&<><RewardGift gift={dialog}/><p>当前余额：{coins.data?.balance??'—'} 金币。确认后消耗 {dialog.price} 金币。</p>{coins.data&&coins.data.balance<dialog.price&&<Alert type="warning" title="金币不足"/>}{error&&<Alert type="warning" title={error}/>}</>}
  </Modal>
 </section>;
}
