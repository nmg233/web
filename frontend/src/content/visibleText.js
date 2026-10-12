import { displayText } from './displayText.js';
export function visibleText(entry,{fragment=false}={}){const text=!entry||entry.enabled===false||typeof entry.text!=='string'?'':entry.text;return fragment?text:displayText(text);}
