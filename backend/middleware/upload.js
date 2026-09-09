const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const UPLOAD_ROOT = path.resolve(__dirname, '..', process.env.UPLOAD_PATH || 'uploads');

const allowedExtensions = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.webm',
  '.pdf',
  '.doc', '.docx', '.ppt', '.pptx',
  '.zip',
  '.obj', '.glb', '.gltf', '.stl'
]);

const expectedMimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.obj': 'model/obj',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.stl': 'model/stl'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function randomName(prefix) {
  return prefix + '-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex');
}

function makeStorage(prefix, subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, subdir);
      try {
        ensureDir(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, randomName(prefix) + ext);
    }
  });
}

// 关键格式魔数校验（FILE-01/E-5）：只信扩展名与 MIME 不足以防伪造
const MAGIC_CHECKED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.zip', '.doc', '.docx', '.ppt', '.pptx']);
const MAGIC_CHECK = {
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  '.gif': (b) => b.toString('ascii', 0, 4) === 'GIF8',
  '.webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  '.pdf': (b) => b.toString('ascii', 0, 4) === '%PDF',
  '.mp4': (b) => b.length > 11 && b.toString('ascii', 4, 8) === 'ftyp',
  '.webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  '.zip': (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  '.docx': (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03,
  '.pptx': (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03,
  '.doc': (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  '.ppt': (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
};

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.has(ext)) {
    const err = new Error('Unsupported file type: ' + (file.originalname || file.mimetype));
    err.status = 400;
    return cb(err, false);
  }

  const expected = expectedMimeTypes[ext];
  if (expected && file.mimetype !== expected && file.mimetype !== 'application/octet-stream') {
    const err = new Error('Unsupported MIME type for ' + ext + ': ' + file.mimetype);
    err.status = 400;
    return cb(err, false);
  }

  if (!MAGIC_CHECKED_EXT.has(ext)) {
    return cb(null, true);
  }

  // 读取文件头（最多 16 字节）做魔数校验，读完后 unshift 回流传给 multer 继续处理
  const checker = MAGIC_CHECK[ext];
  let head = Buffer.alloc(0);
  let handled = false;
  const done = (ok, message) => {
    if (handled) return;
    handled = true;
    file.stream.removeListener('data', onData);
    file.stream.removeListener('end', onEnd);
    file.stream.removeListener('error', onErr);
    if (ok) return cb(null, true);
    const err = new Error(message);
    err.status = 400;
    cb(err, false);
  };
  const onData = (chunk) => {
    head = Buffer.concat([head, chunk]);
    if (head.length >= 16) {
      file.stream.unshift(head);
      done(checker(head), `文件内容与扩展名不符（${ext}）`);
    }
  };
  const onEnd = () => {
    done(checker(head), `文件过小或无法读取文件头（${ext}）`);
  };
  const onErr = () => done(false, `读取文件失败（${ext}）`);
  file.stream.on('data', onData);
  file.stream.on('end', onEnd);
  file.stream.on('error', onErr);
}

const uploadWork = multer({
  storage: makeStorage('work', 'works'),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadResource = multer({
  storage: makeStorage('resource', 'resources'),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const uploadReplay = multer({
  storage: makeStorage('replay', 'course-replays'),
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }
});

// 批量导入用：内存存储，接收 .csv / .xlsx / .xls
const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = { uploadWork, uploadResource, uploadReplay, uploadImport, UPLOAD_ROOT };
