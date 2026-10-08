const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { spawnSync } = require('node:child_process');
const source = path.resolve(__dirname,'../../scripts/deploy-release.sh');
function bashPath() {
  if (process.platform !== 'win32') return 'bash';
  for (const executable of spawnSync('where.exe',['git'],{encoding:'utf8'}).stdout.trim().split(/\r?\n/)) {
    for (const file of [path.join(path.dirname(executable),'bash.exe'),path.resolve(path.dirname(executable),'../bin/bash.exe')]) if(fs.existsSync(file)) return file;
  }
  throw new Error('需要 Git Bash');
}
const bash = bashPath();
const sha = 'a'.repeat(40);

test('发布和两类备份脚本通过 Bash 语法检查', () => {
  for (const name of ['deploy-release.sh','backup-db.sh','backup-uploads.sh','install-cron.sh']) {
    const result=spawnSync(bash,['-n',path.resolve(__dirname,'../../scripts',name)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});

// 在工具边界模拟 Linux systemd/软链接；真实 tar 和健康 JSON 验证仍执行。
// 不访问系统服务、不在 /var/lib 写文件；不声称替代真实 Linux 恢复演练。
for (const failure of ['build','backup','health','none']) test(`发布模拟：${failure}`, (t) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pbl-atomic-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  for(const folder of ['repo','previous/backend','releases','data/uploads','data/private','template/backend','template/frontend','template/scripts']) fs.mkdirSync(path.join(dir,folder),{recursive:true});
  fs.copyFileSync(source,path.join(dir,'deploy.sh'));
  fs.writeFileSync(path.join(dir,'data/data.db'),'database remains external');
  fs.writeFileSync(path.join(dir,'backend.env'),'test-only');
  for(const script of ['backup-db.sh','backup-uploads.sh']) fs.writeFileSync(path.join(dir,'template/scripts',script),'#!/usr/bin/env bash\necho backup >> "$MOCK_LOG"\nif [[ "$MOCK_FAILURE" == backup ]]; then exit 1; fi\n');
  const mock=String.raw`
git() { case "$*" in *archive*) command tar -c -C "$MOCK_TEMPLATE" .;; *rev-parse*) printf '%s\n' "$MOCK_SHA";; *) return 0;; esac; }
npm() { echo "npm:$*" >> "$MOCK_LOG"; if [[ "$MOCK_FAILURE" == build && "$*" == 'run build' ]]; then return 1; fi; }
python() { return 0; }
flock() { return 0; }
node() {
  if [[ "$*" == *'for(const key of'* ]]; then printf '%s\n' "$DATA_ROOT/data.db" "$DATA_ROOT/uploads" "$DATA_ROOT/private";
  elif [[ "$*" == *'process.stdin.on'* ]]; then "$REAL_NODE" "$@";
  else return 0; fi
}
sqlite3() { local target; target=$(printf '%s' "$2" | command sed "s/^\\.backup '//;s/'$//"); command cp "$1" "$target"; }
systemctl() { echo "service:$1" >> "$MOCK_LOG"; if [[ "$1" == show ]]; then echo "$CURRENT_LINK/backend"; fi; }
curl() { if [[ "$MOCK_FAILURE" == health ]]; then return 22; fi; printf '{"status":"ok","database":"ready","release":"%s","schema_version":19}' "$MOCK_SHA"; }
sleep() { return 0; }
readlink() { if [[ "$2" == "$CURRENT_LINK" ]]; then command cat "$CURRENT_LINK"; else command readlink "$@"; fi; }
ln() { printf '%s\n' "$3" > "$4"; echo switch >> "$MOCK_LOG"; }
function [() { if [[ "$1" == '!' && "$2" == -L && "$3" == "$CURRENT_LINK" ]]; then return 1; elif [[ "$1" == -L && "$2" == "$CURRENT_LINK" ]]; then builtin [ -f "$CURRENT_LINK" ]; else builtin [ "$@"; fi; }
`;
  fs.writeFileSync(path.join(dir,'mock.sh'),mock);
  const result=spawnSync(bash,['-c',String.raw`
export APP_DIR="$PWD/repo" RELEASE_ROOT="$PWD/releases" CURRENT_LINK="$PWD/current" ENV_FILE="$PWD/backend.env" DATA_ROOT="$PWD/data"
export MOCK_TEMPLATE="$PWD/template" MOCK_LOG="$PWD/log" PYTHON=python SYSTEMCTL_SUDO=0
printf '%s\n' "$PWD/previous" > "$CURRENT_LINK"
exec bash deploy.sh main
`],{cwd:dir,encoding:'utf8',timeout:20000,env:{...process.env,BASH_ENV:path.join(dir,'mock.sh').replaceAll('\\','/'),MOCK_FAILURE:failure,MOCK_SHA:sha,REAL_NODE:process.execPath.replaceAll('\\','/')}});
  assert.ifError(result.error);
  const log=fs.existsSync(path.join(dir,'log')) ? fs.readFileSync(path.join(dir,'log'),'utf8') : '';
  const target=fs.readFileSync(path.join(dir,'current'),'utf8').trim();
  assert.equal(fs.readFileSync(path.join(dir,'data/data.db'),'utf8'),'database remains external');
  if(failure === 'none') { assert.equal(result.status,0,result.stdout+result.stderr); assert.match(target,new RegExp(sha)); assert.match(log,/service:start/); }
  else {
    assert.notEqual(result.status,0,result.stdout+result.stderr); assert.ok(target.endsWith('/previous'),target);
    if(failure === 'build') assert.equal(log.includes('service:stop'),false,'构建失败不停止旧服务');
    else assert.match(log,/service:restart/,'停止之后的故障必须重启旧版本');
    if(failure === 'health') assert.equal(log.split('\n').filter(l=>l==='switch').length,2,'先切换新版本再恢复旧链接');
    if(failure === 'backup') assert.equal(log.includes('switch'),false,'备份失败不得切换');
  }
});
