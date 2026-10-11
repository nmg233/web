const fs = require('node:fs');
const crypto = require('node:crypto');

// 流式校验文件内容，避免相同文件名/大小但不同字节被当成同一重试；不整文件读入内存。
module.exports = async function uploadFingerprint(req, _res, next) {
  const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
  try {
    await Promise.all(files.map(async (file) => {
      const hash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(file.path)) hash.update(chunk);
      file.content_sha256 = hash.digest('hex');
    }));
    next();
  } catch {
    await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch((err) => {
      if (err.code !== 'ENOENT') console.error('失败上传文件清理失败:', err.message);
    })));
    next(Object.assign(new Error('上传文件内容校验失败，请重新上传'), {status:400}));
  }
};
