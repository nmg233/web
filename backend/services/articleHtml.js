const sanitize = require('sanitize-html');
const {parseDocument, DomUtils} = require('htmlparser2');
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const MAX_HTML = 500000;
function source(html, requireMain = false) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 2 * 1024 * 1024) invalid('文章 HTML 最大 2MB');
  const doc = parseDocument(html);
  const stack = doc.children.map(node => ({node, depth:0}));
  let count = 0, main;
  while (stack.length) {
    const {node, depth} = stack.pop();
    if (++count > 20000 || depth > 64) invalid('文章结构过于复杂：最多 20000 个节点、64 层，请简化 HTML');
    if (node.attribs?.id === 'js_content') main = node;
    for (const child of node.children || []) stack.push({node:child, depth:depth+1});
  }
  if (requireMain && !main) invalid('公众号未返回可识别正文，可能需要验证；请改用 HTML＋图片包');
  return main ? DomUtils.getOuterHTML(main) : html;
}
function plainText(html) { return DomUtils.textContent(parseDocument(source(html))); }
function imageSources(html) {
  const doc = parseDocument(source(html));
  return [...new Set(DomUtils.findAll(n => n.name === 'img', doc.children)
    .map(n => n.attribs['data-src'] || n.attribs.src).filter(Boolean))];
}
const color = [/^#[0-9a-f]{3,8}$/i, /^(?:black|white|red|green|blue|gray|grey|transparent)$/i, /^rgba?\([\d.,%\s]+\)$/];
const lengths = [/^(?:0|\d{1,3}(?:\.\d+)?(?:px|em|rem|%))(?:\s+(?:0|\d{1,3}(?:\.\d+)?(?:px|em|rem|%))){0,3}$/];
function clean(html, resolve = s => /^pbl-resource:\d+$/.test(s) ? s : null) {
  html = source(html);
  const unsupported = (html.match(/<(?:video|audio|iframe|mp-video|mpvoice|canvas)\b/gi) || []).length;
  const missing = [], ids = new Set();
  const output = sanitize(html, {
    allowedTags: ['section','article','div','p','span','br','strong','b','em','i','u','s','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','table','thead','tbody','tr','th','td','a','img','figure','figcaption','hr','sub','sup'],
    allowedAttributes: {'*':['style'], a:['href','target','rel'], img:['src','alt','width','height'], th:['colspan','rowspan'], td:['colspan','rowspan']},
    allowedSchemes: ['https','pbl-resource'], allowProtocolRelative: false,
    allowedStyles: {'*': {
      color, 'background-color': color, 'text-align': [/^(?:left|right|center|justify)$/],
      'font-size': [/^(?:1[2-9]|[2-4]\d|48)px$/, /^(?:[1-2](?:\.\d+)?)em$/],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/], 'font-style': [/^(?:normal|italic)$/],
      'line-height': [/^(?:1(?:\.\d+)?|2(?:\.[0-5])?)$/], 'text-decoration': [/^(?:none|underline|line-through)$/],
      margin: lengths, padding: lengths, 'border-radius': lengths, 'border-width': lengths,
      'border-color': color, 'border-style': [/^(?:solid|dashed|dotted|none)$/],
      'letter-spacing': [/^[0-5](?:\.\d+)?px$/], 'max-width': [/^100%$/]
    }},
    nonTextTags: ['script','style','textarea','option','noscript','iframe','object','embed','svg','math','video','audio','canvas','form'],
    transformTags: {
      img: (_tag, attrs) => {
        const original = attrs['data-src'] || attrs.src || '', local = resolve(original);
        if (!local || !/^pbl-resource:\d+$/.test(local)) { missing.push(original || '无地址图片'); return {tagName:'span', attribs:{}}; }
        ids.add(Number(local.split(':')[1]));
        return {tagName:'img', attribs:{src:local, alt:String(attrs.alt || '').slice(0,200), ...(attrs.width && /^\d{1,4}$/.test(attrs.width) ? {width:attrs.width} : {})}};
      },
      a: (_tag, attrs) => { let href;try{const u=new URL(attrs.href);if(u.protocol==='https:'&&!u.username&&!u.password)href=u.href;}catch{}return {tagName:'a',attribs:href?{href,target:'_blank',rel:'noopener noreferrer'}:{}}; }
    }
  });
  if (missing.length) invalid('文章有未导入图片，未写入正文：' + missing.slice(0,4).join('、'));
  if (output.length > MAX_HTML) invalid('清理后文章最大 500000 字符，请拆分');
  if (!plainText(output).trim() && !ids.size) invalid('文章没有可保存的正文或图片');
  return {html:output, resourceIds:[...ids], complete:unsupported===0,
    warnings:unsupported ? ['已移除不支持的视频、音频或嵌入；请另行上传本站视频。此导入不是完整媒体复制。'] : []};
}
module.exports={source,imageSources,clean,plainText,MAX_HTML};
