#!/usr/bin/env node
// 文件清理队列重试：消费 uploads/.cleanup-queue.json 中积压的失败项（文件与目录）。
// 用法：
//   node scripts/cleanup-files.js [上传目录]
//   未传目录时依次取 UPLOAD_PATH 环境变量、默认 backend/uploads。
// 退出码：0=全部成功或队列为空；2=仍有失败项（部署/定时任务可据此告警）。
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const { retryCleanupQueue } = require('../backend/helpers/fileLifecycle');

const uploadRoot = process.argv[2]
  || process.env.UPLOAD_PATH
  || path.resolve(__dirname, '..', 'backend', 'uploads');

let db;
const queue=path.join(uploadRoot,'.cleanup-queue.json');
if(fs.existsSync(queue)&&fs.readFileSync(queue,'utf8').trim()!=='[]'){
 if(!process.env.DB_PATH){console.error('非空清理队列须指定 DB_PATH，才能保护历史教材引用');process.exit(2);}
 const Database=require('../backend/node_modules/better-sqlite3');
 db=new Database(process.env.DB_PATH,{readonly:true,fileMustExist:true});
}
const result = retryCleanupQueue(uploadRoot,{isReferenced:db?require('../backend/helpers/fileReferenceProtection').checker(db):undefined});
db?.close();
console.log(`[cleanup-files] 目录：${uploadRoot}`);
console.log(`[cleanup-files] 重试成功：${result.retried}，仍失败：${result.failed}`);
process.exit(result.failed > 0 ? 2 : 0);
