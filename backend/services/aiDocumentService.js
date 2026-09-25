const fs = require('fs/promises');
const path = require('path');
const db = require('../config/database');
const { UPLOAD_ROOT } = require('../middleware/upload');

const SUPPORTED = new Set(['.pdf', '.docx', '.pptx', '.txt']);
const UNSUPPORTED_MESSAGE = '该格式暂不能加入知识库。旧版 DOC/PPT 请先转换为 DOCX/PPTX；扫描版 PDF 请先进行 OCR 后再上传。';
const queued = new Set();
const pending = [];
let running = false;

function extension(resource) { return path.extname(resource.file_path || '').toLowerCase(); }
function unsupportedHint(ext) {
  return ['.doc', '.ppt'].includes(ext)
    ? '旧版 DOC/PPT 暂不能解析，请先转换为 DOCX/PPTX 后重新上传。'
    : '该文件可作为课程资源，但不会进入 AI 文字检索。';
}
function getResource(resourceId) {
  return db.prepare('SELECT id, course_id, title, file_path, file_size FROM resources WHERE id = ?').get(resourceId);
}

function registerResource(resourceId) {
  const resource = getResource(resourceId);
  if (!resource) return null;
  const supported = SUPPORTED.has(extension(resource));
  db.prepare(`INSERT INTO ai_documents (resource_id, course_id, status, error_message)
    VALUES (?, ?, ?, ?) ON CONFLICT(resource_id) DO UPDATE SET
    status=excluded.status, error_message=excluded.error_message, updated_at=CURRENT_TIMESTAMP`)
    .run(resource.id, resource.course_id, supported ? 'pending' : 'unsupported', supported ? null : unsupportedHint(extension(resource)));
  if (supported) enqueue(resourceId);
  return db.prepare('SELECT * FROM ai_documents WHERE resource_id = ?').get(resourceId);
}

function enqueue(resourceId) {
  if (queued.has(resourceId)) return;
  queued.add(resourceId);
  pending.push(resourceId);
  if (!running) setImmediate(drain);
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const resourceId = pending.shift();
      try { await processResource(resourceId); }
      catch (err) { console.error('课程资料索引失败:', err); }
      finally { queued.delete(resourceId); }
    }
  } finally { running = false; }
}

function cleanText(text) {
  return String(text || '').replace(/\u0000/g, '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function splitText(text, locator) {
  const result = [];
  const value = cleanText(text).slice(0, 1200000);
  for (let start = 0; start < value.length; start += 850) {
    const part = value.slice(start, start + 1000).trim();
    if (part) result.push({ text: part, locator });
    if (result.length >= 1400) break;
  }
  return result;
}

function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

async function extractParts(file, ext) {
  if (ext === '.txt') return [{ text: await fs.readFile(file, 'utf8'), locator: '文本' }];
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: file });
    return [{ text: result.value, locator: '正文' }];
  }
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(await fs.readFile(file)) });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({ text: page.text, locator: `第 ${page.num} 页` }));
    } finally { await parser.destroy(); }
  }
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true });
  const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
  if (slideNames.length > 300) throw new Error('幻灯片超过 300 页，请拆分文件');
  const parts = [];
  for (const name of slideNames) {
    const xml = await zip.file(name).async('string');
    if (xml.length > 2_000_000) throw new Error('幻灯片内容过大，请拆分文件');
    const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join(' ');
    parts.push({ text, locator: `第 ${name.match(/slide(\d+)/)[1]} 页` });
  }
  return parts;
}

async function processResource(resourceId) {
  const resource = getResource(resourceId);
  const document = db.prepare('SELECT * FROM ai_documents WHERE resource_id = ?').get(resourceId);
  if (!resource || !document || !SUPPORTED.has(extension(resource))) return;
  db.prepare("UPDATE ai_documents SET status = 'processing', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(document.id);
  try {
    const file = path.resolve(resource.file_path);
    const relative = path.relative(UPLOAD_ROOT, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('文件不在课程资料目录内');
    if (resource.file_size > 50 * 1024 * 1024) throw new Error('文件超过 50 MB');
    const parts = await extractParts(file, extension(resource));
    const chunks = parts.flatMap((part) => splitText(part.text, part.locator));
    if (!chunks.length) throw new Error('未提取到文字。扫描版 PDF 请先进行 OCR 后再上传。');
    db.transaction(() => {
      const current = db.prepare('SELECT id FROM ai_documents WHERE id = ?').get(document.id);
      if (!current) return;
      db.prepare('DELETE FROM ai_chunks WHERE document_id = ?').run(document.id);
      const insert = db.prepare('INSERT INTO ai_chunks (document_id, course_id, chunk_index, locator, text) VALUES (?, ?, ?, ?, ?)');
      chunks.forEach((chunk, index) => insert.run(document.id, resource.course_id, index, chunk.locator, chunk.text));
      db.prepare("UPDATE ai_documents SET status = 'ready', error_message = NULL, indexed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(document.id);
    })();
  } catch (err) {
    db.prepare("UPDATE ai_documents SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(String(err.message || '解析失败').slice(0, 200), document.id);
  }
}

function listDocuments(courseId) {
  return db.prepare(`SELECT r.id AS resource_id, r.title, r.file_path, r.created_at, d.id AS document_id,
    COALESCE(d.enabled, 0) AS enabled, COALESCE(d.status, 'not_added') AS status, d.error_message, d.indexed_at,
    (SELECT COUNT(*) FROM ai_chunks WHERE document_id = d.id) AS chunk_count
    FROM resources r LEFT JOIN ai_documents d ON d.resource_id = r.id
    WHERE r.course_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(courseId).map((row) => ({
    ...row, extension: extension(row), file_path: undefined,
    hint: SUPPORTED.has(extension(row)) ? null : unsupportedHint(extension(row)),
  }));
}

function resumePending() {
  db.prepare("UPDATE ai_documents SET status = 'pending' WHERE status = 'processing'").run();
  db.prepare("SELECT resource_id FROM ai_documents WHERE status = 'pending'").all().forEach((row) => enqueue(row.resource_id));
}

module.exports = { registerResource, processResource, listDocuments, resumePending, enqueue, SUPPORTED, UNSUPPORTED_MESSAGE };
