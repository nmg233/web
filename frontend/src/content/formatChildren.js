import {Children,cloneElement,isValidElement} from 'react';
import {displayText} from './displayText.js';
// Preserve React structure. Never flatten links, code, input or custom components.
export function formatChildren(children){
 const nodes=Children.toArray(children);
 if(nodes.every(node=>typeof node==='string'||typeof node==='number'))return displayText(nodes.join(''));
 for(let i=nodes.length-1;i>=0;i--){
  const node=nodes[i];
  if(typeof node==='string'&&!node.trim())continue;
  if(typeof node==='string'){nodes[i]=displayText(node);break;}
  if(isValidElement(node)&&typeof node.type==='string'&&['span','strong','em','b','i'].includes(node.type))nodes[i]=cloneElement(node,{},formatChildren(node.props.children));
  break;
 }
 return nodes;
}
