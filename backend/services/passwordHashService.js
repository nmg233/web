const { Worker } = require('node:worker_threads');
const path = require('node:path');
let worker, next = 0;
const pending = new Map();
function hashPassword(password) {
  if (!worker) {
    const current = new Worker(path.join(__dirname, 'passwordHashWorker.js'));
    worker = current;
    current.on('message', ({ id, hash, error }) => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (error) job.reject(new Error(error)); else job.resolve(hash);
      if (!pending.size) current.unref();
    });
    const fail = () => {
      if (worker !== current) return;
      worker = null;
      for (const job of pending.values()) job.reject(new Error('密码计算任务中断，请重试'));
      pending.clear();
    };
    current.on('error', fail); current.on('exit', fail); current.unref();
  }
  return new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    worker.ref(); worker.postMessage({ id, password });
  });
}
module.exports = { hashPassword };
