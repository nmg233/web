import {formatChildren} from './formatChildren';
export default function Sentence({as:Element='p',children,...props}) {
  return <Element {...props}>{formatChildren(children)}</Element>;
}
