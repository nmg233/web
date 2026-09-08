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

  cb(null, true);
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
