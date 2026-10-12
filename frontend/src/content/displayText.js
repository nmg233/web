// Controlled display formatting only; never apply to input values or stored data.
export function displayText(value, { kind = 'sentence', englishPeriod = true } = {}) {
  if (typeof value !== 'string' || kind !== 'sentence') return value;
  if (/^(?:https?:\/\/|www\.|[A-Za-z]:[\\/]|\/[^/])\S+$/u.test(value.trim())) return value;
  const match = value.match(/^(.*?)([”’」』»"']*)(\s*)$/su);
  if (!match) return value;
  const [, text, quotes, whitespace] = match;
  if (text.endsWith('。') && !text.endsWith('。。')) return text.slice(0,-1)+quotes+whitespace;
  if (englishPeriod && /[\u3400-\u9fff]/u.test(text) && /[^.\d]\.\s*$/u.test(text) && !/(?:https?:\/\/|www\.|\S+\.(?:png|jpg|pdf|txt|jsx|js|zip|webp|mp4|docx|xlsx|pptx|json|html|yaml)|\bv?\d+(?:\.\d+)+)\S*$/iu.test(text)) return text.slice(0,-1)+quotes+whitespace;
  return value;
}
