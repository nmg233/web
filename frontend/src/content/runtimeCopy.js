import registry from '../../../content/student-copy/registry.json' with {type:'json'};
import {visibleText} from './visibleText.js';
export {registry};
let snapshot=0,scope='',active=false,overrides={};const listeners=new Set();
export const subscribeCopy=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export const copySnapshot=()=>snapshot;
export function setCopyScope(next,enabled){if(next===scope&&enabled===active)return;scope=next;active=enabled;overrides={};snapshot++;listeners.forEach(fn=>fn());}
export function receiveCopy(nextScope,value){if(nextScope!==scope||!active)return;const clean={};for(const [id,entry]of Object.entries(value||{}))if(Object.hasOwn(registry,id)&&entry&&typeof entry.text==='string'&&typeof entry.enabled==='boolean')clean[id]={text:entry.text,enabled:entry.enabled};if(JSON.stringify(clean)===JSON.stringify(overrides))return;overrides=clean;snapshot++;listeners.forEach(fn=>fn());}
export function runtimeEntry(id,base){return active&&Object.hasOwn(overrides,id)?overrides[id]:base||registry[id];}
export function runtimeText(id,base,options){return visibleText(runtimeEntry(id,base),options);}
