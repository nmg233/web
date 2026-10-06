const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const git = spawnSync('where.exe', ['git'], { encoding: 'utf8' });
  for (const executable of (git.stdout || '').trim().split(/\r?\n/)) {
    for (const candidate of [path.join(path.dirname(executable), 'bash.exe'),
      path.resolve(path.dirname(executable), '../bin/bash.exe')]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error('备份测试需要 Bash（Windows 可使用 Git Bash）');
}
const bash = findBash();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl backup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['scripts', 'backend', 'bin']) fs.mkdirSync(path.join(dir, sub));
  for (const script of ['backup-uploads.sh', 'install-cron.sh']) {
    fs.copyFileSync(path.join(root, 'scripts', script), path.join(dir, 'scripts', script));
  }
  fs.writeFileSync(path.join(dir, 'backend.env'), 'UPLOAD_PATH="upload files"\n');
  return dir;
}
function run(dir, command) {
  const result = spawnSync(bash, ['-c', command], {
    cwd: dir, env: { ...process.env, ENV_FILE: 'backend.env', BASH_ENV: '' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
test('上传目录不存在时报错并返回非零退出码', (t) => {
  const dir = fixture(t);
  const result = run(dir, 'bash scripts/backup-uploads.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /上传目录不存在/);
});
test('上传备份包含完整目录，保留最近七份且不删除其他备份', (t) => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'upload files/nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'upload files/nested/data.txt'), 'backup content');
  fs.mkdirSync(path.join(dir, 'backups'));
  for (let i = 1; i <= 8; i++) {
    fs.writeFileSync(path.join(dir, `backups/uploads-2020010${i}-020000.tar.gz`), 'old');
  }
  fs.writeFileSync(path.join(dir, 'backups/pre-deploy-old.db'), 'database');
  const result = run(dir, 'bash scripts/backup-uploads.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /备份完成.*uploads-\d{8}-\d{6}\.tar\.gz/);
  assert.match(result.stdout, /大小/);
  const files = fs.readdirSync(path.join(dir, 'backups')).filter(f => f.endsWith('.tar.gz')).sort();
  assert.equal(files.length, 7);
  assert.equal(files.includes('uploads-20200101-020000.tar.gz'), false);
  assert.equal(fs.existsSync(path.join(dir, 'backups/pre-deploy-old.db')), true);
  const extracted = run(dir, `tar -xOzf "backups/${files.at(-1)}" 'upload files/nested/data.txt'`);
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(extracted.stdout, 'backup content');
});
test('未配置 UPLOAD_PATH 时默认使用 uploads', (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, 'backend.env'), 'DB_PATH=data.db\n');
  fs.mkdirSync(path.join(dir, 'uploads'));
  const result = run(dir, 'bash scripts/backup-uploads.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1);
});
function mockCron(dir) {
  fs.writeFileSync(path.join(dir, 'bin/crontab'), `#!/usr/bin/env bash
if [ "$1" = -l ]; then
  if [ -f "$PWD/crontab.txt" ]; then cat "$PWD/crontab.txt"; else echo 'no crontab for tester' >&2; exit 1; fi
else
  cp "$1" "$PWD/crontab.txt"
fi
`, { mode: 0o755 });
}
const install = 'export PATH="$PWD/bin:$PATH"; chmod +x bin/crontab; bash scripts/install-cron.sh';
test('crontab 重复安装幂等，卸载保留用户任务', (t) => {
  const dir = fixture(t);
  mockCron(dir);
  const unrelated = '15 1 * * * echo unrelated\n';
  fs.writeFileSync(path.join(dir, 'crontab.txt'), unrelated);
  assert.equal(run(dir, install).status, 0);
  const first = fs.readFileSync(path.join(dir, 'crontab.txt'), 'utf8');
  const repeated = run(dir, install);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /任务已存在，跳过/);
  assert.equal(fs.readFileSync(path.join(dir, 'crontab.txt'), 'utf8'), first);
  assert.equal(first.split('\n').filter(line => line.includes('# pbl-platform-backup:')).length, 3);
  for (const schedule of ['0 2 * * *', '0 3 * * *', '0 4 * * 0']) assert.ok(first.includes(schedule));
  assert.ok(first.includes('/var/log/pbl-backup.log 2>&1'));
  assert.equal(run(dir, `${install} --uninstall`).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'crontab.txt'), 'utf8'), unrelated);
  assert.equal(run(dir, `${install} --uninstall`).status, 0);
});
test('首次安装允许尚无 crontab，但拒绝读取权限错误', (t) => {
  const dir = fixture(t);
  mockCron(dir);
  assert.equal(run(dir, install).status, 0);
  fs.writeFileSync(path.join(dir, 'bin/crontab'), '#!/usr/bin/env bash\necho "permission denied" >&2\nexit 1\n');
  const result = run(dir, install);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /无法读取当前用户 crontab/);
});
test('tar 失败时报告原因并清理不完整备份', (t) => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'upload files'));
  fs.writeFileSync(path.join(dir, 'bin/tar'), '#!/usr/bin/env bash\necho "tar: simulated failure" >&2\nexit 2\n', { mode: 0o755 });
  const result = run(dir, 'export PATH="$PWD/bin:$PATH"; chmod +x bin/tar; bash scripts/backup-uploads.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /simulated failure/);
  assert.match(result.stderr, /上传备份失败/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'backups')), []);
});
test('生成的每周任务正确处理路径空格，从 backend 依次执行两种备份', (t) => {
  const dir = fixture(t);
  mockCron(dir);
  for (const name of ['db', 'uploads']) {
    fs.writeFileSync(path.join(dir, `scripts/backup-${name}.sh`),
      `#!/usr/bin/env bash\necho "${name}:$(basename "$PWD")"\n`);
  }
  assert.equal(run(dir, install).status, 0);
  const cron = fs.readFileSync(path.join(dir, 'crontab.txt'), 'utf8');
  const full = cron.split('\n').find(line => line.endsWith('# pbl-platform-backup:full'));
  const command = full.replace(/^0 4 \* \* 0 /, '').replace('/var/log/pbl-backup.log', 'cron.log');
  const result = run(dir, command);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'cron.log'), 'utf8'), 'db:backend\nuploads:backend\n');
});
