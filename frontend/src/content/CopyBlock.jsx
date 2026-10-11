import { copyText } from './copy';
export default function CopyBlock({ id, as: Element = 'span', style, ...props }) {
  const text = copyText(id);
  return text === '' ? null : <Element data-copy-id={id} style={{whiteSpace:'pre-wrap',...style}} {...props}>{text}</Element>;
}
