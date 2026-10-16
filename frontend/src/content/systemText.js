import {systemCopy} from './systemCopy.js';
import {runtimeText} from './runtimeCopy.js';
export function copyText(id){return runtimeText(id,systemCopy[id]);}
export function copyTemplate(id,values){return copyText(id).replace(/\{(slot\d+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]??''):match);}
