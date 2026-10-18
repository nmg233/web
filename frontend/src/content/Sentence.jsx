import {hasTeachingValue} from '../utils/teachingContent';
import {formatChildren} from './formatChildren';
export default function Sentence({as:Element='p',children,...props}) {
  if(typeof children==='string'&&!hasTeachingValue(children))return null;
  return <Element {...props}>{formatChildren(children)}</Element>;
}
