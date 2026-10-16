import {useSyncExternalStore} from 'react';
import {copySnapshot,subscribeCopy,runtimeText} from './runtimeCopy';
export default function ManagedText({id,values,fragment=false,rendered}){
 useSyncExternalStore(subscribeCopy,copySnapshot,copySnapshot);let text=typeof rendered==='string'?rendered:runtimeText(id,undefined,{fragment});
 if(values)text=text.replace(/\{(slot\d+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]??''):match);
 return text?<span data-copy-id={id}>{text}</span>:null;
}
