import ManagedText from './ManagedText';
import {displayText} from './displayText';
// Metadata is attached only to compiled UI configuration, never to account/teaching DTOs.
export default function ConfigText({object,field,value,sentence=false}){const id=object?.__copyIds?.[field];return id?<ManagedText id={id} rendered={typeof value==='string'?value:undefined}/>:sentence&&typeof value==='string'?displayText(value):value??null;}
