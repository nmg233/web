const crypto = require('node:crypto');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const db = require('../config/database');
const { createAccount } = require('./accountCreationService');
const { generateTemporaryPassword } = require('./tempPasswordService');
let processing = false, parsing = 0;
const waiters = new Map();
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function parse(input) {
  if (parsing >= 2) fail('正在解析其他名单，请稍后重试', 429);
  parsing++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'accountImportParseWorker.js'), { workerData: input, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    let settled = false;
    const finish = (err, rows) => {
      if (settled) return; settled = true; parsing--; clearTimeout(timer); worker.terminate();
      if (err) reject(Object.assign(err, { status: 400 })); else resolve(rows);
    };
    const timer = setTimeout(() => finish(new Error('名单解析超时，请拆分文件')), 10000);
    worker.once('message', result => finish(result.error ? new Error(result.error) : null, result.rows));
    worker.once('error', () => finish(new Error('名单解析失败或文件过大，请检查文件')));
    worker.once('exit', code => { if (!settled) finish(new Error(`名单解析任务中断（${code}）`)); });
  });
}
function owned(id, actorId) {
  const batch = db.prepare('SELECT * FROM account_import_batches WHERE id = ? AND actor_id = ?').get(id, actorId);
  if (!batch) fail('导入批次不存在或无权访问', 404);
  return batch;
}
function view(id, actorId, credentials = false) {
  const batch = owned(id, actorId);
  const result = JSON.parse(batch.result_json);
  const accounts = result.accounts.map(account => {
    const current = db.prepare('SELECT username, auth_version, force_reset_password, is_active, archived_at FROM users WHERE id = ?').get(account.id);
    const available = !!current && current.username === account.username && current.auth_version === account.auth_version && !!current.force_reset_password && !!current.is_active && !current.archived_at;
    const { auth_version, ...safe } = account;
    return { ...safe, credentials_available: available,
      ...(credentials && available ? { temp_password: generateTemporaryPassword(account.real_name) } : {}) };
  });
  return { id, status: batch.status, total: JSON.parse(batch.input_json).length, progress: batch.progress,
    imported: result.accounts.length, failed: result.errors.length, accounts, errors: result.errors,
    row_results: result.row_results, error: batch.error_message, delivered_at: batch.delivered_at,
    message: batch.status === 'failed' ? '批次中断，已完成结果保留，请修正原因后恢复' : `成功导入 ${result.accounts.length} 名用户，${result.errors.length} 条失败` };
}
function assertActor(id, version) {
  const actor = db.prepare('SELECT role,is_active,archived_at,force_reset_password,auth_version FROM users WHERE id = ?').get(id);
  if (!actor || actor.role !== 'admin' || !actor.is_active || actor.archived_at || actor.force_reset_password || (version !== undefined && actor.auth_version !== version)) fail('创建者账号状态或会话变化，已暂停导入', 403);
  return actor;
}
async function processBatch(batch) {
  const rows = JSON.parse(batch.input_json);
  let result = JSON.parse(batch.result_json);
  db.prepare("UPDATE account_import_batches SET status='running',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(batch.id);
  const save = (progress, next) => db.prepare('UPDATE account_import_batches SET progress=?,result_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(progress, JSON.stringify(next), batch.id);
  for (let index = batch.progress; index < rows.length; index++) {
    assertActor(batch.actor_id,batch.actor_auth_version);
    try {
      await createAccount(rows[index], { beforeCommit: () => assertActor(batch.actor_id,batch.actor_auth_version), onCreated: account => {
        const { temp_password, force_reset_password, ...metadata } = account;
        const next = { ...result, accounts: [...result.accounts, metadata], row_results: [...result.row_results, { row: index + 1, status: 'created', username: account.username }] };
        save(index + 1, next); result = next;
      } });
    } catch (err) {
      if (err.status !== 400) throw err;
      const message = `第 ${index + 1} 条记录：${err.message}`;
      result = { ...result, errors: [...result.errors, message], row_results: [...result.row_results, { row: index + 1, status: 'rejected', error: err.message, input: rows[index] }] };
      save(index + 1, result);
    }
  }
  db.prepare("UPDATE account_import_batches SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(batch.id);
}
async function pump() {
  if (processing) return;
  processing = true;
  try {
    let batch;
    while ((batch = db.prepare("SELECT * FROM account_import_batches WHERE status='pending' ORDER BY created_at,id LIMIT 1").get())) {
      try { await processBatch(batch); }
      catch (err) {
        db.prepare("UPDATE account_import_batches SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.status ? err.message : '后台处理失败，已完成结果保留，请恢复批次', batch.id);
      }
      const listeners = waiters.get(batch.id) || []; waiters.delete(batch.id); listeners.forEach(resolve => resolve());
    }
  } finally { processing = false; }
}
async function start(actorId, input, requestKey, forceNew = false, actorVersion) {
  const actor = assertActor(actorId,actorVersion);
  if (requestKey && !/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)) fail('批次请求标识无效');
  if (forceNew && !requestKey) fail('另建新批次必须提供新的批次请求标识');
  const rows = await parse(input);
  assertActor(actorId,actor.auth_version);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const key = requestKey || fingerprint;
  let batch = db.prepare('SELECT * FROM account_import_batches WHERE actor_id=? AND request_key=?').get(actorId, key);
  if (batch && batch.fingerprint !== fingerprint) fail('同一批次标识不能用于不同名单', 409);
  if (!batch && !forceNew) batch = db.prepare('SELECT * FROM account_import_batches WHERE actor_id=? AND fingerprint=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(actorId, fingerprint);
  if (!batch) {
    if (db.prepare("SELECT COUNT(*) AS n FROM account_import_batches WHERE status IN ('pending','running')").get().n >= 20) fail('待处理批次过多，请等待已有批次完成', 429);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO account_import_batches(id,actor_id,actor_auth_version,fingerprint,request_key,input_json) VALUES(?,?,?,?,?,?)').run(id, actorId, actor.auth_version, fingerprint, key, JSON.stringify(rows));
    batch = owned(id, actorId);
  }
  setImmediate(() => { pump().catch(() => {}); });
  return view(batch.id, actorId);
}
function wait(id) {
  const row = db.prepare('SELECT status FROM account_import_batches WHERE id=?').get(id);
  if (['completed', 'failed'].includes(row.status)) return Promise.resolve();
  return new Promise(resolve => { const listeners = waiters.get(id) || []; listeners.push(resolve); waiters.set(id, listeners); });
}
function resume(id, actorId, actorVersion) {
  const actor=assertActor(actorId,actorVersion); const batch = owned(id, actorId);
  if (batch.status === 'failed') db.prepare("UPDATE account_import_batches SET status='pending',actor_auth_version=? WHERE id=?").run(actor.auth_version,id);
  setImmediate(() => { pump().catch(() => {}); }); return view(id, actorId);
}
function resumePending() {
  db.prepare("UPDATE account_import_batches SET status='pending' WHERE status='running'").run();
  setImmediate(() => { pump().catch(() => {}); });
}
module.exports = { start, view, wait, resume, resumePending,
  list: (actorId, value = 1) => {
    const page = Math.max(1, Number.parseInt(value, 10) || 1), pageSize = 30;
    const total = db.prepare('SELECT COUNT(*) AS n FROM account_import_batches WHERE actor_id=?').get(actorId).n;
    const batches = db.prepare('SELECT id,status,progress,created_at,delivered_at FROM account_import_batches WHERE actor_id=? ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?').all(actorId,pageSize,(page-1)*pageSize);
    return { batches,total,page,pageSize };
  },
  acknowledge: (id, actorId) => {
    const batch=owned(id,actorId);
    if (batch.status!=='completed' || !JSON.parse(batch.result_json).accounts.length) fail('仅已完成且存在成功账号的批次可确认交付');
    db.prepare('UPDATE account_import_batches SET delivered_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
  } };
