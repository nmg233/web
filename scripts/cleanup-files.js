#!/usr/bin/env node
// 文件清理队列重试：消费 uploads/.cleanup-queue.json 中积压的失败项（文件与目录）。
// 用法：
//   node scripts/cleanup-files.js [上传目录]
//   未传目录时依次取 UPLOAD_PATH 环境变量、默认 backend/uploads。
// 退出码：0=全部成功或队列为空；2=仍有失败项（部署/定时任务可据此告警）。
const path = require('path');
const { retryCleanupQueue } = require('../backend/helpers/fileLifecycle');

const uploadRoot = process.argv[2]
  || process.env.UPLOAD_PATH
  || path.resolve(__dirname, '..', 'backend', 'uploads');

const result = retryCleanupQueue(uploadRoot);
console.log(`[cleanup-files] 目录：${uploadRoot}`);
console.log(`[cleanup-files] 重试成功：${result.retried}，仍失败：${result.failed}`);
process.exit(result.failed > 0 ? 2 : 0);
