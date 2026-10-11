const fs = require('node:fs/promises');
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TEXT = 1_200_000;
const MAX_CHUNKS = 1400;

// 在任何解压之前检查 central directory，拒绝 ZIP64、加密和解压炸弹。
function checkZip(data) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw new Error('不支持的压缩文档');
  const count = data.readUInt16LE(end + 10), size = data.readUInt32LE(end + 12);
  let pos = data.readUInt32LE(end + 16), total = 0;
  if (count > 2000 || count === 65535 || pos + size > end) throw new Error('压缩文档条目过多或结构异常');
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || data.readUInt32LE(pos) !== 0x02014b50) throw new Error('压缩文档目录损坏');
    const flags = data.readUInt16LE(pos + 8), compressed = data.readUInt32LE(pos + 20), raw = data.readUInt32LE(pos + 24);
    const nameSize = data.readUInt16LE(pos + 28), extra = data.readUInt16LE(pos + 30), comment = data.readUInt16LE(pos + 32);
    const name = data.subarray(pos + 46, pos + 46 + nameSize).toString('utf8');
    total += raw;
    if ((flags & 1) || raw > 20 * 1024 * 1024 || total > 80 * 1024 * 1024 || (raw > 1024 * 1024 && raw / Math.max(1, compressed) > 100)
      || (/\.xml$/i.test(name) && raw > 2 * 1024 * 1024)) throw new Error('文档解压预算超限，请拆分后上传');
    pos += 46 + nameSize + extra + comment;
  }
  if (pos > end) throw new Error('压缩文档目录损坏');
}
function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
async function parse(file, ext) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('文件超过解析预算 50 MB');
  const data = await fs.readFile(file);
  let parts;
  if (ext === '.txt') parts = [{ text: data.toString('utf8'), locator: '文本' }];
  else if (ext === '.docx') {
    checkZip(data);
    const result = await require('mammoth').extractRawText({ buffer: data });
    parts = [{ text: result.value, locator: '正文' }];
  } else if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const info = await parser.getInfo();
      if (info.total > 300) throw new Error('PDF 超过 300 页，请拆分');
      const result = await parser.getText();
      parts = result.pages.map((p) => ({ text: p.text, locator: `第 ${p.num} 页` }));
    } finally { await parser.destroy(); }
  } else if (ext === '.pptx') {
    checkZip(data);
    const zip = await require('jszip').loadAsync(data);
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    if (names.length > 300) throw new Error('幻灯片超过 300 页，请拆分');
    parts = [];
    for (const name of names) {
      const xml = await zip.file(name).async('string');
      parts.push({ text: [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(' '), locator: `第 ${name.match(/slide(\d+)/)[1]} 页` });
    }
  } else throw new Error('不支持的文档格式');
  let total = 0;
  const chunks = [];
  for (const part of parts) {
    const value = String(part.text || '').replace(/\u0000/g, '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    total += value.length;
    if (total > MAX_TEXT) throw new Error('文档累计文字超过 120 万字，请拆分');
    for (let start = 0; start < value.length; start += 850) {
      const text = value.slice(start, start + 1000).trim();
      if (text) chunks.push({ text, locator: part.locator });
      if (chunks.length > MAX_CHUNKS) throw new Error('文档累计索引块超过 1400，请拆分');
    }
  }
  return chunks;
}
if (require.main === module) process.once('message', ({ file, ext }) => {
  parse(file, ext).then((chunks) => process.send({ chunks })).catch((error) => process.send({ error: error.message }));
});
module.exports = { checkZip, parse };
