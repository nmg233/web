// 仅存请求标识、文件元数据及说明，不存文件内容/凭据；按账号和课时隔离。
export function replayRecoveryKey(userId,courseId,lessonId) { return `pbl:replay:${userId}:${courseId}:${lessonId}`; }
export function readReplayRecovery(storage,key) {
  try { const rows=JSON.parse(storage.getItem(key)||'[]'); return Array.isArray(rows)?rows.filter(r=>typeof r.token==='string'&&typeof r.fingerprint==='string').slice(-20):[]; } catch { return []; }
}
export function saveReplayRecovery(storage,key,row) {
  try { const rows=readReplayRecovery(storage,key).filter(r=>r.token!==row.token);storage.setItem(key,JSON.stringify([...rows,row].slice(-20)));return true; } catch { return false; }
}
export function clearReplayRecovery(storage,key,token) {
  try { const rows=readReplayRecovery(storage,key).filter(r=>r.token!==token);if(rows.length)storage.setItem(key,JSON.stringify(rows));else storage.removeItem(key); } catch { /* 无法持久化不等于取消服务器操作。 */ }
}
