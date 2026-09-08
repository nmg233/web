// FileLifecycleService：文件与数据库删除的顺序约定。
// 原则：先事务删除 DB 记录（commit），后删除物理文件；
// 文件删除失败不阻断业务，记录到清理队列待后续重试，
// 避免「先删文件后删库失败」造成的记录与文件不一致。
const fs = require('fs');
const path = require('path');

function cleanupQueueFile(uploadRoot) {
  return path.join(uploadRoot, '.cleanup-queue.json');
}

// 失败项写入清理队列（目录项带 type='dir'）
function enqueueCleanup(uploadRoot, failed) {
  if (failed.length === 0) return;
  console.warn('文件清理失败（已进入清理队列）:', failed.length);
  const queuePath = cleanupQueueFile(uploadRoot);
  try {
    let queue = [];
    try {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (e) { /* 队列文件不存在或损坏则重建 */ }
    queue.push(...failed);
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error('清理队列写入失败:', err.message);
  }
}

// 在 DB 事务提交后调用：尽力删除文件，失败进入清理队列
function removeFilesAfterCommit(filePaths, uploadRoot) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const failed = [];
  for (const p of filePaths) {
    if (!p) continue;
    try {
      fs.unlinkSync(p);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        failed.push({ path: p, error: err.message, at: new Date().toISOString() });
      }
    }
  }
  enqueueCleanup(uploadRoot, failed);
}

// 在 DB 事务提交后调用：尽力删除目录（递归），失败进入清理队列
function removeDirectoriesAfterCommit(dirPaths, uploadRoot) {
  if (!Array.isArray(dirPaths) || dirPaths.length === 0) return;
  const failed = [];
  for (const p of dirPaths) {
    if (!p) continue;
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        failed.push({ path: p, type: 'dir', error: err.message, at: new Date().toISOString() });
      }
    }
  }
  enqueueCleanup(uploadRoot, failed);
}

// 手动重试清理队列（部署/运维可调用）
function retryCleanupQueue(uploadRoot) {
  const queuePath = cleanupQueueFile(uploadRoot);
  let queue = [];
  try {
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (e) {
    return { retried: 0, failed: 0 };
  }
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.type === 'dir') {
        fs.rmSync(item.path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(item.path);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') remaining.push(item);
    }
  }
  fs.writeFileSync(queuePath, JSON.stringify(remaining, null, 2));
  return { retried: queue.length - remaining.length, failed: remaining.length };
}

module.exports = { removeFilesAfterCommit, removeDirectoriesAfterCommit, retryCleanupQueue };
