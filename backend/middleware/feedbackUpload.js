const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const configuredFeedbackPath = process.env.FEEDBACK_UPLOAD_PATH;
const FEEDBACK_UPLOAD_ROOT = configuredFeedbackPath
  ? path.resolve(configuredFeedbackPath)
  : path.resolve(__dirname, '..', 'private_uploads', 'feedback');
const allowedTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.pdf', 'application/pdf'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    try {
      fs.mkdirSync(FEEDBACK_UPLOAD_ROOT, { recursive: true });
      callback(null, FEEDBACK_UPLOAD_ROOT);
    } catch (err) {
      callback(err);
    }
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `feedback-${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

function fileFilter(_req, file, callback) {
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = allowedTypes.get(ext);
  if (!expectedMime || file.mimetype !== expectedMime) {
    return callback(new Error('反馈附件仅支持 PNG、JPG、WEBP 和 PDF'));
  }
  callback(null, true);
}

const uploadFeedbackAttachments = multer({
  storage,
  fileFilter,
  limits: {
    files: 3,
    fileSize: 10 * 1024 * 1024,
  },
});

function removeFiles(files = []) {
  files.forEach((file) => {
    if (!file?.path) return;
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('清理反馈附件失败:', err);
    }
  });
}

module.exports = {
  FEEDBACK_UPLOAD_ROOT,
  uploadFeedbackAttachments,
  removeFiles,
};
