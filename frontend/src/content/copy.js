import { uiCopy } from './uiCopy.jsx';
import { systemCopy } from './systemCopy.js';
import {visibleText} from './visibleText';
export {visibleText};
export function copyText(id) { return visibleText(uiCopy[id] || systemCopy[id]); }
export function copyFragment(id) { return visibleText(uiCopy[id],{fragment:true}); }
// Interpolate data as text, never HTML or executable expressions.
export function copyTemplate(id, values) {
  return copyText(id).replace(/\{(slot\d+)\}/g, (match,key) => Object.hasOwn(values,key) ? String(values[key] ?? '') : match);
}
