import {systemCopy} from './systemCopy.js';
import {visibleText} from './visibleText.js';
export function copyText(id){return visibleText(systemCopy[id]);}
export function copyTemplate(id,values){return copyText(id).replace(/\{(slot\d+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]??''):match);}
