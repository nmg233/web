const XLSX = require('xlsx');
const MAX_ROWS = 1000;
const ALIASES = {
  username: ['登录账号', '账号', 'username', 'login_id'], real_name: ['姓名', '真实姓名', 'real_name'],
  role: ['身份', '角色', 'role'], school_name: ['学校', '学校名称', 'school_name'],
  school_code: ['学校代码', '学校缩写', 'school_code'], class_name: ['班级', '班级名称', 'class_name'],
  grade: ['年级', 'grade'], email: ['邮箱', 'email'], phone: ['手机号', '手机', 'phone', '联系电话'],
  profile: ['简介', '备注', 'profile'], school_id: ['school_id', '学校id'], class_id: ['class_id', '班级id'],
};
function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function normalizeImportRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('名单每行必须为对象');
  const row = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const keys = Object.keys(raw).filter(key => aliases.includes(key.replace(/^\uFEFF/, '').trim().toLowerCase()));
    if (keys.length > 1) fail(`表头存在重复或歧义字段：${field}`);
    const value = keys.length ? raw[keys[0]] : '';
    if (value !== null && typeof value === 'object') fail(`字段 ${field} 必须为文本或数字`);
    const text = String(value ?? '').trim();
    if (text.length > (field === 'profile' ? 10000 : 200)) fail(`字段 ${field} 内容过长`);
    row[field] = text === '-' ? '' : text;
  }
  return row;
}
function parseCSV(text) {
  const records = []; let fields = [], value = '', quoted = false, endedQuote = false, start = true;
  const pushField = () => { fields.push(value); value = ''; endedQuote = false; start = true; };
  const pushRow = () => { pushField(); if (fields.some(v => v.trim())) records.push(fields); fields = []; if (records.length > MAX_ROWS + 1) fail(`名单最多 ${MAX_ROWS} 行`); };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; endedQuote = true; } }
      else value += ch;
    } else if (ch === ',' ) pushField();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (ch === '"' && start) { quoted = true; start = false; }
    else { if (endedQuote || ch === '"') fail('CSV 引号格式错误'); value += ch; start = false; }
  }
  if (quoted) fail('CSV 引号未闭合');
  if (fields.length || value || endedQuote) pushRow();
  if (records.length < 2) fail('文件至少需要表头和一行数据');
  const headers = records.shift().map(h => h.trim());
  if (new Set(headers).size !== headers.length) fail('文件包含重复表头');
  return records.map((values, i) => {
    if (values.length !== headers.length) fail(`第 ${i + 1} 条记录列数与表头不一致`);
    return normalizeImportRow(Object.fromEntries(headers.map((h, j) => [h, values[j]])));
  });
}
function parseInput({ file, data }) {
  let rows;
  if (file) {
    const ext = require('node:path').extname(file.name).toLowerCase();
    const buffer = Buffer.from(file.buffer);
    if (buffer.length > 10 * 1024 * 1024) fail('导入文件不能超过 10 MB');
    if (ext === '.csv') {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { fail('CSV 必须使用 UTF-8 编码，请重新另存为 UTF-8 CSV'); }
      rows = parseCSV(text);
    }
    else if (ext === '.xlsx' || ext === '.xls') {
      const book = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_ROWS + 2 });
      const sheets = book.SheetNames.map(name => XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', blankrows: false }))
        .filter(table => table.some(row => row.some(value => String(value).trim())));
      if (sheets.length !== 1) fail('请提供恰好一个非空工作表，避免遗漏名单');
      const table = sheets[0];
      if (table.length < 2) fail('文件至少需要表头和一行数据');
      const headers = table.shift().map(h => String(h).trim());
      if (new Set(headers).size !== headers.length) fail('文件包含重复表头');
      rows = table.map(values => normalizeImportRow(Object.fromEntries(headers.map((h, j) => [h, values[j] ?? '']))));
    } else fail('仅支持 .csv / .xlsx / .xls 文件');
  } else {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!Array.isArray(parsed)) fail('data 必须为名单数组');
    rows = parsed.map(normalizeImportRow);
  }
  if (!rows.length) fail('名单为空，请添加用户后再导入');
  if (rows.length > MAX_ROWS) fail(`名单最多 ${MAX_ROWS} 行，请拆分文件`);
  if (!rows.some(row => row.real_name)) fail('缺少姓名列或所有姓名为空');
  return rows;
}
module.exports = { parseInput, normalizeImportRow, MAX_ROWS };
