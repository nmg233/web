// 本地启动包装；沿用原后端业务并包含新版课程空间适配，仅绑定回环地址。
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
process.chdir(path.join(root, 'backend'));
const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
if (!process.env.GLIDER_PYTHON && fs.existsSync(python)) {
  process.env.GLIDER_PYTHON = python;
  process.env.GLIDER_BACKEND = process.env.GLIDER_BACKEND || 'reference';
}
const port = Number(process.env.PORT || 3000);
require('../backend/app').listen(port, '127.0.0.1', () => {
  console.log(`本地 API：http://127.0.0.1:${port}/api；使用本地测试数据库，非生产服务。`);
  console.log(`仿真后端配置：${process.env.GLIDER_BACKEND || '沿用原项目默认值'}`);
});
