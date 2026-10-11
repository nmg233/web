const crypto = require('node:crypto');
function identity(user, scope, data, files = []) {
  if (!data.request_key) return null; // 兼容已部署旧客户端；新客户端必须保留重试标识。
  if (typeof data.request_key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(data.request_key)) throw Object.assign(new Error('请求标识无效'), { status: 400 });
  const payload = Object.keys(data).sort().filter((k) => k !== 'request_key').map((k) => [k,data[k]]);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ payload,
    files: files.map((f) => ({ name:f.originalname, size:f.size, type:f.mimetype, sha256:f.content_sha256 || null })) })).digest('hex');
  return { actor:user.id, scope, key:data.request_key, fingerprint };
}
function existing(db, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM request_results WHERE actor_id = ? AND scope = ? AND request_key = ?').get(id.actor,id.scope,id.key);
  if (!row) return null;
  if (row.fingerprint !== id.fingerprint) throw Object.assign(new Error('同一请求标识不能用于不同内容，请另建新请求'), { status:409 });
  return JSON.parse(row.result_json);
}
function save(db, id, result) {
  if (id) db.prepare('INSERT INTO request_results (actor_id,scope,request_key,fingerprint,result_json) VALUES (?,?,?,?,?)')
    .run(id.actor,id.scope,id.key,id.fingerprint,JSON.stringify(result));
}
module.exports = { identity, existing, save };
