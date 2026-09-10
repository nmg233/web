// Local development only: run the existing npm scripts with their normal working directories.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  for (const child of children) {
    if (!child.pid) continue;
    // Kill only trees started by this launcher, never all node processes.
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', data => {
    if (data.includes(3) || data.toString().trim().toLowerCase() === 'q') stop();
  });
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`端口 ${port} 已被占用。请先停止原来的开发服务，再运行本脚本。`)));
    server.listen(port, () => server.close(resolve));
  });
}

async function main() {
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(npm)) throw new Error('未找到 npm，请安装包含 npm 的 Node.js LTS。');
  for (const dir of ['backend', 'frontend']) {
    if (!fs.existsSync(path.join(root, dir, 'node_modules'))) {
      throw new Error(`请先按照 README 在 ${dir} 目录执行 npm install。`);
    }
  }
  const dotenv = require(path.join(root, 'backend/node_modules/dotenv'));
  const envFile = path.join(root, 'backend/.env');
  const config = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const port = process.env.PORT || config.PORT || '3000';
  if (String(port) !== '3000') throw new Error('本脚本配合现有前端代理使用后端 3000 端口，请检查 PORT 配置。');
  if ((process.env.NODE_ENV || config.NODE_ENV) === 'production') throw new Error('本脚本仅用于本地开发，不能在 production 环境运行。');
  await checkPort(3000);
  await checkPort(5173);
  if (process.argv.includes('--check')) {
    console.log('检查通过：Node/npm、依赖和默认端口可用。未启动服务。');
    stop();
  }
  for (const dir of ['backend', 'frontend']) {
    const args = [npm, 'run', 'dev'];
    if (dir === 'frontend') args.push('--', '--port', '5173', '--strictPort');
    const child = spawn(process.execPath, args, {
      cwd: path.join(root, dir), stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH },
    });
    children.push(child);
    child.on('error', err => { console.error(err.message); stop(1); });
    child.on('exit', code => { if (!stopping) { console.error(`${dir} 已退出 (${code})，停止本次启动的服务。`); stop(1); } });
  }
  console.log('\n前后端正在启动；在此窗口按 Ctrl+C 或 Q 可一起停止。');
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const responses = await Promise.all([
        fetch('http://localhost:5173/', { signal: AbortSignal.timeout(1500) }),
        fetch('http://localhost:5173/api/health', { signal: AbortSignal.timeout(1500) }),
      ]);
      if (responses.every(r => r.ok)) {
        console.log('\n启动成功，请打开 http://localhost:5173/login\n');
        return;
      }
    } catch { /* wait for Vite and backend */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('启动超时，请查看上方前后端错误日志。');
}
main().catch(err => { console.error(`\n启动失败：${err.message}`); stop(1); });
