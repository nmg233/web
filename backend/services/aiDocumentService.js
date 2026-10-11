const { fork } = require('node:child_process');
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

function parseInWorker(file, ext) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'aiDocumentWorker.js'), [], {
      execArgv: ['--max-old-space-size=256'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let finished = false;
    const complete = (error, result) => {
      if (finished) return; finished = true; clearTimeout(timer); worker.kill();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => complete(new Error('文档解析超过 30 秒，请拆分文件')), 30000);
    worker.once('message', (message) => complete(message.error ? new Error(message.error) : null, message.chunks));
    worker.once('error', (error) => complete(error));
    worker.once('exit', (code) => { if (!finished) complete(new Error(`文档解析进程退出（${code}）`)); });
    worker.stderr.resume(); // 防止第三方解析器日志塞满管道；错误通过 IPC 返回。
    worker.send({ file, ext });
  });
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
    const chunks = await parseInWorker(file, extension(resource));
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
