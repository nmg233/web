import {useEffect,useState} from 'react';
import client from '../api/client';
import {PixelPanel,PixelTag} from './visual/PixelUI';
export function RewardImage({id,name='',size=128}){
 const [state,setState]=useState(null);
 useEffect(()=>{let active=true,url;const controller=new AbortController();
  if(id)client.get('/reward-shop/images/'+id,{responseType:'blob',silent:true,signal:controller.signal}).then(blob=>{url=URL.createObjectURL(blob);if(active)setState({id,url});}).catch(()=>{if(active)setState({id,error:true});});
  return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
 },[id]);
 return state?.id===id&&state.url?<img src={state.url} alt={name} className="real-reward-image" width={size} height={size}/>:<span className="real-reward-image-fallback" style={{width:size,height:size}} role="img" aria-label={state?.id===id&&state.error?'礼品图片暂不可用':'礼品图片'}>{state?.id===id&&state.error?'图片暂不可用':'◇'}</span>;
}
export default function RewardGift({gift,children}){return <PixelPanel className="real-reward-gift"><RewardImage id={gift.image_id} name={gift.name}/><div><PixelTag>{gift.type==='badge'?'数字徽章':'实物礼品'}</PixelTag><h3>{gift.name}</h3><p className="real-reward-description">{gift.description||'暂无介绍'}</p><strong>{gift.price} 金币</strong><dl><div><dt>剩余库存</dt><dd>{gift.stock}</dd></div><div><dt>每人限兑</dt><dd>{gift.per_student_limit??'不限'}{gift.per_student_limit!==null?' 次':''}</dd></div></dl>{gift.type==='badge'&&<p>同一徽章每个账号可获得一次。</p>}{gift.blockedReason&&<p role="status">{gift.blockedReason}</p>}{children}</div></PixelPanel>;}
