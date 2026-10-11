const { parentPort } = require('node:worker_threads');
const bcrypt = require('bcryptjs');
parentPort.on('message', ({ id, password }) => {
  try { parentPort.postMessage({ id, hash: bcrypt.hashSync(password, 10) }); }
  catch { parentPort.postMessage({ id, error: '密码哈希失败' }); }
});
