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

  // Multer v2 的 fileFilter 阶段不再提供 file.stream；签名校验统一在文件
  // 落盘后执行，避免访问不存在的流导致所有附件请求返回 500。
  return cb(null, true);
}

function removeFile(file) {
  if (file?.path) {
    try { fs.unlinkSync(file.path); } catch (err) { /* 清理失败由后续任务处理 */ }
  }
}

function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files || {}).flat();
}

// 关键格式魔数校验改在落盘后进行，适用于作品、课程资料及课程回放的全部上传入口。
function validateUploadedFiles(req, _res, next) {
  try {
    for (const file of uploadedFiles(req)) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!MAGIC_CHECKED_EXT.has(ext)) continue;
      const head = fs.readFileSync(file.path).subarray(0, 16);
      if (!MAGIC_CHECK[ext](head)) {
        removeFile(file);
        const err = new Error(`文件内容与扩展名不符（${ext}）`);
        err.status = 400;
        return next(err);
      }
    }
    return next();
  } catch (cause) {
    for (const file of uploadedFiles(req)) removeFile(file);
    const err = new Error('读取上传文件失败');
    err.status = 400;
    return next(err);
  }
}

const uploadWork = multer({
  storage: makeStorage('work', 'works'),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadResource = multer({
  storage: makeStorage('resource', 'resources'),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.txt') {
      if (file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream') return cb(null, true);
      return cb(Object.assign(new Error('TXT 文件类型无效'), { status: 400 }), false);
    }
    return fileFilter(req, file, cb);
  },
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

module.exports = { uploadWork, uploadResource, uploadReplay, uploadImport, validateUploadedFiles, UPLOAD_ROOT };
