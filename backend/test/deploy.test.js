const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
// Windows 使用 Git 随附的 Bash，避免误用尚未配置的 WSL Bash。
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const git = spawnSync('where.exe', ['git'], { encoding: 'utf8' });
  for (const executable of (git.stdout || '').trim().split(/\r?\n/)) {
    const candidate = path.join(path.dirname(executable), 'bash.exe');
    if (fs.existsSync(candidate)) return candidate;
    const bin = path.resolve(path.dirname(executable), '../bin/bash.exe');
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error('部署脚本测试需要安装 Bash（Windows 可使用 Git Bash）');
}

const bash = findBash();

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-deploy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.mkdirSync(path.join(dir, 'backend'));
  for (const file of ['deploy.sh', 'scripts/backup-db.sh']) {
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, 'scripts/doctor.sh'), '#!/usr/bin/env bash\necho doctor-ok\n');
  fs.writeFileSync(path.join(dir, 'backend.env'), 'DB_PATH=missing.db\n');
  for (const command of ['git', 'npm']) {
    fs.writeFileSync(path.join(dir, 'bin', command),
      `#!/usr/bin/env bash\necho '${command}' >> "$APP_DIR/downstream.log"\nexit 0\n`, { mode: 0o755 });
  }
  return dir;
}

function run(dir, args) {
  const result = spawnSync(bash, args, {
    cwd: dir,
    env: { ...process.env, APP_DIR: '.', ENV_FILE: 'backend.env', BASH_ENV: '', RESET_DB: '0' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test('数据库不存在时 backup-db.sh 返回退出码 1', (t) => {
  const dir = fixture(t);
  const result = run(dir, ['scripts/backup-db.sh', 'missing.db']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /数据库不存在/);
  assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
});

test('deploy.sh 在真实数据库备份失败后停止，不执行 git 或 npm', (t) => {
  const dir = fixture(t);
  const result = run(dir, ['-c', 'export PATH="$PWD/bin:$PATH"; chmod +x bin/git bin/npm; exec bash deploy.sh']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /doctor-ok/);
  assert.match(result.stdout, /数据库不存在/);
  assert.equal(fs.existsSync(path.join(dir, 'downstream.log')), false,
    '备份失败后不应调用 git fetch 或 npm ci');
});
