import {runtimeText} from './runtimeCopy.js';
import { uiCopy } from './uiCopy.jsx';
import { systemCopy } from './systemCopy.js';
export {visibleText} from './visibleText';
export function copyText(id) { return runtimeText(id,uiCopy[id] || systemCopy[id]); }
export function copyFragment(id) { return runtimeText(id,uiCopy[id],{fragment:true}); }
// Interpolate data as text, never HTML or executable expressions.
export function copyTemplate(id, values) {
  return copyText(id).replace(/\{(slot\d+)\}/g, (match,key) => Object.hasOwn(values,key) ? String(values[key] ?? '') : match);
}
