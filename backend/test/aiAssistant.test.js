const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const JSZip = require('jszip');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-ai-assistant-'));
process.env.DB_PATH = path.join(dir, 'assistant.db');
process.env.UPLOAD_PATH = path.join(dir, 'uploads');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ai-test-jwt-secret';
process.env.AI_CONFIG_SECRET = 'a'.repeat(64);
const app = require('../app');
const db = require('../config/database');
const documents = require('../services/aiDocumentService');
const answers = require('../services/aiAnswerService');
let server;
let base;
const tokens = {};

function simplePdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let value = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { value += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}

async function api(route, method = 'GET', body, role = 'admin') {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${tokens[role]}` },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  for (const [id, role] of [[1, 'admin'], [2, 'academic_mentor'], [3, 'student'], [4, 'teacher']]) {
    db.prepare('INSERT INTO users (id, username, real_name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, role, role, bcrypt.hashSync('password123', 4), role);
  }
  for (const id of [1, 2]) {
    db.prepare("INSERT INTO courses (id, title, grade_level, difficulty, status, created_by) VALUES (?, ?, 'primary', 'basic', 'published', ?)")
      .run(id, `课程${id}`, id === 1 ? 2 : 1);
  }
  db.prepare("INSERT INTO enrollments (student_id, course_id, status) VALUES (3, 1, 'active')").run();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin', 'academic_mentor', 'student', 'teacher']) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: role, password: 'password123' }) });
    tokens[role] = (await response.json()).token;
  }
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('管理员配置加密保存，非管理员无法读取，学生只能向已报名课程提问', async () => {
  assert.equal((await api('/dashboard/ai/settings', 'GET', undefined, 'student')).status, 403);
  const saved = await api('/dashboard/ai/settings', 'PUT', {
    enabled: true, api_key: 'test-deepseek-key', model: 'deepseek-flash', base_url: 'https://api.deepseek.com',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.has_api_key, true);
  assert.equal('api_key_encrypted' in saved.body, false);
  assert.equal('api_key' in saved.body, false);
  assert.doesNotMatch(db.prepare('SELECT api_key_encrypted FROM ai_settings WHERE id = 1').get().api_key_encrypted, /test-deepseek-key/);
  assert.equal((await api('/dashboard/ai/ask', 'POST', { question: '月球基地怎么设计？', course_id: 2 }, 'student')).status, 403);
  assert.equal((await api('/dashboard/ai/ask', 'POST', { question: '月球基地怎么设计？' }, 'student')).status, 400);
  assert.equal((await api('/dashboard/ai/ask', 'POST', { question: '月球基地怎么设计？', course_id: 1 }, 'teacher')).status, 403);
});

test('课程 TXT 资料被切分检索，停用和删除后立即退出检索', async () => {
  const form = new FormData();
  form.append('title', '月球基地讲义');
  form.append('resource_type', 'courseware');
  form.append('file', new Blob(['月球基地材料应考虑辐射防护与保温设计。'.repeat(20)], { type: 'text/plain' }), 'lesson.txt');
  const uploaded = await api('/courses/1/resources', 'POST', form, 'academic_mentor');
  assert.equal(uploaded.status, 200);
  const resourceId = uploaded.body.id;
  for (let i = 0; i < 40; i++) {
    if (db.prepare('SELECT status FROM ai_documents WHERE resource_id = ?').get(resourceId)?.status === 'ready') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const row = db.prepare('SELECT id, status FROM ai_documents WHERE resource_id = ?').get(resourceId);
  assert.equal(row.status, 'ready');
  assert.ok(answers.relevantFiles(1, '月球基地材料').some((item) => item.id === resourceId));
  assert.equal(answers.relevantFiles(2, '月球基地材料').length, 0);
  assert.equal((await api(`/dashboard/ai/documents/${row.id}`, 'PATCH', { enabled: false }, 'academic_mentor')).status, 200);
  assert.equal(answers.relevantFiles(1, '月球基地材料').length, 0);
  assert.equal((await api(`/courses/resources/${resourceId}`, 'DELETE', undefined, 'academic_mentor')).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_chunks WHERE document_id = ?').get(row.id).n, 0);
});

test('可提取文字的 PDF、DOCX、PPTX 能解析并记录页码或幻灯片', async () => {
  const docx = new JSZip();
  docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docx.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>月球基地保温设计</w:t></w:r></w:p></w:body></w:document>');
  const pptx = new JSZip();
  pptx.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>月球基地辐射防护</a:t></p:sld>');
  const fixtures = [
    ['.pdf', simplePdf('Moon base thermal design'), 'Moon base', '第 1 页'],
    ['.docx', await docx.generateAsync({ type: 'nodebuffer' }), '月球基地保温设计', '正文'],
    ['.pptx', await pptx.generateAsync({ type: 'nodebuffer' }), '月球基地辐射防护', '第 1 页'],
  ];
  for (const [ext, bytes, expected, locator] of fixtures) {
    const file = path.join(process.env.UPLOAD_PATH, `parser${ext}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    const resource = db.prepare("INSERT INTO resources (course_id, resource_type, title, file_path, file_size, upload_by) VALUES (1, 'courseware', ?, ?, ?, 1)")
      .run(`测试${ext}`, file, bytes.length);
    const id = Number(resource.lastInsertRowid);
    db.prepare("INSERT INTO ai_documents (resource_id, course_id, status) VALUES (?, 1, 'pending')").run(id);
    await documents.processResource(id);
    const row = db.prepare('SELECT status, error_message FROM ai_documents WHERE resource_id = ?').get(id);
    assert.equal(row.status, 'ready', `${ext}: ${row.error_message}`);
    const chunk = db.prepare('SELECT text, locator FROM ai_chunks WHERE document_id = (SELECT id FROM ai_documents WHERE resource_id = ?)').get(id);
    assert.match(chunk.text, new RegExp(expected));
    assert.equal(chunk.locator, locator);
  }
});

test('后端调用 deepseek-flash，拒绝无关问题且不泄露 Key', async () => {
  const original = global.fetch;
  let captured;
  global.fetch = (url, options) => {
    if (String(url).startsWith('https://api.deepseek.com/')) {
      captured = { url, options };
      return Promise.resolve({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ scope: 'unrelated', answer: '天气很好', source_ids: [] }) } }] }) });
    }
    return original(url, options);
  };
  try {
    const response = await api('/dashboard/ai/ask', 'POST', { question: '今天娱乐新闻有哪些？', course_id: 1 }, 'student');
    assert.equal(response.status, 200);
    assert.equal(response.body.answer, answers.REFUSAL);
    assert.deepEqual(response.body.sources, []);
    assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(JSON.parse(captured.options.body).model, 'deepseek-flash');
    assert.equal(captured.options.headers.Authorization, 'Bearer test-deepseek-key');
    assert.equal(JSON.stringify(response.body).includes('test-deepseek-key'), false);
  } finally { global.fetch = original; }
});
